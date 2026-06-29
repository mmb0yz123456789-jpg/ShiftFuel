/**
 * /api/checkr-webhook.js
 *
 * Receives Checkr webhook events (report.completed, report.*) and writes the
 * result back to the matching applicant row, so the admin sees a green/red badge.
 *
 * Configure in the Checkr dashboard with a secret in the URL:
 *   https://<your-domain>/api/checkr-webhook?token=<CHECKR_WEBHOOK_SECRET>
 *
 * Auth model: the secret URL token gates access (only Checkr knows the URL we
 * configured). We trust the event payload's report fields, which Checkr signs
 * and delivers to that secret endpoint.
 *
 * Required env var (Vercel): CHECKR_WEBHOOK_SECRET
 */

const crypto = require('crypto');
const { getSupabaseAdmin } = require('./_auth');

// Constant-time string compare so a token guess can't be narrowed by timing.
function safeEqual(a, b) {
  const ba = Buffer.from(String(a ?? ''));
  const bb = Buffer.from(String(b ?? ''));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Fail CLOSED: if the shared secret isn't configured we reject everything,
  // rather than (previously) skipping the check and accepting forged reports
  // that could mark an applicant's background check "clear".
  const secret = process.env.CHECKR_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[checkr-webhook] CHECKR_WEBHOOK_SECRET is not configured — rejecting request');
    return res.status(503).json({ error: 'Webhook not configured' });
  }
  if (!safeEqual(req.query?.token, secret)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const event = req.body || {};
  const report = event?.data?.object;

  // Only act on report objects that carry a candidate; ignore other event types.
  if (!report || report.object !== 'report' || !report.candidate_id) {
    return res.status(200).json({ ok: true, ignored: true });
  }

  // Map Checkr's report state to our badge status.
  // `result` ('clear' | 'consider') is set once `status` === 'complete'.
  let status = 'pending';
  if (report.result === 'clear') status = 'clear';
  else if (report.result === 'consider') status = 'consider';
  else if (['suspended', 'dispute', 'canceled'].includes(report.status)) status = report.status;

  const update = {
    checkr_report_id: report.id || null,
    checkr_status: status,
  };
  if (status === 'clear' || status === 'consider') {
    update.checkr_completed_at = new Date().toISOString();
  }

  try {
    const db = getSupabaseAdmin();
    const { error } = await db
      .from('applicants')
      .update(update)
      .eq('checkr_candidate_id', report.candidate_id);
    if (error) throw error;
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[checkr-webhook] update failed:', err.message);
    // Non-2xx so Checkr retries on a transient failure.
    return res.status(500).json({ error: 'Update failed' });
  }
};
