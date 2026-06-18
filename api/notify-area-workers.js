const { createClient } = require('@supabase/supabase-js');
const twilio = require('twilio');

function formatPhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

// Check if the request location matches a worker's home_location.
// Matching is loose: we check if the city or a key location keyword appears
// in both strings (case-insensitive), or if both are blank (catch-all).
function locationMatches(requestLocation, workerLocation) {
  if (!workerLocation) return true; // worker has no location restriction — gets all jobs
  if (!requestLocation) return false;

  const req = String(requestLocation).toLowerCase();
  const wrk = String(workerLocation).toLowerCase();

  // Direct substring match either way
  if (req.includes(wrk) || wrk.includes(req)) return true;

  // City-level match: extract first city-like token from each and compare
  const cityToken = (s) => s.replace(/[^a-z\s]/g, ' ').trim().split(/\s+/)[0];
  return cityToken(req) === cityToken(wrk) && cityToken(req).length > 2;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    serviceDate,
    serviceLabel,
    addressCity,
    addressState,
    hospital,
    parkingLocation,
  } = req.body || {};

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase env vars missing' });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    return res.status(500).json({ error: 'Twilio env vars missing' });
  }

  const db = createClient(supabaseUrl, supabaseKey);

  // Fetch all active workers who have a phone number
  const { data: workers, error } = await db
    .from('employees')
    .select('id, full_name, phone, home_location')
    .eq('active', true)
    .not('phone', 'is', null);

  if (error) {
    console.error('[notify-area-workers] Employee query error:', error.message);
    return res.status(500).json({ error: error.message });
  }

  // The "request location" for matching — use city+state or the hospital/location name
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
      console.log(`[notify-area-workers] Notified ${worker.full_name} (${to}) sid=${message.sid}`);
      results.push({ worker: worker.full_name, status: 'sent' });
    } catch (err) {
      console.error(`[notify-area-workers] Failed for ${worker.full_name}:`, err.message);
      results.push({ worker: worker.full_name, status: 'failed', error: err.message });
    }
  }

  res.status(200).json({ notified: results.length, results });
};
