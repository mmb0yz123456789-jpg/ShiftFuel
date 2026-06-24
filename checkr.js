/**
 * /api/checkr.js
 *
 * Admin-triggered Checkr background-check invitation.
 *
 * POST { action: 'invite', admin_token, applicant_id }
 *   - Verifies the admin session token.
 *   - Creates (or reuses) a Checkr candidate for the applicant, then creates an
 *     invitation. Checkr emails the candidate to complete consent + their info
 *     on Checkr's hosted page, runs the report, and notifies /api/checkr-webhook.
 *   - Marks the applicant checkr_status = 'pending'.
 *
 * Required env vars (Vercel):
 *   CHECKR_API_KEY    – your Checkr secret API key
 *   CHECKR_PACKAGE    – the Checkr package slug to run (e.g. a driver/MVR package)
 *   CHECKR_WORK_STATE – optional 2-letter state for work_locations (e.g. "DE")
 *
 * Until CHECKR_API_KEY + CHECKR_PACKAGE are set, this returns 503 and the admin
 * UI surfaces "Checkr is not configured yet" — nothing else breaks.
 */

const { setCorsHeaders, getSupabaseAdmin, verifyAdminToken } = require('./_auth');

const CHECKR_API = 'https://api.checkr.com/v1';

function checkrAuthHeader() {
  const key = process.env.CHECKR_API_KEY;
  if (!key) return null;
  // Checkr uses HTTP Basic auth: API key as username, empty password.
  return 'Basic ' + Buffer.from(`${key}:`).toString('base64');
}

async function checkrPost(path, params) {
  const response = await fetch(`${CHECKR_API}${path}`, {
    method: 'POST',
    headers: {
      Authorization: checkrAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = data?.error
      || (Array.isArray(data?.errors) ? data.errors.join(', ') : null)
      || `Checkr returned ${response.status}`;
    throw new Error(msg);
  }
  return data;
}

module.exports = async (req, res) => {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, admin_token, applicant_id } = req.body || {};

  if (!(await verifyAdminToken(admin_token))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (action !== 'invite') {
    return res.status(400).json({ error: 'Unknown action' });
  }
  if (!checkrAuthHeader() || !process.env.CHECKR_PACKAGE) {
    return res.status(503).json({ error: 'Checkr is not configured yet. Set CHECKR_API_KEY and CHECKR_PACKAGE in Vercel.' });
  }
  if (!applicant_id) {
    return res.status(400).json({ error: 'Missing applicant_id' });
  }

  const db = getSupabaseAdmin();
  const { data: applicant, error } = await db
    .from('applicants')
    .select('id,name,first_name,last_name,email,checkr_candidate_id')
    .eq('id', applicant_id)
    .maybeSingle();

  if (error || !applicant) {
    return res.status(404).json({ error: 'Applicant not found' });
  }
  if (!applicant.email) {
    return res.status(400).json({ error: 'This applicant has no email — a background check needs one.' });
  }

  try {
    // Reuse an existing Checkr candidate if we already created one for this applicant.
    let candidateId = applicant.checkr_candidate_id;
    if (!candidateId) {
      // Prefer the dedicated first/last columns; fall back to splitting `name`.
      const parts = String(applicant.name || '').trim().split(/\s+/).filter(Boolean);
      const firstName = applicant.first_name || parts[0] || 'Applicant';
      const lastName = applicant.last_name || (parts.length > 1 ? parts.slice(1).join(' ') : firstName);
      const candidate = await checkrPost('/candidates', new URLSearchParams({
        first_name: firstName,
        last_name: lastName,
        email: applicant.email,
      }));
      candidateId = candidate.id;
    }

    const invParams = new URLSearchParams({
      candidate_id: candidateId,
      package: process.env.CHECKR_PACKAGE,
    });
    if (process.env.CHECKR_WORK_STATE) {
      invParams.append('work_locations[][country]', 'US');
      invParams.append('work_locations[][state]', process.env.CHECKR_WORK_STATE);
    }
    const invitation = await checkrPost('/invitations', invParams);

    await db.from('applicants').update({
      checkr_candidate_id: candidateId,
      checkr_invitation_id: invitation.id,
      checkr_status: 'pending',
    }).eq('id', applicant_id);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[checkr] invite failed:', err.message);
    return res.status(502).json({ error: `Checkr error: ${err.message}` });
  }
};
