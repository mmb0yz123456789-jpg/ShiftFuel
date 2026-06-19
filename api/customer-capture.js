const Stripe = require('stripe');
const { setCorsHeaders, getSupabaseAdmin } = require('./_auth');

function cleanPhone(value) {
  return String(value || '').replace(/\D/g, '');
}


module.exports = async (req, res) => {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    request_id,
    phone,
    email,
    new_payment_intent_id, // supplied only when customer paid with a new card (case B)
  } = req.body || {};

  if (!request_id || !phone || !email) {
    return res.status(400).json({ error: 'request_id, phone, and email are required' });
  }

  let db;
  try {
    db = getSupabaseAdmin();
  } catch {
    return res.status(500).json({ error: 'Service configuration error' });
  }

  // ── Verify identity: phone+email must match the request ───────────────────
  const { data: request, error: reqErr } = await db
    .from('service_requests')
    .select('id, customer_phone, customer_email, customer_name, payment_intent_id, payment_status, status, final_total')
    .eq('id', request_id)
    .maybeSingle();

  if (reqErr || !request) {
    console.error('[customer-capture] Request lookup failed:', reqErr?.message);
    return res.status(404).json({ error: 'Request not found' });
  }

  const phoneMatch = cleanPhone(request.customer_phone) === cleanPhone(phone);
  const emailMatch = (request.customer_email || '').toLowerCase() === (email || '').toLowerCase();

  if (!phoneMatch || !emailMatch) {
    console.warn('[customer-capture] Identity mismatch for request', request_id);
    return res.status(403).json({ error: 'Your phone and email do not match this request' });
  }

  // ── Status check: only allow payment on pending_customer_payment ──────────
  if (request.status !== 'pending_customer_payment') {
    if (request.status === 'complete' && request.payment_status === 'captured') {
      return res.status(200).json({ status: 'already_complete' });
    }
    return res.status(400).json({ error: 'This request is not awaiting customer payment' });
  }

  // ── Already captured: idempotent success ─────────────────────────────────
  if (request.payment_status === 'captured' && !new_payment_intent_id) {
    console.log('[customer-capture] Already captured, marking complete:', request_id);
    await markComplete(db, request_id, request.payment_intent_id);
    return res.status(200).json({ status: 'succeeded', already_captured: true });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Payment service not configured' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  // ── Case B: customer paid with a new card ─────────────────────────────────
  if (new_payment_intent_id) {
    try {
      const intent = await stripe.paymentIntents.retrieve(new_payment_intent_id);

      if (intent.status !== 'succeeded') {
        return res.status(400).json({ error: 'Payment was not confirmed. Please try again.' });
      }

      if (intent.currency !== 'usd') {
        console.error('[customer-capture] Case B currency mismatch:', intent.currency);
        return res.status(400).json({ error: 'Payment currency mismatch. Please contact ShiftFuel.' });
      }

      if (request.final_total == null) {
        return res.status(400).json({ error: 'Final total is not set. Please contact ShiftFuel.' });
      }

      const expectedCents = Math.round(request.final_total * 100);
      if (intent.amount !== expectedCents) {
        console.error('[customer-capture] Case B amount mismatch: expected', expectedCents, 'got', intent.amount);
        return res.status(400).json({ error: 'Payment amount does not match the final total. Please contact ShiftFuel.' });
      }

      // Verify metadata.request_id if present (set by create-customer-final-payment)
      if (intent.metadata?.request_id && String(intent.metadata.request_id) !== String(request_id)) {
        console.error('[customer-capture] Case B metadata request_id mismatch');
        return res.status(400).json({ error: 'Payment reference mismatch. Please contact ShiftFuel.' });
      }

      // Verify PI not already used for a different request
      const { data: existingUse } = await db
        .from('service_requests')
        .select('id')
        .eq('payment_intent_id', new_payment_intent_id)
        .neq('id', request_id)
        .maybeSingle();
      if (existingUse) {
        console.error('[customer-capture] Case B PI already used for request', existingUse.id);
        return res.status(400).json({ error: 'This payment has already been applied to another request. Please contact ShiftFuel.' });
      }

      await markComplete(db, request_id, new_payment_intent_id);

      console.log('[customer-capture] New card payment succeeded for request', request_id);
      return res.status(200).json({ status: 'succeeded' });
    } catch (err) {
      if (err.message === 'DB_UPDATE_FAILED') {
        return res.status(500).json({
          error: `Payment was processed, but we could not update your request. Please contact ShiftFuel and reference request ${request_id}.`,
        });
      }
      console.error('[customer-capture] New PI verification failed:', err.message);
      return res.status(500).json({ error: 'Payment verification failed. Please try again.' });
    }
  }

  // ── Case A: capture the existing pre-authorized PaymentIntent ─────────────
  const piId = request.payment_intent_id;
  if (!piId) {
    return res.status(400).json({ error: 'No payment authorization found for this request' });
  }

  if (request.final_total == null) {
    return res.status(400).json({ error: 'Final total is not set. Please contact ShiftFuel.' });
  }

  const amountToCaptureInCents = Math.round(request.final_total * 100);

  try {
    // Pre-flight: verify PI state and capturable amount before attempting capture
    const intentCheck = await stripe.paymentIntents.retrieve(piId);

    if (intentCheck.status === 'succeeded') {
      // Already captured — idempotent path
      await markComplete(db, request_id, piId);
      return res.status(200).json({ status: 'succeeded', already_captured: true });
    }

    if (intentCheck.status !== 'requires_capture') {
      console.error('[customer-capture] Case A PI in unexpected state:', intentCheck.status);
      return res.status(400).json({ error: 'Payment authorization is no longer valid. Please contact ShiftFuel.' });
    }

    if (intentCheck.amount_capturable < amountToCaptureInCents) {
      console.error('[customer-capture] Case A: amount_capturable', intentCheck.amount_capturable, '< needed', amountToCaptureInCents);
      return res.status(400).json({ error: 'The authorized amount is less than the final total. Please contact ShiftFuel.' });
    }

    const intent = await stripe.paymentIntents.capture(piId, {
      amount_to_capture: amountToCaptureInCents,
    });
    console.log('[customer-capture] Captured', intent.id, 'status:', intent.status, 'for request', request_id);

    await markComplete(db, request_id, piId);
    return res.status(200).json({ status: intent.status, amount_captured: intent.amount_captured });
  } catch (err) {
    if (err.message === 'DB_UPDATE_FAILED') {
      return res.status(500).json({
        error: `Payment was processed, but we could not update your request. Please contact ShiftFuel and reference request ${request_id}.`,
      });
    }
    console.error('[customer-capture] Stripe error:', err.message);
    if (err.code === 'payment_intent_unexpected_state') {
      try {
        const intent = await stripe.paymentIntents.retrieve(piId);
        if (intent.status === 'succeeded') {
          await markComplete(db, request_id, piId);
          return res.status(200).json({ status: 'succeeded', already_captured: true });
        }
      } catch (innerErr) {
        if (innerErr.message === 'DB_UPDATE_FAILED') {
          return res.status(500).json({
            error: `Payment was processed, but we could not update your request. Please contact ShiftFuel and reference request ${request_id}.`,
          });
        }
      }
      return res.status(400).json({ error: 'Payment could not be processed. Please contact ShiftFuel.' });
    }
    return res.status(500).json({ error: 'Payment capture failed. Please try again.' });
  }
};

async function markComplete(db, requestId, paymentIntentId) {
  const { error } = await db.from('service_requests').update({
    status: 'complete',
    payment_status: 'captured',
    payment_intent_id: paymentIntentId,
    updated_at: new Date().toISOString(),
  }).eq('id', requestId);

  if (error) {
    // Log full detail for admin recovery — request ID and PI ID are critical here.
    console.error('[customer-capture] CRITICAL: markComplete DB error for request', requestId, 'PI', paymentIntentId, '—', error.message);
    throw new Error('DB_UPDATE_FAILED');
  }
}
