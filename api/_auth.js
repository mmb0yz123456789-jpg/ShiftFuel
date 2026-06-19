const { createClient } = require('@supabase/supabase-js');

// Origins allowed to call these APIs.
// Adjust when a custom domain is added.
const ALLOWED_ORIGINS = [
  'https://shift-fuel.vercel.app',
];

function getAllowedOrigin(req) {
  const origin = req.headers.origin || '';
  if (ALLOWED_ORIGINS.includes(origin)) return origin;
  // Allow preview deployments on *.vercel.app
  if (origin.match(/^https:\/\/[\w-]+\.vercel\.app$/)) return origin;
  return ALLOWED_ORIGINS[0];
}

function setCorsHeaders(req, res) {
  res.setHeader('Access-Control-Allow-Origin', getAllowedOrigin(req));
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
}

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase env vars not configured');
  return createClient(url, key);
}

async function verifyAdminToken(token) {
  if (!token) return false;
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('admin_sessions')
      .select('id')
      .eq('id', token)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (error) {
      console.error('[verifyAdminToken] Supabase error:', error.message, error.code);
      return false;
    }
    return !!data;
  } catch (err) {
    console.error('[verifyAdminToken] Exception:', err.message);
    return false;
  }
}

async function verifyWorkerToken(token) {
  if (!token) return null;
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from('worker_sessions')
      .select('employee_id')
      .eq('id', token)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();
    if (error) {
      console.error('[verifyWorkerToken] Supabase error:', error.message, error.code);
      return null;
    }
    return data?.employee_id || null;
  } catch (err) {
    console.error('[verifyWorkerToken] Exception:', err.message);
    return null;
  }
}

// Returns true if the token belongs to a valid admin OR worker session.
async function verifyAnyStaffToken(token) {
  if (!token) return false;
  const [isAdmin, workerId] = await Promise.all([
    verifyAdminToken(token),
    verifyWorkerToken(token),
  ]);
  return isAdmin || !!workerId;
}

module.exports = {
  setCorsHeaders,
  getSupabaseAdmin,
  verifyAdminToken,
  verifyWorkerToken,
  verifyAnyStaffToken,
};
