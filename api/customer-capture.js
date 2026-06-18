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
    amount_cents,
    new_payment_intent_id, // supplied only when customer paid with a new card (case B)
  } = req.body || {};

  // ── Input validation ──────────────────────────────────────────────────────
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
    .select('id, customer_phone, customer_email, payment_intent_id, payment_status, status, final_total, customer_name')
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

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  // ── Case B: customer paid with a new card ─────────────────────────────────
  if (new_payment_intent_id) {
    try {
      const intent = await stripe.paymentIntents.retrieve(new_payment_intent_id);
      if (intent.status !== 'succeeded') {
        return res.status(400).json({ error: 'Payment was not confirmed. Please try again.' });
      }

      // Save the new PI and mark complete.
      await db.from('service_requests').update({
        payment_intent_id: new_payment_intent_id,
        payment_status: 'captured',
        status: 'complete',
        updated_at: new Date().toISOString(),
      }).eq('id', request_id);

      console.log('[customer-capture] New card payment succeeded for request', request_id);
      return res.status(200).json({ status: 'succeeded' });
    } catch (err) {
      console.error('[customer-capture] New PI verification failed:', err.message);
      return res.status(500).json({ error: 'Payment verification failed. Please try again.' });
    }
  }

  // ── Case A: capture the existing pre-authorized PaymentIntent ─────────────
  const piId = request.payment_intent_id;
  if (!piId) {
    return res.status(400).json({ error: 'No payment authorization found for this request' });
  }

  try {
    const captureParams = {};
    if (amount_cents && amount_cents >= 50) {
      captureParams.amount_to_capture = Math.round(amount_cents);
    } else if (request.final_total != null) {
      captureParams.amount_to_capture = Math.round(request.final_total * 100);
    }

    const intent = await stripe.paymentIntents.capture(piId, captureParams);
    console.log('[customer-capture] Captured', intent.id, 'status:', intent.status, 'for request', request_id);

    await markComplete(db, request_id, piId);
    return res.status(200).json({ status: intent.status, amount_captured: intent.amount_captured });
  } catch (err) {
    console.error('[customer-capture] Stripe error:', err.message);
    if (err.code === 'payment_intent_unexpected_state') {
      // PI may have already been captured (e.g., double-click). Check and recover.
      try {
        const intent = await stripe.paymentIntents.retrieve(piId);
        if (intent.status === 'succeeded') {
          await markComplete(db, request_id, piId);
          return res.status(200).json({ status: 'succeeded', already_captured: true });
        }
      } catch {}
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
  if (error) console.error('[customer-capture] markComplete DB error:', error.message);
}
