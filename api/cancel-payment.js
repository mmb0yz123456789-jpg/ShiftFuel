const Stripe = require('stripe');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const { payment_intent_id } = req.body || {};

  if (!payment_intent_id) {
    return res.status(400).json({ error: 'payment_intent_id is required' });
  }

  try {
    const intent = await stripe.paymentIntents.cancel(payment_intent_id);
    res.status(200).json({ status: intent.status });
  } catch (err) {
    // Already captured or already canceled — not a hard failure
    if (err.code === 'payment_intent_unexpected_state') {
      return res.status(200).json({ status: 'already_finalized', message: err.message });
    }
    console.error('Stripe cancel error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
