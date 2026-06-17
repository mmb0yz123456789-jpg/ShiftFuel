const Stripe = require('stripe');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const { amount_cents, customer_name, customer_email, service_label } = req.body || {};

  if (!amount_cents || amount_cents < 50) {
    return res.status(400).json({ error: 'Amount must be at least $0.50' });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount_cents),
      currency: 'usd',
      capture_method: 'manual',
      description: service_label || 'ShiftFuel service',
      receipt_email: customer_email || undefined,
      metadata: {
        customer_name: customer_name || '',
        service_label: service_label || '',
      },
    });

    res.status(200).json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
    });
  } catch (err) {
    console.error('Stripe create error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
