const Stripe = require('stripe');
const { setCorsHeaders } = require('./_auth');

const pct = 0.029;
const fixed = 30;

function stripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured');
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function withRecovery(cents) {
  const base = Math.round(Number(cents || 0));
  if (!base) return { total: 0, fee: 0 };
  const gross = Math.ceil((base + fixed) / (1 - pct));
  const rounded = Math.ceil(gross / 100) * 100;
  return { total: rounded, fee: Math.max(0, rounded - base) };
}

function returnUrl(raw) {
  try {
    const url = new URL(String(raw || ''));
    if (!/^https?:$/.test(url.protocol)) return null;
    ['checkout_session_id', 'payment_authorized', 'payment_canceled', 'payment_error'].forEach((key) => url.searchParams.delete(key));
    return url;
  } catch {
    return null;
  }
}

async function create(body, res) {
  const base = Math.round(Number(body.amount_cents || 0));
  if (!base || base < 50) return res.status(400).json({ error: 'Amount must be at least $0.50' });
  const calc = withRecovery(base);
  if (calc.total > 200000) return res.status(400).json({ error: 'Amount exceeds the maximum allowed for this service' });

  const back = returnUrl(body.return_url);
  if (!back) return res.status(400).json({ error: 'A valid return URL is required' });

  const success = new URL(back.href);
  success.searchParams.set('payment_authorized', '1');
  success.searchParams.set('checkout_session_id', '{CHECKOUT_SESSION_ID}');
  success.hash = 'booking-flow';

  const cancel = new URL(back.href);
  cancel.searchParams.set('payment_canceled', '1');
  cancel.hash = 'booking-flow';

  const label = String(body.service_label || 'ShiftFuel service').slice(0, 120);
  const email = String(body.customer_email || '').trim() || undefined;
  const meta = {
    requested_amount_cents: String(base),
    processing_recovery_cents: String(calc.fee),
    source: 'shiftfuel_checkout_fee_authorization',
  };

  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: email,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: calc.total,
        product_data: { name: label, description: 'Authorization hold. Includes payment processing recovery.' },
      },
    }],
    payment_intent_data: { capture_method: 'manual', description: label, receipt_email: email, metadata: meta },
    success_url: success.href,
    cancel_url: cancel.href,
    metadata: meta,
  });

  return res.status(200).json({ url: session.url, session_id: session.id, amount_cents: calc.total, processing_cents: calc.fee });
}

async function verify(body, res) {
  const id = String(body.session_id || '').trim();
  if (!id) return res.status(400).json({ error: 'Checkout session id is required' });
  const session = await stripe().checkout.sessions.retrieve(id, { expand: ['payment_intent'] });
  const pi = session.payment_intent;
  const pid = typeof pi === 'string' ? pi : pi?.id;
  const status = typeof pi === 'string' ? '' : pi?.status;
  if (!pid) return res.status(400).json({ error: 'No payment authorization was found for this checkout session.' });
  if (!['requires_capture', 'processing', 'succeeded'].includes(status)) return res.status(400).json({ error: 'Payment was not authorized. Please try again.' });
  return res.status(200).json({ authorized: true, payment_intent_id: pid, payment_status: status, amount_total: session.amount_total, processing_cents: Number(session.metadata?.processing_recovery_cents || 0), session_id: session.id });
}

module.exports = async (req, res) => {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { action, ...body } = req.body || {};
    if (action === 'create_session') return create(body, res);
    if (action === 'verify_session') return verify(body, res);
    return res.status(400).json({ error: 'Unknown checkout action' });
  } catch (error) {
    console.error('[checkout-fee-authorization]', error.message);
    return res.status(500).json({ error: 'Could not process payment authorization. Please try again.' });
  }
};
