/**
 * /api/admin-login.js
 *
 * Server-side admin session minting with PER-IP brute-force throttling.
 *
 * Previously the browser called the `admin_create_session` RPC directly with the
 * public anon key, and the RPC hard-locked a single shared lockout row after 3
 * failed attempts. That let anyone lock the (only) admin out for 15 minutes just
 * by submitting a few bad logins — an unauthenticated denial-of-service.
 *
 * Routing logins through this endpoint lets us rate-limit per IP (so one source
 * can't deny everyone), and the companion migration
 * (202606271100_admin_login_hardening.sql) revokes anon's direct access to the
 * RPC so this throttle can't be bypassed.
 *
 * The browser still hashes username+password (SHA-256) before sending, so the
 * raw password never leaves the client; this endpoint forwards the hashes to the
 * RPC over a service-role connection.
 */

const { setCorsHeaders, getSupabaseAdmin } = require('./_auth');
const { enforceRateLimit } = require('./_rate-limit');

module.exports = async (req, res) => {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Per-IP throttle: generous enough for a real admin's typos, a hard wall for
  // scripted brute force. Independent of any shared state, so it can never be
  // used to deny the legitimate admin access.
  if (await enforceRateLimit(req, res, 'admin_login', { limit: 7, windowSeconds: 900 })) return;

  const { username_hash, password_hash } = req.body || {};
  if (typeof username_hash !== 'string' || typeof password_hash !== 'string'
      || !username_hash || !password_hash) {
    return res.status(400).json({ error: 'Missing credentials' });
  }

  try {
    const db = getSupabaseAdmin();
    const { data: token, error } = await db.rpc('admin_create_session', {
      p_username_hash: username_hash,
      p_password_hash: password_hash,
    });

    if (error) {
      const msg = error.message || '';
      if (msg.includes('ACCOUNT_LOCKED')) return res.status(423).json({ error: 'ACCOUNT_LOCKED' });
      // INVALID_CREDENTIALS or any other auth failure → generic 401 (no detail leaked).
      return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }
    if (!token) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });

    return res.status(200).json({ token });
  } catch (err) {
    console.error('[admin-login] error:', err.message);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
};
