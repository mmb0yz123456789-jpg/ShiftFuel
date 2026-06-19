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

  let db;
  try {
    db = getSupabaseAdmin();
  } catch {
    return res.status(500).json({ error: 'Service configuration error' });
  }

  // ── Verify ownership ──────────────────────────────────────────────────────
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

  // Do not cancel a captured payment — that requires a refund.
  if (request.payment_status === 'captured') {
    return res.status(400).json({ error: 'Payment has already been captured. Use refund instead.' });
  }

  // Idempotent: already released.
  const alreadyReleased = ['voided', 'authorization_released', 'refunded', 'failed', 'auto_reversed'].includes(request.payment_status);
  if (alreadyReleased) {
    return res.status(200).json({ status: 'already_released', payment_status: request.payment_status });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Payment service not configured' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const intent = await stripe.paymentIntents.cancel(payment_intent_id);
    console.log('[cancel-payment] Canceled', intent.id, 'for request', request_id, '— status:', intent.status);

    // Update DB atomically after Stripe confirms.
    const { error: dbErr } = await db
      .from('service_requests')
      .update({
        payment_status: 'voided',
        updated_at: new Date().toISOString(),
      })
      .eq('id', request_id);

    if (dbErr) {
      console.error('[cancel-payment] DB update failed after Stripe cancel:', dbErr.message);
      // Stripe cancel succeeded — flag the DB discrepancy rather than returning an error.
      return res.status(200).json({
        status: intent.status,
        warning: 'Stripe hold released but database update failed. Contact support.',
      });
    }

    return res.status(200).json({ status: intent.status, payment_status: 'voided' });

  } catch (err) {
    console.error('[cancel-payment] Stripe error:', err.message, 'code:', err.code);

    if (err.code === 'payment_intent_unexpected_state') {
      // PI already finalized (canceled or succeeded) in Stripe — sync DB.
      try {
        const check = await stripe.paymentIntents.retrieve(payment_intent_id);
        const finalStatus = check.status === 'succeeded' ? 'captured' : 'voided';
        await db.from('service_requests').update({
          payment_status: finalStatus,
          updated_at: new Date().toISOString(),
        }).eq('id', request_id);
        return res.status(200).json({ status: check.status, payment_status: finalStatus, already_finalized: true });
      } catch (_) {
        return res.status(200).json({ status: 'already_finalized' });
      }
    }

    // Flag the release failure in the DB so admin can see it.
    await db.from('service_requests').update({
      payment_status: 'payment_release_failed',
      updated_at: new Date().toISOString(),
    }).eq('id', request_id).catch(() => {});

    return res.status(500).json({
      error: 'Payment hold release failed. Please cancel the authorization manually in Stripe.',
      payment_status: 'payment_release_failed',
    });
  }
};
