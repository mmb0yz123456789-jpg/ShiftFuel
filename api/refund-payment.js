const Stripe = require('stripe');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const { payment_intent_id, amount_cents } = req.body || {};

  if (!payment_intent_id) {
    return res.status(400).json({ error: 'payment_intent_id is required' });
  }

  try {
    const refundParams = { payment_intent: payment_intent_id };
    if (amount_cents && amount_cents >= 50) {
      refundParams.amount = Math.round(amount_cents);
    }

    const refund = await stripe.refunds.create(refundParams);
    res.status(200).json({ status: refund.status, amount_refunded: refund.amount });
  } catch (err) {
    console.error('Stripe refund error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
