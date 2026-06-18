const { createClient } = require('@supabase/supabase-js');
const twilio = require('twilio');
const { setCorsHeaders, getSupabaseAdmin, verifyAdminToken } = require('./_auth');

function formatPhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

function locationMatches(requestLocation, workerLocation) {
  if (!workerLocation) return true;
  if (!requestLocation) return false;

  const req = String(requestLocation).toLowerCase();
  const wrk = String(workerLocation).toLowerCase();

  if (req.includes(wrk) || wrk.includes(req)) return true;

  const cityToken = (s) => s.replace(/[^a-z\s]/g, ' ').trim().split(/\s+/)[0];
  return cityToken(req) === cityToken(wrk) && cityToken(req).length > 2;
}

module.exports = async (req, res) => {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { caller_token, request_id, serviceDate, serviceLabel, addressCity, addressState, hospital, parkingLocation } = req.body || {};

  // Must be either an admin session OR a valid recently-created request_id (booking flow).
  let authorized = false;

  if (caller_token) {
    authorized = await verifyAdminToken(caller_token);
  } else if (request_id) {
    // Booking flow: verify the request_id exists and was created in the last 10 minutes.
    try {
      const db = getSupabaseAdmin();
      const cutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      const { data } = await db
        .from('service_requests')
        .select('id')
        .eq('id', request_id)
        .gte('created_at', cutoff)
        .maybeSingle();
      authorized = !!data;
    } catch {
      authorized = false;
    }
  }

  if (!authorized) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return res.status(500).json({ error: 'SMS service not configured' });
  }

  let db;
  try {
    db = getSupabaseAdmin();
  } catch {
    return res.status(500).json({ error: 'Service configuration error' });
  }

  const { data: workers, error } = await db
    .from('employees')
    .select('id, full_name, phone, home_location')
    .eq('active', true)
    .not('phone', 'is', null);

  if (error) {
    console.error('[notify-area-workers] Employee query error:', error.message);
    return res.status(500).json({ error: 'Could not retrieve worker list' });
  }

  const requestLocation = addressCity
    ? `${addressCity} ${addressState || ''}`.trim()
    : hospital || '';

  const date = serviceDate
    ? new Date(serviceDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'upcoming date';

  const label = serviceLabel || 'fuel service';
  const locationDisplay = addressCity
    ? [addressCity, addressState].filter(Boolean).join(', ')
    : hospital || 'your area';

  const client = twilio(accountSid, authToken);
  const results = [];

  for (const worker of workers || []) {
    if (!locationMatches(requestLocation, worker.home_location)) continue;

    const to = formatPhone(worker.phone);
    if (!to) continue;

    const body = `ShiftFuel: New job posted in ${locationDisplay} — ${label} on ${date}. Log in to view and accept: https://shift-fuel.vercel.app/worker-login.html`;

    try {
      const message = await client.messages.create({ body, from: fromNumber, to });
      console.log(`[notify-area-workers] Notified ${worker.full_name} sid=${message.sid}`);
      results.push({ worker: worker.full_name, status: 'sent' });
    } catch (err) {
      console.error(`[notify-area-workers] Failed for ${worker.full_name}:`, err.message);
      results.push({ worker: worker.full_name, status: 'failed' });
    }
  }

  return res.status(200).json({ notified: results.filter(r => r.status === 'sent').length, results });
};
