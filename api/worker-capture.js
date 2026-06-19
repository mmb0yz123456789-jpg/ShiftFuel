const Stripe = require('stripe');
const { setCorsHeaders, getSupabaseAdmin, verifyWorkerToken } = require('./_auth');

module.exports = async (req, res) => {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { worker_token, request_id } = req.body || {};

  if (!worker_token || !request_id) {
    return res.status(400).json({ error: 'worker_token and request_id are required' });
  }

  let db;
  try {
    db = getSupabaseAdmin();
  } catch {
    return res.status(500).json({ error: 'Service configuration error' });
  }

  // Verify worker session via shared helper.
  const employeeId = await verifyWorkerToken(worker_token);
  if (!employeeId) {
    return res.status(401).json({ error: 'Invalid or expired worker session' });
  }

  // Load the request.
  const { data: request, error: reqErr } = await db
    .from('service_requests')
    .select('id, payment_intent_id, payment_status, status, final_total')
    .eq('id', request_id)
    .maybeSingle();

  if (reqErr || !request) {
    return res.status(404).json({ error: 'Request not found' });
  }

  if (!request.payment_intent_id) {
    return res.status(400).json({ error: 'No payment authorization found for this request' });
  }

  // Idempotent: already captured.
  if (request.payment_status === 'captured') {
    await markComplete(db, request_id, request.payment_intent_id);
    return res.status(200).json({ status: 'succeeded', already_captured: true });
  }

  if (request.final_total == null || request.final_total <= 0) {
    return res.status(400).json({ error: 'Final total is not set. Enter receipt amounts before completing.' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Payment service not configured' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const piId = request.payment_intent_id;
  const amountToCaptureInCents = Math.round(request.final_total * 100);

  try {
    const intent = await stripe.paymentIntents.retrieve(piId);

    // Already succeeded — mark complete and return.
    if (intent.status === 'succeeded') {
      await markComplete(db, request_id, piId);
      return res.status(200).json({ status: 'succeeded', already_captured: true });
    }

    if (intent.status !== 'requires_capture') {
      await flagCaptureFailed(db, request_id);
      return res.status(400).json({
        capture_failed: true,
        error: 'Payment authorization has expired or is no longer valid. The customer will need to provide a new payment method.',
      });
    }

    if (intent.amount_capturable < amountToCaptureInCents) {
      await flagCaptureFailed(db, request_id);
      return res.status(400).json({
        capture_failed: true,
        error: `The authorized amount ($${(intent.amount_capturable / 100).toFixed(2)}) is less than the final total ($${request.final_total.toFixed(2)}). The customer will need to pay the difference.`,
      });
    }

    const captured = await stripe.paymentIntents.capture(piId, {
      amount_to_capture: amountToCaptureInCents,
    });

    console.log('[worker-capture] Captured', captured.id, 'status:', captured.status, 'for request', request_id);
    await markComplete(db, request_id, piId);
    return res.status(200).json({ status: captured.status, amount_captured: captured.amount_captured });

  } catch (err) {
    if (err.message === 'DB_UPDATE_FAILED') {
      return res.status(500).json({
        error: `Payment was captured but we could not update the request. Contact ShiftFuel support and reference request ${request_id}.`,
      });
    }

    console.error('[worker-capture] Stripe error:', err.message);

    // Handle race: PI already captured in Stripe but we hit an unexpected state.
    if (err.code === 'payment_intent_unexpected_state') {
      try {
        const check = await stripe.paymentIntents.retrieve(piId);
        if (check.status === 'succeeded') {
          await markComplete(db, request_id, piId);
          return res.status(200).json({ status: 'succeeded', already_captured: true });
        }
      } catch (_) { /* fall through */ }
    }

    await flagCaptureFailed(db, request_id).catch(() => {});
    return res.status(500).json({
      capture_failed: true,
      error: 'Payment capture failed. The customer will be prompted to update their payment method.',
    });
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
    console.error('[worker-capture] markComplete failed for request', requestId, '—', error.message);
    throw new Error('DB_UPDATE_FAILED');
  }
}

async function flagCaptureFailed(db, requestId) {
  const { error } = await db.from('service_requests').update({
    payment_status: 'capture_failed',
    status: 'pending_customer_payment',
    updated_at: new Date().toISOString(),
  }).eq('id', requestId);

  if (error) {
    console.error('[worker-capture] flagCaptureFailed failed for request', requestId, '—', error.message);
  }
}
