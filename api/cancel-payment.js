const Stripe = require('stripe');
const { setCorsHeaders, getSupabaseAdmin, verifyAnyStaffToken } = require('./_auth');

module.exports = async (req, res) => {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { payment_intent_id, request_id, caller_token } = req.body || {};

  // ── Auth ──────────────────────────────────────────────────────────────────
  if (!caller_token) {
    return res.status(401).json({ error: 'Authorization required' });
  }
  const authorized = await verifyAnyStaffToken(caller_token);
  if (!authorized) {
    return res.status(403).json({ error: 'Session expired or invalid. Please log in again.' });
  }

  if (!payment_intent_id || !request_id) {
    return res.status(400).json({ error: 'payment_intent_id and request_id are required' });
  }

  try {
    const db = getSupabaseAdmin();

    // ── Verify ownership ──────────────────────────────────────────────────
    const { data: request, error: reqErr } = await db
      .from('service_requests')
      .select('id, payment_intent_id, payment_status, status')
      .eq('id', request_id)
      .maybeSingle();

    if (reqErr || !request) {
      console.error('[cancel-payment] Request lookup failed:', reqErr?.message);
      return res.status(404).json({ error: 'Request not found' });
    }

    if (request.payment_intent_id !== payment_intent_id) {
      console.warn('[cancel-payment] PI mismatch for request', request_id);
      return res.status(403).json({ error: 'Payment intent does not match this request' });
    }

    // Do not cancel an already-captured payment — that requires a refund.
    if (request.payment_status === 'captured') {
      return res.status(400).json({ error: 'Payment has already been captured. Use refund instead.' });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const intent = await stripe.paymentIntents.cancel(payment_intent_id);
    console.log('[cancel-payment] Canceled', intent.id, 'for request', request_id);

    return res.status(200).json({ status: intent.status });
  } catch (err) {
    console.error('[cancel-payment] Error:', err.message);
    if (err.code === 'payment_intent_unexpected_state') {
      return res.status(200).json({ status: 'already_finalized' });
    }
    return res.status(500).json({ error: 'Payment cancellation failed. Please try again.' });
  }
};
