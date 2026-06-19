const Stripe = require('stripe');
const { setCorsHeaders, getSupabaseAdmin } = require('./_auth');

function cleanPhone(value) {
  return String(value || '').replace(/\D/g, '');
}

module.exports = async (req, res) => {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { request_id, phone, email } = req.body || {};

  if (!request_id || !phone || !email) {
    return res.status(400).json({ error: 'request_id, phone, and email are required' });
  }

  let db;
  try {
    db = getSupabaseAdmin();
  } catch {
    return res.status(500).json({ error: 'Service configuration error' });
  }

  const { data: request, error: reqErr } = await db
    .from('service_requests')
    .select('id, customer_phone, customer_email, customer_name, status, final_total, service_label, payment_intent_id, payment_status')
    .eq('id', request_id)
    .maybeSingle();

  if (reqErr || !request) {
    return res.status(404).json({ error: 'Request not found' });
  }

  const phoneMatch = cleanPhone(request.customer_phone) === cleanPhone(phone);
  const emailMatch = (request.customer_email || '').toLowerCase() === (email || '').toLowerCase();
  if (!phoneMatch || !emailMatch) {
    return res.status(403).json({ error: 'Your phone and email do not match this request' });
  }

  if (request.status !== 'pending_customer_payment') {
    return res.status(400).json({ error: 'This request is not awaiting customer payment' });
  }

  // Do not create a new PI if the request already has an authorized pre-auth hold.
  // The customer should capture that existing hold via /api/customer-capture instead.
  if (request.payment_intent_id && request.payment_status === 'authorized') {
    return res.status(400).json({
      error: 'A payment authorization already exists for this request. Please use the existing payment confirmation.',
      has_pre_auth: true,
    });
  }

  if (request.final_total == null || request.final_total <= 0) {
    return res.status(400).json({ error: 'Final total is not set. Please contact ShiftFuel.' });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Payment service not configured' });
  }

  const amountCents = Math.round(request.final_total * 100);
  if (amountCents < 50) {
    return res.status(400).json({ error: 'Amount is too small to process' });
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      capture_method: 'automatic',
      description: request.service_label || 'ShiftFuel service',
      receipt_email: request.customer_email || undefined,
      metadata: {
        request_id: String(request_id),
        customer_name: request.customer_name || '',
        customer_email: request.customer_email || '',
        service_label: request.service_label || '',
        purpose: 'customer_final_payment',
      },
    });

    console.log('[create-customer-final-payment] PI', paymentIntent.id, 'amount:', amountCents, 'for request', request_id);

    return res.status(200).json({
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
    });
  } catch (err) {
    console.error('[create-customer-final-payment] Stripe error:', err.message);
    return res.status(500).json({ error: 'Could not initialize payment. Please try again.' });
  }
};
