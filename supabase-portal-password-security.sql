-- ============================================================
-- ShiftFuel — Portal Password Security
-- Run after supabase-advisor-security-cleanup.sql (step 6).
-- Requires: pgcrypto (already enabled).
-- ============================================================
-- Changes:
--   1. Add lockout/audit columns to employees
--   2. Add admin_lockout table (single row, key/value-free lockout)
--   3. Updated worker_login — server-side lockout (3 attempts / 15 min)
--   4. Updated admin_create_session — server-side lockout
--   5. New worker_change_password_secure — server hashes, requires current pw
--   6. New admin_reset_worker_password — server generates temp pw, sets must_change
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. Employee lockout / audit columns
-- ────────────────────────────────────────────────────────────
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS failed_login_attempts  int          NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until           timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at          timestamptz,
  ADD COLUMN IF NOT EXISTS must_change_password   boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS password_reset_at      timestamptz;


-- ────────────────────────────────────────────────────────────
-- 2. Admin lockout table — single row, accessed only via SECURITY DEFINER
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_lockout (
  id              int          PRIMARY KEY DEFAULT 1,
  failed_attempts int          NOT NULL DEFAULT 0,
  locked_until    timestamptz
);
ALTER TABLE admin_lockout ENABLE ROW LEVEL SECURITY;
-- No RLS policies — all access goes through SECURITY DEFINER functions.

INSERT INTO admin_lockout (id) VALUES (1) ON CONFLICT DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- 3. Updated worker_login
--    Adds: server-side lockout (3 attempts → 15-min lock)
--    Adds: must_change_password in response
--    Preserves: same phone normalization, same hash format (salt:password)
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.worker_login(
  p_identifier text,
  p_password   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employee      employees%ROWTYPE;
  v_computed      text;
  v_token         uuid;
  v_new_attempts  int;
BEGIN
  SELECT * INTO v_employee
  FROM employees
  WHERE active = true
    AND (
      lower(trim(full_name)) = lower(trim(p_identifier))
      OR regexp_replace(coalesce(phone, ''), '\D', '', 'g')
           = regexp_replace(p_identifier, '\D', '', 'g')
    )
  LIMIT 1;

  IF NOT FOUND
     OR v_employee.worker_password_hash IS NULL
     OR v_employee.worker_password_salt IS NULL
  THEN
    RAISE EXCEPTION 'INVALID_CREDENTIALS';
  END IF;

  -- Reject if currently locked.
  IF v_employee.locked_until IS NOT NULL AND v_employee.locked_until > now() THEN
    RAISE EXCEPTION 'ACCOUNT_LOCKED';
  END IF;

  v_computed := encode(
    digest(v_employee.worker_password_salt || ':' || p_password, 'sha256'),
    'hex'
  );

  IF v_computed <> v_employee.worker_password_hash THEN
    -- Reset counter if a prior lockout has expired.
    v_new_attempts := CASE
      WHEN v_employee.locked_until IS NOT NULL AND v_employee.locked_until <= now() THEN 1
      ELSE v_employee.failed_login_attempts + 1
    END;

    UPDATE employees SET
      failed_login_attempts = v_new_attempts,
      locked_until = CASE
        WHEN v_new_attempts >= 3 THEN now() + interval '15 minutes'
        ELSE NULL
      END
    WHERE id = v_employee.id;

    RAISE EXCEPTION 'INVALID_CREDENTIALS';
  END IF;

  -- Success — reset lockout, record login time.
  UPDATE employees SET
    failed_login_attempts = 0,
    locked_until          = NULL,
    last_login_at         = now()
  WHERE id = v_employee.id;

  DELETE FROM worker_sessions WHERE expires_at < now();

  INSERT INTO worker_sessions (employee_id, expires_at)
  VALUES (v_employee.id, now() + interval '8 hours')
  RETURNING id INTO v_token;

  RETURN jsonb_build_object(
    'token',                v_token,
    'employee_id',          v_employee.id,
    'full_name',            v_employee.full_name,
    'must_change_password', v_employee.must_change_password
  );
END;
$$;

-- Grant preserved from supabase-worker-login.sql.
GRANT EXECUTE ON FUNCTION public.worker_login(text, text) TO anon, authenticated;


-- ────────────────────────────────────────────────────────────
-- 4. Updated admin_create_session
--    Adds: server-side lockout via admin_lockout table
--    Preserves: same key/value admin_config lookup, same return type
-- ────────────────────────────────────────────────────────────
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
  v_lockout        admin_lockout%ROWTYPE;
  v_new_attempts   int;
BEGIN
  SELECT * INTO v_lockout FROM admin_lockout WHERE id = 1;

  IF v_lockout.locked_until IS NOT NULL AND v_lockout.locked_until > now() THEN
    RAISE EXCEPTION 'ACCOUNT_LOCKED';
  END IF;

  SELECT value INTO stored_user_hash FROM admin_config WHERE key = 'admin_username_hash';
  SELECT value INTO stored_pass_hash FROM admin_config WHERE key = 'admin_password_hash';

  IF stored_user_hash IS NULL
     OR stored_pass_hash IS NULL
     OR p_username_hash <> stored_user_hash
     OR p_password_hash <> stored_pass_hash
  THEN
    v_new_attempts := CASE
      WHEN v_lockout.locked_until IS NOT NULL AND v_lockout.locked_until <= now() THEN 1
      ELSE v_lockout.failed_attempts + 1
    END;

    UPDATE admin_lockout SET
      failed_attempts = v_new_attempts,
      locked_until = CASE
        WHEN v_new_attempts >= 3 THEN now() + interval '15 minutes'
        ELSE NULL
      END
    WHERE id = 1;

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

GRANT EXECUTE ON FUNCTION public.admin_create_session(text, text) TO anon, authenticated;


-- ────────────────────────────────────────────────────────────
-- 5. worker_change_password_secure
--    Browser sends plaintext current + new password.
--    Server verifies current password, enforces 10-char minimum,
--    generates new salt, hashes server-side.
--    Replaces worker_change_password (which accepted browser-computed hashes).
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.worker_change_password_secure(
  p_token            uuid,
  p_current_password text,
  p_new_password     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employee_id   uuid;
  v_employee      employees%ROWTYPE;
  v_current_hash  text;
  v_new_salt      text;
  v_new_hash      text;
BEGIN
  v_employee_id := _verify_worker(p_token);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_SESSION';
  END IF;

  SELECT * INTO v_employee FROM employees WHERE id = v_employee_id;

  v_current_hash := encode(
    digest(v_employee.worker_password_salt || ':' || p_current_password, 'sha256'),
    'hex'
  );

  IF v_current_hash != v_employee.worker_password_hash THEN
    RAISE EXCEPTION 'INVALID_CURRENT_PASSWORD';
  END IF;

  IF length(p_new_password) < 10 THEN
    RAISE EXCEPTION 'PASSWORD_TOO_SHORT';
  END IF;

  v_new_salt := encode(gen_random_bytes(16), 'hex');
  v_new_hash := encode(digest(v_new_salt || ':' || p_new_password, 'sha256'), 'hex');

  UPDATE employees SET
    worker_password_salt  = v_new_salt,
    worker_password_hash  = v_new_hash,
    must_change_password  = false,
    password_reset_at     = now(),
    password_updated_at   = now()
  WHERE id = v_employee_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.worker_change_password_secure(uuid, text, text) TO anon, authenticated;


-- ────────────────────────────────────────────────────────────
-- 6. admin_reset_worker_password
--    Generates a server-side temp password in format SF-XXXX-XXXX-XXXX.
--    Sets must_change_password = true so worker is forced to change on next login.
--    Returns the plaintext temp password (admin must show it once and copy it).
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_reset_worker_password(
  p_token       uuid,
  p_employee_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
  SELECT EXISTS(
    SELECT 1 FROM admin_sessions WHERE id = p_token AND expires_at > now()
  ) INTO v_session_valid;

  IF NOT v_session_valid THEN
    RAISE EXCEPTION 'INVALID_SESSION';
  END IF;

  -- Build SF-XXXX-XXXX-XXXX from allowed chars (no 0/O/1/I ambiguity).
  FOR v_group IN 1..3 LOOP
    v_temp_password := v_temp_password || '-';
    FOR v_pos IN 1..4 LOOP
      v_temp_password := v_temp_password
        || substr(v_chars, (floor(random() * 32) + 1)::int, 1);
    END LOOP;
  END LOOP;

  v_new_salt := encode(gen_random_bytes(16), 'hex');
  v_new_hash := encode(digest(v_new_salt || ':' || v_temp_password, 'sha256'), 'hex');

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
-- 7. Verification queries (run manually after deploying)
-- ────────────────────────────────────────────────────────────
/*
-- Confirm employee columns added:
SELECT column_name FROM information_schema.columns
WHERE table_name = 'employees'
  AND column_name IN (
    'failed_login_attempts', 'locked_until', 'last_login_at',
    'must_change_password', 'password_reset_at'
  );

-- Confirm admin_lockout table has its seed row:
SELECT * FROM admin_lockout;

-- Confirm all four functions exist:
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'worker_login',
    'admin_create_session',
    'worker_change_password_secure',
    'admin_reset_worker_password'
  )
ORDER BY routine_name;
*/

-- Refresh PostgREST schema cache after all function changes.
NOTIFY pgrst, 'reload schema';
