/**
 * Hosted Stripe Checkout authorization for booking flows.
 * Creates a manual-capture PaymentIntent through Checkout and verifies the
 * returned Checkout Session before the booking can continue to review/submit.
 */

const Stripe = require('stripe');
const { setCorsHeaders } = require('./_auth');

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured');
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function validReturnUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (!/^https?:$/.test(url.protocol)) return null;
    return url;
  } catch {
    return null;
  }
}

function cleanUrlForReturn(value) {
  const url = validReturnUrl(value);
  if (!url) return null;
  url.searchParams.delete('checkout_session_id');
  url.searchParams.delete('payment_authorized');
  url.searchParams.delete('payment_canceled');
  url.searchParams.delete('payment_error');
  return url;
}

async function createSession(body, res) {
  const amountCents = Math.round(Number(body.amount_cents || 0));
  if (!amountCents || amountCents < 50) {
    return res.status(400).json({ error: 'Amount must be at least $0.50' });
  }
  if (amountCents > 200000) {
    return res.status(400).json({ error: 'Amount exceeds the maximum allowed for this service' });
  }

  const returnUrl = cleanUrlForReturn(body.return_url);
  if (!returnUrl) return res.status(400).json({ error: 'A valid return URL is required' });

  const successUrl = new URL(returnUrl.href);
  successUrl.searchParams.set('payment_authorized', '1');
  successUrl.searchParams.set('checkout_session_id', '{CHECKOUT_SESSION_ID}');
  successUrl.hash = 'booking-flow';

  const cancelUrl = new URL(returnUrl.href);
  cancelUrl.searchParams.set('payment_canceled', '1');
  cancelUrl.hash = 'booking-flow';

  const stripe = getStripe();
  const serviceLabel = String(body.service_label || 'ShiftFuel service').slice(0, 120);
  const customerName = String(body.customer_name || '').slice(0, 120);
  const customerEmail = String(body.customer_email || '').trim() || undefined;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: customerEmail,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: {
            name: serviceLabel,
            description: 'Authorization hold only. You will be charged after service completion.',
          },
        },
      },
    ],
    payment_intent_data: {
      capture_method: 'manual',
      description: serviceLabel,
      receipt_email: customerEmail,
      metadata: {
        customer_name: customerName,
        service_label: serviceLabel,
        source: 'shiftfuel_booking_checkout_authorization',
      },
    },
    success_url: successUrl.href,
    cancel_url: cancelUrl.href,
    metadata: {
      customer_name: customerName,
      service_label: serviceLabel,
      source: 'shiftfuel_booking_checkout_authorization',
    },
  });

  return res.status(200).json({ url: session.url, session_id: session.id });
}

async function verifySession(body, res) {
  const sessionId = String(body.session_id || '').trim();
  if (!sessionId) return res.status(400).json({ error: 'Checkout session id is required' });

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['payment_intent'],
  });

  const paymentIntent = session.payment_intent;
  const paymentIntentId = typeof paymentIntent === 'string' ? paymentIntent : paymentIntent?.id;
  const paymentIntentStatus = typeof paymentIntent === 'string' ? '' : paymentIntent?.status;

  if (!paymentIntentId) {
    return res.status(400).json({ error: 'No payment authorization was found for this checkout session.' });
  }

  if (!['requires_capture', 'processing', 'succeeded'].includes(paymentIntentStatus)) {
    return res.status(400).json({ error: 'Payment was not authorized. Please try again.' });
  }

  return res.status(200).json({
    authorized: true,
    payment_intent_id: paymentIntentId,
    payment_status: paymentIntentStatus,
    amount_total: session.amount_total,
    session_id: session.id,
  });
}

module.exports = async (req, res) => {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { action, ...body } = req.body || {};
    if (action === 'create_session') return await createSession(body, res);
    if (action === 'verify_session') return await verifySession(body, res);
    return res.status(400).json({ error: 'Unknown checkout authorization action' });
  } catch (error) {
    console.error('[checkout-authorization]', error.message);
    return res.status(500).json({ error: 'Could not process payment authorization. Please try again.' });
  }
};
