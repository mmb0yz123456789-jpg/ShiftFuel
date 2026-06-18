const twilio = require('twilio');
const { setCorsHeaders, verifyAnyStaffToken } = require('./_auth');

// Events that require a staff (admin or worker) session token.
const STAFF_ONLY_EVENTS = new Set([
  'request_accepted',
  'request_denied',
  'service_complete',
  'worker_assigned',
  'worker_reminder',
  'payment_needed',
]);

// Events allowed from internal booking flow without a session token
// (booking_submitted fires right after payment auth, before any session exists).
const BOOKING_EVENTS = new Set([
  'booking_submitted',
]);

const EVENTS = {
  booking_submitted: ({ name, date, serviceLabel }) =>
    `Hi ${name}! ShiftFuel received your booking request for ${serviceLabel} on ${date}. We'll confirm shortly. Reply STOP to opt out.`,

  request_accepted: ({ name, date, serviceLabel }) =>
    `Hi ${name}! Your ShiftFuel ${serviceLabel} on ${date} has been accepted. We'll be in touch as your service date approaches. Reply STOP to opt out.`,

  request_denied: ({ name, reason }) =>
    `Hi ${name}, unfortunately your ShiftFuel request was not accepted${reason ? `: ${reason}` : ''}. Please reach out if you have questions. Reply STOP to opt out.`,

  service_complete: ({ name, finalTotal }) =>
    `Hi ${name}! Your ShiftFuel service is complete${finalTotal != null ? ` — final charge: $${Number(finalTotal).toFixed(2)}` : ''}. Thank you for using ShiftFuel! Reply STOP to opt out.`,

  worker_assigned: ({ workerName, customerName, date, serviceLabel, address, parkingLocation }) =>
    `ShiftFuel: You've been assigned a job — ${customerName}, ${serviceLabel} on ${date}. Address: ${address}. Parking: ${parkingLocation || 'see dashboard'}. Log in to accept: https://shift-fuel.vercel.app/worker-login.html`,

  worker_reminder: ({ customerName, date, returnTime, serviceLabel, address, parkingLocation }) =>
    `ShiftFuel reminder: Your job starts in ~1 hour — ${customerName}, ${serviceLabel}. ${date} at ${returnTime || 'scheduled time'}. Address: ${address}. Parking: ${parkingLocation || 'see dashboard'}.`,

  payment_needed: ({ name }) =>
    `Hi ${name}! Your ShiftFuel service is complete. Please log in to the tracker to review and confirm your final payment. Reply STOP to opt out.`,
};

function formatPhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.startsWith('+')) return raw;
  return null;
}

module.exports = async (req, res) => {
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { event, to, data = {}, caller_token } = req.body || {};

  if (!event || !EVENTS[event]) {
    return res.status(400).json({ error: 'Unknown or missing event type' });
  }

  // Staff-only events require a valid session token.
  if (STAFF_ONLY_EVENTS.has(event)) {
    if (!caller_token) {
      return res.status(401).json({ error: 'Authorization required' });
    }
    const authorized = await verifyAnyStaffToken(caller_token);
    if (!authorized) {
      return res.status(403).json({ error: 'Session expired or invalid. Please log in again.' });
    }
  }

  if (!to) {
    return res.status(400).json({ error: 'Recipient phone number is required' });
  }

  const toFormatted = formatPhone(to);
  if (!toFormatted) {
    return res.status(400).json({ error: 'Invalid recipient phone number format' });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken  = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !fromNumber) {
    console.error('[send-sms] Missing Twilio env vars');
    return res.status(500).json({ error: 'SMS service not configured' });
  }

  const body = EVENTS[event](data);

  try {
    const client = twilio(accountSid, authToken);
    const message = await client.messages.create({ body, from: fromNumber, to: toFormatted });
    console.log(`[send-sms] ${event} → ${toFormatted} sid=${message.sid}`);
    return res.status(200).json({ sid: message.sid });
  } catch (err) {
    console.error(`[send-sms] Twilio error (${event}):`, err.message);
    return res.status(500).json({ error: 'SMS delivery failed. Please try again.' });
  }
};
