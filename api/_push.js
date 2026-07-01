// Shared Web Push send logic. Used by api/push.js (client-triggered notifies)
// and api/payments.js (server-side, after a status change).
//
// Required env vars (Vercel):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY  – generate with: npx web-push generate-vapid-keys
//   VAPID_SUBJECT                        – e.g. "mailto:you@example.com"
//
// Until those are set, every function here is a safe no-op.

const webpush = require('web-push');
const { getSupabaseAdmin } = require('./_auth');

let vapidReady = false;
function ensureVapid() {
  if (vapidReady) return true;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  try {
    // Throws if the keys are the wrong length/format (e.g. swapped or truncated).
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:support@shiftfuel.app', pub, priv);
    vapidReady = true;
    return true;
  } catch (e) {
    console.error('[push] invalid VAPID keys:', e.message);
    return false;
  }
}

function cleanPhone(v) { return String(v || '').replace(/\D/g, ''); }

async function sendToSubs(subs, payload) {
  if (!ensureVapid()) return [{ ok: false, status: 0, error: 'VAPID keys not configured on the server' }];
  if (!subs || !subs.length) return [];
  const db = getSupabaseAdmin();
  const body = JSON.stringify(payload);
  return Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body);
      return { ok: true };
    } catch (err) {
      // 404/410 = the subscription is gone (uninstalled / expired) — drop it.
      if (err.statusCode === 404 || err.statusCode === 410) {
        await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
      } else {
        console.warn('[push] send failed:', err.statusCode, err.body || err.message);
      }
      return { ok: false, status: err.statusCode || 0, error: String(err.body || err.message || 'send failed').slice(0, 200) };
    }
  }));
}

const CANCEL_STATUSES = ['cancelled_pending_key_return', 'return_requested', 'customer_return_requested'];
const DONE_STATUSES = ['complete', 'completed', 'finalized', 'keys_returned', 'canceled_return_completed', 'closed_no_charge'];

// Notify the relevant party about a request based on its CURRENT state, so a
// stray call (e.g. after a failed action) never sends a false alert.
async function notifyRequest(requestId, eventType) {
  if (!requestId || !ensureVapid()) return;
  const db = getSupabaseAdmin();
  const { data: request } = await db
    .from('service_requests')
    .select('id, status, assigned_employee_id, customer_phone, customer_email, service_label, customer_name, payment_status, return_requested_at')
    .eq('id', requestId)
    .maybeSingle();
  if (!request) return;

  const shortId = `SF-${String(request.id).slice(0, 8).toUpperCase()}`;

  // Guard each event against the request's real state.
  if (eventType === 'cancelled' && !CANCEL_STATUSES.includes(request.status) && !request.return_requested_at) return;
  if (eventType === 'completed' && !DONE_STATUSES.includes(request.status)) return;
  if (eventType === 'paid' && request.payment_status !== 'captured') return;
  if (eventType === 'assigned' && !request.assigned_employee_id) return;
  if (eventType === 'reauth_needed' && request.payment_status !== 'needs_reauth') return;

  const messages = {
    cancelled: { who: 'worker', title: 'Job cancelled', body: `${request.customer_name || 'A customer'} cancelled — return the key/vehicle (${shortId}).`, url: '/worker/dashboard' },
    assigned:  { who: 'worker', title: 'New job assigned', body: `You've been assigned a ${request.service_label || 'service'} job (${shortId}).`, url: '/worker/dashboard' },
    completed: { who: 'customer', title: 'Service complete', body: `Your ${request.service_label || 'service'} is complete (${shortId}).`, url: '/track' },
    paid:      { who: 'customer', title: 'Payment processed', body: `Your payment for ${shortId} was processed — thank you!`, url: '/track' },
    reauth_needed: { who: 'customer', title: 'Action needed: re-authorize payment', body: `We couldn't authorize payment for your upcoming ${request.service_label || 'service'} (${shortId}). Please re-authorize so we can complete it.`, url: '/track' },
  };
  const msg = messages[eventType];
  if (!msg) return;

  let subs = [];
  if (msg.who === 'worker') {
    if (!request.assigned_employee_id) return;
    const { data } = await db.from('push_subscriptions')
      .select('endpoint,p256dh,auth')
      .eq('subscriber_type', 'worker')
      .eq('employee_id', request.assigned_employee_id);
    subs = data || [];
  } else {
    const phone = cleanPhone(request.customer_phone);
    const email = String(request.customer_email || '').toLowerCase();
    const or = [];
    if (phone) or.push(`customer_phone.eq.${phone}`);
    if (email) or.push(`customer_email.eq.${email}`);
    if (!or.length) return;
    const { data } = await db.from('push_subscriptions')
      .select('endpoint,p256dh,auth')
      .eq('subscriber_type', 'customer')
      .or(or.join(','));
    subs = data || [];
  }

  await sendToSubs(subs, { title: msg.title, body: msg.body, tag: `${eventType}-${request.id}`, url: msg.url });
}

// Broadcast a "new job available to claim" push to every subscribed worker the
// moment a new (unassigned) booking is created. Fire-and-forget from the caller.
async function notifyWorkersNewJob(request) {
  if (!request || !ensureVapid()) return;
  const db = getSupabaseAdmin();
  const { data: subs } = await db
    .from('push_subscriptions')
    .select('endpoint,p256dh,auth')
    .eq('subscriber_type', 'worker');
  if (!subs || !subs.length) return;
  const shortId = `SF-${String(request.id).slice(0, 8).toUpperCase()}`;
  await sendToSubs(subs, {
    title: 'New job available',
    body: `A ${request.service_label || request.service_type || 'service'} job is up for grabs (${shortId}). Open ShiftFuel to claim it.`,
    tag: `new-job-${request.id}`,
    url: '/worker/dashboard',
  });
}

module.exports = { ensureVapid, notifyRequest, notifyWorkersNewJob, sendToSubs, cleanPhone };
