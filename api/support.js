/**
 * /api/support.js
 *
 * Public support-message intake. Stores customer messages for the admin portal;
 * email alerts can be added later once a sending provider is configured.
 */

const { setCorsHeaders, getSupabaseAdmin } = require('./_auth');
const { enforceRateLimit, getClientIp } = require('./_rate-limit');

function cleanText(value, max = 1000) {
  return String(value || '').trim().slice(0, max);
}

function cleanEmail(value) {
  return cleanText(value, 254).toLowerCase();
}

function cleanPhone(value) {
  return cleanText(value, 40);
}

module.exports = async (req, res) => {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (await enforceRateLimit(req, res, 'support_message', { limit: 5, windowSeconds: 60 })) return;

  const body = req.body || {};
  if (cleanText(body.website, 200)) return res.status(200).json({ ok: true });

  const customerName = cleanText(body.customer_name, 120);
  const customerEmail = cleanEmail(body.customer_email);
  const customerPhone = cleanPhone(body.customer_phone);
  const subject = cleanText(body.subject, 160);
  const message = cleanText(body.message, 4000);
  const reason = cleanText(body.reason, 40) || 'general';
  const bookingRef = cleanText(body.booking_ref, 120) || null;

  if (!customerName || !customerEmail || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }

  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('support_messages')
      .insert({
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone || null,
        reason,
        subject: subject || null,
        message,
        booking_ref: bookingRef,
        source_page: cleanText(body.source_page, 300) || null,
        client_ip: getClientIp(req),
        user_agent: cleanText(req.headers['user-agent'], 500) || null,
      })
      .select('id')
      .maybeSingle();
    if (error) throw error;
    return res.status(200).json({ ok: true, id: data?.id || null });
  } catch (err) {
    console.error('[support] submit failed:', err.message);
    return res.status(500).json({ error: 'Could not send your message. Please email us directly.' });
  }
};
