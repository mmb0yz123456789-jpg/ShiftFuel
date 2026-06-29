/**
 * /api/_rate-limit.js
 *
 * Two-layer per-IP rate limiter for public endpoints that call paid third-party
 * APIs (Mapbox), to prevent quota-exhaustion / denial-of-wallet abuse:
 *
 *   1. In-memory (per warm instance) — a cheap first line that stops a crude
 *      single-source flood without any DB round-trip.
 *   2. Supabase (shared across instances) — the authoritative global cap, since
 *      Vercel functions are stateless and an in-memory counter alone can be
 *      multiplied across instances.
 *
 * Fails open if the DB is unreachable (availability over strictness); the
 * in-memory layer still applies in that case.
 */

const { getSupabaseAdmin } = require('./_auth');

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

// ── in-memory fixed-window counter ──────────────────────────────────────────
const memBuckets = new Map(); // key -> { windowStart, count }

function checkMemory(key, limit, windowMs) {
  const now = Date.now();
  let bucket = memBuckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    bucket = { windowStart: now, count: 0 };
  }
  bucket.count += 1;
  memBuckets.set(key, bucket);

  // Opportunistic cleanup so the map can't grow unbounded on a long-lived instance.
  if (memBuckets.size > 5000) {
    for (const [k, v] of memBuckets) {
      if (now - v.windowStart >= windowMs) memBuckets.delete(k);
    }
  }
  return bucket.count <= limit;
}

// Returns { allowed, retryAfter }. retryAfter is in seconds.
async function checkRateLimit(req, action, { limit, windowSeconds }) {
  const ip = getClientIp(req);
  const key = `${action}:${ip}`;
  const windowMs = windowSeconds * 1000;

  // 1) cheap in-memory check first
  if (!checkMemory(key, limit, windowMs)) {
    return { allowed: false, retryAfter: windowSeconds };
  }

  // 2) authoritative shared check
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db.rpc('check_rate_limit', {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (!error && data && data.allowed === false) {
      return { allowed: false, retryAfter: windowSeconds };
    }
  } catch (e) {
    // DB unavailable / migration not applied — rely on the in-memory layer.
  }
  return { allowed: true };
}

// Helper: enforce a limit and write a 429 if exceeded. Returns true if the
// request was blocked (caller should stop), false if it may proceed.
async function enforceRateLimit(req, res, action, opts) {
  const { allowed, retryAfter } = await checkRateLimit(req, action, opts);
  if (!allowed) {
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({ error: 'Too many requests. Please slow down and try again shortly.' });
    return true;
  }
  return false;
}

module.exports = { getClientIp, checkRateLimit, enforceRateLimit };
