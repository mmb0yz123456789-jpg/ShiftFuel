-- ============================================================
-- ShiftFuel — Remove the legacy worker_change_password RPC
--
-- worker_change_password(p_token, p_hash, p_salt) verified the session token but
-- then wrote a CLIENT-SUPPLIED hash + salt straight onto the employee row, with
--   * no current-password re-authentication, and
--   * no password-length / strength enforcement.
-- That let any holder of a worker session token (including one stolen via XSS)
-- silently set a new password without knowing the current one.
--
-- It has been superseded by worker_change_password_secure (browser sends the
-- plaintext current + new password; the server verifies the current one, enforces
-- a 10-char minimum, and hashes server-side). The client (worker.js) only calls
-- the _secure version, so dropping the legacy function is safe and requires no
-- code change.
-- ============================================================

DROP FUNCTION IF EXISTS public.worker_change_password(uuid, text, text);

NOTIFY pgrst, 'reload schema';

-- Verification: only the _secure variant should remain.
--   SELECT proname, pg_get_function_identity_arguments(oid)
--   FROM pg_proc WHERE proname LIKE 'worker_change_password%';
