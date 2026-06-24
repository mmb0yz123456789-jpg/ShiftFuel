/**
 * /api/push.js — Web Push subscription management.
 *
 * POST actions:
 *   config       – returns the VAPID public key for the browser to subscribe with
 *   subscribe    – stores a push subscription (worker via token, or customer via phone/email)
 *   unsubscribe  – removes a subscription by endpoint
 *   notify       – staff-triggered notification for a request (e.g. admin assigns a job)
 */

const { setCorsHeaders, getSupabaseAdmin, verifyAdminToken, verifyWorkerToken } = require('./_auth');
const { notifyRequest, cleanPhone } = require('./_push');

module.exports = async (req, res) => {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, ...body } = req.body || {};

  if (action === 'config') {
    return res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
  }

  if (action === 'subscribe') {
    const { subscription, subscriber_type, worker_token, phone, email } = body;
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ error: 'Invalid subscription' });
    }
    const row = {
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      subscriber_type: subscriber_type === 'worker' ? 'worker' : 'customer',
      last_seen_at: new Date().toISOString(),
    };

    if (row.subscriber_type === 'worker') {
      const employeeId = await verifyWorkerToken(worker_token);
      if (!employeeId) return res.status(401).json({ error: 'Unauthorized' });
      row.employee_id = employeeId;
    } else {
      row.customer_phone = cleanPhone(phone) || null;
      row.customer_email = String(email || '').trim().toLowerCase() || null;
      if (!row.customer_phone && !row.customer_email) {
        return res.status(400).json({ error: 'Phone or email required' });
      }
    }

    const db = getSupabaseAdmin();
    const { error } = await db.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' });
    if (error) {
      console.error('[push/subscribe]', error.message);
      return res.status(500).json({ error: 'Could not save subscription' });
    }
    return res.status(200).json({ ok: true });
  }

  if (action === 'unsubscribe') {
    if (!body.endpoint) return res.status(400).json({ error: 'Missing endpoint' });
    const db = getSupabaseAdmin();
    await db.from('push_subscriptions').delete().eq('endpoint', body.endpoint);
    return res.status(200).json({ ok: true });
  }

  if (action === 'notify') {
    const ok = (await verifyAdminToken(body.admin_token)) || (await verifyWorkerToken(body.worker_token));
    if (!ok) return res.status(401).json({ error: 'Unauthorized' });
    if (!body.request_id || !body.event) return res.status(400).json({ error: 'Missing request_id or event' });
    // Fire-and-forget; never block the caller on the push round-trip.
    notifyRequest(body.request_id, body.event).catch((e) => console.warn('[push/notify]', e.message));
    return res.status(200).json({ ok: true });
  }

  return res.status(400).json({ error: 'Unknown action' });
};
