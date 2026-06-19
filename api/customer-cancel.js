const Stripe = require('stripe');
const { setCorsHeaders, getSupabaseAdmin } = require('./_auth');

// Customer-initiated cancellation. Verifies ownership via phone+email, cancels
// the Stripe authorization hold if one exists, then marks the request canceled.
module.exports = async (req, res) => {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { request_id, phone, email, reason } = req.body || {};

  if (!request_id || (!phone && !email)) {
    return res.status(400).json({ error: 'request_id and phone or email are required' });
  }
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'A cancellation reason is required' });
  }

  let db;
  try {
    db = getSupabaseAdmin();
  } catch {
    return res.status(500).json({ error: 'Service configuration error' });
  }

  // ── Verify customer ownership ─────────────────────────────────────────────
  let query = db
    .from('service_requests')
    .select('id, payment_intent_id, payment_status, status, customer_phone, customer_email')
    .eq('id', request_id);

  const { data: request, error: reqErr } = await query.maybeSingle();

  if (reqErr || !request) {
    return res.status(404).json({ error: 'Request not found' });
  }

  // Normalize: strip non-digits from phone, lowercase email.
  const normalize = (s) => (s || '').replace(/\D/g, '');
  const phoneMatch = phone && normalize(phone) && normalize(phone) === normalize(request.customer_phone);
  const emailMatch = email && email.trim().toLowerCase() === (request.customer_email || '').toLowerCase();

  if (!phoneMatch && !emailMatch) {
    return res.status(403).json({ error: 'Contact details do not match this request' });
  }

  // Only allow canceling requests that have not yet been finalized.
  const cancelableStatuses = [
    'pending', 'received', 'pending_review', 'pending_customer_info',
    'confirmed', 'assigned', 'en_route',
  ];
  if (!cancelableStatuses.includes(request.status)) {
    return res.status(400).json({
      error: `This request cannot be canceled at status "${request.status}". Contact ShiftFuel for help.`,
    });
  }

  const timestamp = new Date().toISOString();

  // ── Release Stripe hold if one exists ────────────────────────────────────
  let paymentStatus = request.payment_status;
  let holdReleaseWarning = null;

  const releaseableStatuses = ['authorized', 'requires_capture'];
  const alreadyReleased = ['voided', 'authorization_released', 'refunded', 'failed', 'auto_reversed', 'payment_release_failed'];

  if (request.payment_intent_id && releaseableStatuses.includes(request.payment_status)) {
    if (!process.env.STRIPE_SECRET_KEY) {
      holdReleaseWarning = 'Payment service not configured — hold was not released automatically.';
    } else {
      try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
        await stripe.paymentIntents.cancel(request.payment_intent_id);
        paymentStatus = 'voided';
        console.log('[customer-cancel] Voided PI', request.payment_intent_id, 'for request', request_id);
      } catch (err) {
        if (err.code === 'payment_intent_unexpected_state') {
          // Already finalized — treat as released.
          paymentStatus = 'voided';
        } else {
          console.error('[customer-cancel] Failed to void PI:', err.message);
          paymentStatus = 'payment_release_failed';
          holdReleaseWarning = 'Your card hold could not be released automatically. ShiftFuel will release it manually within 1–3 business days.';
        }
      }
    }
  } else if (request.payment_intent_id && !alreadyReleased.includes(request.payment_status)) {
    // payment_status is something unexpected — log it but don't block the cancel.
    console.warn('[customer-cancel] Unexpected payment_status on cancel:', request.payment_status, 'for request', request_id);
  }

  // ── Update the request ────────────────────────────────────────────────────
  const updateData = {
    status: 'customer_canceled',
    cancellation_reason: reason.trim(),
    payment_status: paymentStatus !== request.payment_status ? paymentStatus : undefined,
    updated_at: timestamp,
  };
  // Remove undefined keys.
  Object.keys(updateData).forEach(k => updateData[k] === undefined && delete updateData[k]);

  const { error: updateErr } = await db
    .from('service_requests')
    .update(updateData)
    .eq('id', request_id);

  if (updateErr) {
    console.error('[customer-cancel] DB update failed:', updateErr.message);
    return res.status(500).json({ error: 'Could not cancel the request. Please contact ShiftFuel.' });
  }

  console.log('[customer-cancel] Request', request_id, 'canceled by customer. payment_status:', paymentStatus);

  return res.status(200).json({
    success: true,
    payment_status: paymentStatus,
    ...(holdReleaseWarning ? { warning: holdReleaseWarning } : {}),
  });
};
