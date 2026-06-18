const { createClient } = require('@supabase/supabase-js');

// Statuses where a worker is actively assigned and the job is not yet done
const ACTIVE_STATUSES = [
  'accepted',
  'key_received',
  'vehicle_picked_up',
  'pickup_vehicle_photo_uploaded',
  'pickup_odometer_photo_uploaded',
  'pickup_fuel_gauge_photo_uploaded',
  'fuel_receipt_uploaded',
  'wash_receipt_uploaded',
  'receipts_recorded',
  'fuel_receipt_uploaded',
  'return_location_recorded',
  'return_photos_needed',
  'vehicle_returned',
  'inspection_needed',
  'inspection_recorded',
];

function formatPhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}

async function sendSms(event, to, data) {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://shift-fuel.vercel.app';

  const res = await fetch(`${base}/api/send-sms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, to, data }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `send-sms returned ${res.status}`);
  }
}

module.exports = async (req, res) => {
  // Allow Vercel cron (GET) or a manual POST with the cron secret
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;

  if (req.method === 'POST') {
    if (!secret || authHeader !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } else if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase env vars missing' });
  }

  const db = createClient(supabaseUrl, supabaseKey);

  // Find jobs scheduled for today where service starts within the next 60–90 minutes
  const now = new Date();
  const todayDate = now.toISOString().slice(0, 10); // YYYY-MM-DD

  // Fetch all active requests for today that have a worker assigned
  const { data: requests, error } = await db
    .from('service_requests')
    .select('id, customer_name, service_date, desired_return_time, service_label, service_type, address_street, address_city, address_state, parking_location, assigned_worker_phone, assigned_worker_name')
    .eq('service_date', todayDate)
    .in('status', ACTIVE_STATUSES)
    .not('assigned_worker_phone', 'is', null);

  if (error) {
    console.error('[worker-reminders] Query error:', error.message);
    return res.status(500).json({ error: error.message });
  }

  const results = [];

  for (const request of requests || []) {
    // Parse the scheduled service time (desired_return_time is when vehicle should be back,
    // so service start = approximately desired_return_time - 2h; use it as a proxy if no explicit start)
    // We treat desired_return_time as the target return time and remind workers ~1 hour before.
    const timeStr = request.desired_return_time; // e.g. "14:00:00"
    if (!timeStr) continue;

    const [hours, minutes] = timeStr.split(':').map(Number);
    const serviceTime = new Date(now);
    serviceTime.setHours(hours, minutes, 0, 0);

    const minutesUntil = (serviceTime - now) / 60000;

    // Send reminder if service time is 50–70 minutes away (cron runs hourly, catches the window)
    if (minutesUntil < 50 || minutesUntil > 70) continue;

    const workerPhone = formatPhone(request.assigned_worker_phone);
    if (!workerPhone) continue;

    const address = [request.address_street, request.address_city, request.address_state].filter(Boolean).join(', ');
    const serviceLabel = request.service_label || request.service_type || 'service';
    const date = new Date(request.service_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    try {
      await sendSms('worker_reminder', workerPhone, {
        customerName: request.customer_name,
        date,
        returnTime: timeStr.slice(0, 5),
        serviceLabel,
        address,
        parkingLocation: request.parking_location,
      });
      results.push({ id: request.id, worker: request.assigned_worker_name, status: 'sent' });
      console.log(`[worker-reminders] Reminder sent to ${request.assigned_worker_name} for request ${request.id}`);
    } catch (err) {
      results.push({ id: request.id, worker: request.assigned_worker_name, status: 'failed', error: err.message });
      console.error(`[worker-reminders] Failed for ${request.id}:`, err.message);
    }
  }

  res.status(200).json({ checked: (requests || []).length, reminded: results });
};
