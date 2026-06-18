const Stripe = require('stripe');
const { setCorsHeaders, getSupabaseAdmin, verifyAdminToken } = require('./_auth');

module.exports = async (req, res) => {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { payment_intent_id, request_id, amount_cents, caller_token } = req.body || {};

  // Refunds are admin-only.
  if (!caller_token) {
    return res.status(401).json({ error: 'Authorization required' });
  }
  const isAdmin = await verifyAdminToken(caller_token);
  if (!isAdmin) {
    return res.status(403).json({ error: 'Admin access required for refunds' });
  }

  if (!payment_intent_id || !request_id) {
    return res.status(400).json({ error: 'payment_intent_id and request_id are required' });
  }

  try {
    const db = getSupabaseAdmin();

    // ── Verify ownership ──────────────────────────────────────────────────
    const { data: request, error: reqErr } = await db
      .from('service_requests')
      .select('id, payment_intent_id, payment_status')
      .eq('id', request_id)
      .maybeSingle();

    if (reqErr || !request) {
      console.error('[refund-payment] Request lookup failed:', reqErr?.message);
      return res.status(404).json({ error: 'Request not found' });
    }

    if (request.payment_intent_id !== payment_intent_id) {
      console.warn('[refund-payment] PI mismatch for request', request_id);
      return res.status(403).json({ error: 'Payment intent does not match this request' });
    }

    if (request.payment_status !== 'captured') {
      return res.status(400).json({ error: 'Only captured payments can be refunded' });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const refundParams = { payment_intent: payment_intent_id };
    if (amount_cents && amount_cents >= 50) {
      refundParams.amount = Math.round(amount_cents);
    }

    const refund = await stripe.refunds.create(refundParams);
    console.log('[refund-payment] Refund', refund.id, 'status:', refund.status, 'for request', request_id);

    return res.status(200).json({ status: refund.status, amount_refunded: refund.amount });
  } catch (err) {
    console.error('[refund-payment] Error:', err.message);
    return res.status(500).json({ error: 'Refund failed. Please try again.' });
  }
};
