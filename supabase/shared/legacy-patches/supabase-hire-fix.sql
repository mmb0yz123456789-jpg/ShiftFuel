-- ============================================================
-- ShiftFuel — Hire-applicant fix
-- Run this in the Supabase SQL Editor to fix the error:
--   "Could not find the function public.admin_reset_worker_password
--    (p_employee_id, p_token) in the schema cache"
--
-- Safe to run multiple times (IF NOT EXISTS / OR REPLACE).
-- Requires: pgcrypto (enabled by default on Supabase).
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. New columns on employees
--    Used by admin_reset_worker_password and worker login lockout.
--    IF NOT EXISTS means this is safe to run again.
-- ────────────────────────────────────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS must_change_password   boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_reset_at      timestamptz,
  ADD COLUMN IF NOT EXISTS failed_login_attempts  int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until           timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at          timestamptz;


-- ────────────────────────────────────────────────────────────
-- 2. admin_reset_worker_password
--    Called by admin.js when hiring an applicant or resetting
--    a worker password. Generates a server-side temp password
--    in SF-XXXX-XXXX-XXXX format, stores the hash, and returns
--    the plaintext once. Sets must_change_password = true.
--
--    Parameters (named, order does not matter to the caller):
--      p_token       — active admin session UUID
--      p_employee_id — UUID of the employee to reset
--    Returns: plaintext temp password (text)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_reset_worker_password(
  p_token       uuid,
  p_employee_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_session_valid boolean;
  v_chars         text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_temp_password text := 'SF';
  v_group         int;
  v_pos           int;
  v_new_salt      text;
  v_new_hash      text;
BEGIN
  -- Verify the admin session is active.
  SELECT EXISTS(
    SELECT 1 FROM admin_sessions WHERE id = p_token AND expires_at > now()
  ) INTO v_session_valid;

  IF NOT v_session_valid THEN
    RAISE EXCEPTION 'INVALID_SESSION';
  END IF;

  -- Build SF-XXXX-XXXX-XXXX using unambiguous characters.
  FOR v_group IN 1..3 LOOP
    v_temp_password := v_temp_password || '-';
    FOR v_pos IN 1..4 LOOP
      v_temp_password := v_temp_password
        || substr(v_chars, (floor(random() * 32) + 1)::int, 1);
    END LOOP;
  END LOOP;

  -- Hash the generated password server-side.
  -- extensions.gen_random_bytes / extensions.digest: pgcrypto lives in the extensions schema on Supabase.
  v_new_salt := encode(extensions.gen_random_bytes(16), 'hex');
  v_new_hash := encode(extensions.digest(v_new_salt || ':' || v_temp_password, 'sha256'), 'hex');

  UPDATE employees SET
    worker_password_salt  = v_new_salt,
    worker_password_hash  = v_new_hash,
    must_change_password  = true,
    password_reset_at     = now(),
    failed_login_attempts = 0,
    locked_until          = NULL
  WHERE id = p_employee_id AND active = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'EMPLOYEE_NOT_FOUND';
  END IF;

  RETURN v_temp_password;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_worker_password(uuid, uuid) TO anon, authenticated;


-- ────────────────────────────────────────────────────────────
-- 3. Refresh the PostgREST schema cache so the new function
--    is immediately visible to the Supabase JS client.
-- ────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';


-- ────────────────────────────────────────────────────────────
-- Verification — run after the above to confirm success:
-- ────────────────────────────────────────────────────────────
/*
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'admin_reset_worker_password';
-- Should return one row.

SELECT column_name
FROM information_schema.columns
WHERE table_name = 'employees'
  AND column_name IN (
    'must_change_password', 'password_reset_at',
    'failed_login_attempts', 'locked_until', 'last_login_at'
  );
-- Should return 5 rows.
*/
