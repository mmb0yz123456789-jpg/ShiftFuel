const Stripe = require('stripe');
const { setCorsHeaders, getSupabaseAdmin, verifyAnyStaffToken } = require('./_auth');

module.exports = async (req, res) => {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { payment_intent_id, request_id, amount_cents, caller_token } = req.body || {};

  // ── Auth ──────────────────────────────────────────────────────────────────
  if (!caller_token) {
    return res.status(401).json({ error: 'Authorization required' });
  }
  const authorized = await verifyAnyStaffToken(caller_token);
  if (!authorized) {
    return res.status(403).json({ error: 'Session expired or invalid. Please log in again.' });
  }

  // ── Input validation ──────────────────────────────────────────────────────
  if (!payment_intent_id || !request_id) {
    return res.status(400).json({ error: 'payment_intent_id and request_id are required' });
  }

  try {
    const db = getSupabaseAdmin();

    // ── Verify ownership: PI must match the request ───────────────────────
    const { data: request, error: reqErr } = await db
      .from('service_requests')
      .select('id, payment_intent_id, payment_status, status')
      .eq('id', request_id)
      .maybeSingle();

    if (reqErr || !request) {
      console.error('[capture-payment] Request lookup failed:', reqErr?.message);
      return res.status(404).json({ error: 'Request not found' });
    }

    if (request.payment_intent_id !== payment_intent_id) {
      console.warn('[capture-payment] PI mismatch for request', request_id);
      return res.status(403).json({ error: 'Payment intent does not match this request' });
    }

    // ── Idempotency: do not capture an already-captured payment ──────────
    if (request.payment_status === 'captured') {
      console.log('[capture-payment] Already captured for request', request_id);
      return res.status(200).json({ status: 'succeeded', already_captured: true });
    }

    if (request.payment_status !== 'authorized') {
      console.warn('[capture-payment] Unexpected payment_status:', request.payment_status, 'for request', request_id);
      return res.status(400).json({ error: 'Payment is not in an authorized state' });
    }

    // ── Stripe capture ────────────────────────────────────────────────────
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const captureParams = {};
    if (amount_cents && amount_cents >= 50) {
      captureParams.amount_to_capture = Math.round(amount_cents);
    }

    const intent = await stripe.paymentIntents.capture(payment_intent_id, captureParams);
    console.log('[capture-payment] Captured', intent.id, 'status:', intent.status, 'for request', request_id);

    return res.status(200).json({ status: intent.status, amount_captured: intent.amount_captured });
  } catch (err) {
    console.error('[capture-payment] Error:', err.message);
    if (err.code === 'payment_intent_unexpected_state') {
      return res.status(200).json({ status: 'already_finalized' });
    }
    return res.status(500).json({ error: 'Payment capture failed. Please try again.' });
  }
};
