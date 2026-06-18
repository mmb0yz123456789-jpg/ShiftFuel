const Stripe = require('stripe');
const { setCorsHeaders } = require('./_auth');

module.exports = async (req, res) => {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { amount_cents, customer_name, customer_email, service_label, capture_method } = req.body || {};

  if (!amount_cents || amount_cents < 50) {
    return res.status(400).json({ error: 'Amount must be at least $0.50' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    console.error('[create-payment-intent] STRIPE_SECRET_KEY not configured');
    return res.status(500).json({ error: 'Payment service not configured' });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount_cents),
      currency: 'usd',
      capture_method: capture_method === 'automatic' ? 'automatic' : 'manual',
      description: service_label || 'ShiftFuel service',
      receipt_email: customer_email || undefined,
      metadata: {
        customer_name: customer_name || '',
        service_label: service_label || '',
      },
    });

    console.log('[create-payment-intent] Created', paymentIntent.id, 'amount:', amount_cents);

    return res.status(200).json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
    });
  } catch (err) {
    console.error('[create-payment-intent] Stripe error:', err.message);
    return res.status(500).json({ error: 'Could not initialize payment. Please try again.' });
  }
};
