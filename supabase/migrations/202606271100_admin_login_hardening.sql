-- ============================================================
-- ShiftFuel — Admin login hardening (DoS fix + per-IP throttle)
--
-- Problem: admin_create_session used a single shared `admin_lockout` row that
-- hard-locked after 3 failed attempts. Because the RPC was granted to `anon` and
-- callable directly with the public key, anyone could submit 3 bad logins and
-- lock the (only) admin out for 15 minutes — a trivial, unauthenticated DoS.
--
-- New model:
--   * Brute-force throttling moves to api/admin-login.js, which rate-limits
--     PER IP before calling this RPC with the service-role key.
--   * This RPC no longer hard-locks globally (the counter is kept only for
--     visibility), so the shared lock can never be weaponized.
--   * EXECUTE is revoked from anon/authenticated/PUBLIC and granted only to
--     service_role, forcing every admin login through the throttled endpoint.
--
-- ⚠️ DEPLOY ORDER: ship the code (api/admin-login.js + admin-login.html) FIRST
--    and confirm admin login works, THEN run this migration. Running it before
--    the new code is live will break the old login page, which still calls the
--    RPC directly as anon.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_create_session(
  p_username_hash text,
  p_password_hash text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  stored_user_hash text;
  stored_pass_hash text;
  new_token        uuid;
BEGIN
  SELECT value INTO stored_user_hash FROM admin_config WHERE key = 'admin_username_hash';
  SELECT value INTO stored_pass_hash FROM admin_config WHERE key = 'admin_password_hash';

  IF stored_user_hash IS NULL
     OR stored_pass_hash IS NULL
     OR p_username_hash <> stored_user_hash
     OR p_password_hash <> stored_pass_hash
  THEN
    -- Failure counter only (for monitoring). No global hard-lock: per-IP
    -- throttling in api/admin-login.js is the brute-force control, so a shared
    -- lock can never be used to deny the admin access.
    UPDATE admin_lockout SET failed_attempts = failed_attempts + 1 WHERE id = 1;
    RAISE EXCEPTION 'INVALID_CREDENTIALS';
  END IF;

  UPDATE admin_lockout SET failed_attempts = 0, locked_until = NULL WHERE id = 1;

  DELETE FROM admin_sessions WHERE expires_at < now();

  INSERT INTO admin_sessions (expires_at)
  VALUES (now() + interval '8 hours')
  RETURNING id INTO new_token;

  RETURN new_token;
END;
$$;

-- Only the server (service_role, via api/admin-login.js) may mint admin sessions.
-- REVOKE from PUBLIC too — Postgres grants EXECUTE to PUBLIC by default, and anon
-- inherits PUBLIC, so revoking anon alone would not actually close direct access.
REVOKE EXECUTE ON FUNCTION public.admin_create_session(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_create_session(text, text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_create_session(text, text) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ── Verification (run as the anon role; should FAIL with "permission denied") ──
--   SELECT public.admin_create_session('x', 'y');
-- And confirm the function still exists for service_role:
--   SELECT proname FROM pg_proc WHERE proname = 'admin_create_session';
