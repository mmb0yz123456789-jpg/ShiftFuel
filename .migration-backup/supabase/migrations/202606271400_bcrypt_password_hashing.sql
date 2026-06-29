-- ============================================================
-- ShiftFuel — Move all password hashing to bcrypt (pgcrypto crypt/gen_salt)
--
-- Before: admin password = UNSALTED SHA-256 (the stored hash was itself a
-- login-equivalent and trivially crackable); worker passwords = single-round
-- salted SHA-256 (GPU-crackable if the table ever leaked).
--
-- After: every stored credential is bcrypt (cost 10). bcrypt embeds its own salt,
-- is deliberately slow, and is not reversible/replayable.
--
--   * ADMIN — the browser still sends SHA-256(password) to /api/admin-login (no
--     client change). We bcrypt that SHA-256 server-side: stored = crypt(sha256,
--     bf-salt). Because the existing stored value already equals that SHA-256, we
--     can bcrypt-WRAP it in place — the current admin password keeps working, so
--     the admin is never locked out. (Pre-hashing with SHA-256 also sidesteps
--     bcrypt's 72-byte input truncation.)
--
--   * WORKERS — forced reset (per request). The browser sends the PLAINTEXT
--     password to worker_login, so we bcrypt the plaintext directly and the old
--     per-worker salt column becomes unused. Existing worker hashes are NULLed and
--     must_change_password is set; re-issue each worker a temp password from the
--     admin Workers tab (admin_reset_worker_password, now bcrypt), and they set a
--     new one on first login (worker_change_password_secure, now bcrypt).
--
-- Every crypt() call is guarded with a `left(hash,2) = '$2'` (is-bcrypt) check so
-- a leftover legacy hash fails cleanly instead of raising "invalid salt".
--
-- ⚠️ Depends on 202606271100 (admin_create_session is service_role-only). This
--    file re-creates that function, so it re-asserts the same REVOKE/GRANT.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. admin_create_session — bcrypt-verify the password (no global hard-lock;
--    keeps the failure counter from 202606271100). Username stays SHA-256 equality.
-- ─────────────────────────────────────────────────────────────────────────────
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
     OR left(stored_pass_hash, 2) <> '$2'
     OR p_username_hash <> stored_user_hash
     OR extensions.crypt(p_password_hash, stored_pass_hash) <> stored_pass_hash
  THEN
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

REVOKE EXECUTE ON FUNCTION public.admin_create_session(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_create_session(text, text) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.admin_create_session(text, text) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. admin_change_password — bcrypt-verify current, bcrypt-store new.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_change_password(
  p_token                 text,
  p_current_password_hash text,
  p_new_password_hash     text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session_valid boolean;
  v_stored_hash   text;
BEGIN
  SELECT exists(
    SELECT 1 FROM admin_sessions WHERE id = p_token::uuid AND expires_at > now()
  ) INTO v_session_valid;

  IF NOT v_session_valid THEN
    RAISE EXCEPTION 'INVALID_SESSION';
  END IF;

  SELECT value INTO v_stored_hash FROM admin_config WHERE key = 'admin_password_hash';

  IF v_stored_hash IS NULL
     OR left(v_stored_hash, 2) <> '$2'
     OR extensions.crypt(p_current_password_hash, v_stored_hash) <> v_stored_hash
  THEN
    RAISE EXCEPTION 'INVALID_CURRENT_PASSWORD';
  END IF;

  UPDATE admin_config
     SET value = extensions.crypt(p_new_password_hash, extensions.gen_salt('bf', 10))
   WHERE key = 'admin_password_hash';

  RETURN true;
END;
$$;

REVOKE ALL    ON FUNCTION public.admin_change_password(text, text, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.admin_change_password(text, text, text) TO anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. worker_login — bcrypt-verify the plaintext password (per-account lockout
--    preserved). No longer requires the legacy salt column.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.worker_login(
  p_identifier text,
  p_password   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_employee     employees%ROWTYPE;
  v_token        uuid;
  v_new_attempts int;
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
     OR left(v_employee.worker_password_hash, 2) <> '$2'
  THEN
    RAISE EXCEPTION 'INVALID_CREDENTIALS';
  END IF;

  IF v_employee.locked_until IS NOT NULL AND v_employee.locked_until > now() THEN
    RAISE EXCEPTION 'ACCOUNT_LOCKED';
  END IF;

  IF extensions.crypt(p_password, v_employee.worker_password_hash) <> v_employee.worker_password_hash THEN
    v_new_attempts := CASE
      WHEN v_employee.locked_until IS NOT NULL AND v_employee.locked_until <= now() THEN 1
      ELSE v_employee.failed_login_attempts + 1
    END;

    UPDATE employees SET
      failed_login_attempts = v_new_attempts,
      locked_until = CASE WHEN v_new_attempts >= 3 THEN now() + interval '15 minutes' ELSE NULL END
    WHERE id = v_employee.id;

    RAISE EXCEPTION 'INVALID_CREDENTIALS';
  END IF;

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

GRANT EXECUTE ON FUNCTION public.worker_login(text, text) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. worker_change_password_secure — bcrypt-verify current, bcrypt-store new.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.worker_change_password_secure(
  p_token            uuid,
  p_current_password text,
  p_new_password     text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_employee_id uuid;
  v_employee    employees%ROWTYPE;
BEGIN
  v_employee_id := _verify_worker(p_token);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_SESSION';
  END IF;

  SELECT * INTO v_employee FROM employees WHERE id = v_employee_id;

  IF v_employee.worker_password_hash IS NULL
     OR left(v_employee.worker_password_hash, 2) <> '$2'
     OR extensions.crypt(p_current_password, v_employee.worker_password_hash) <> v_employee.worker_password_hash
  THEN
    RAISE EXCEPTION 'INVALID_CURRENT_PASSWORD';
  END IF;

  IF length(p_new_password) < 10 THEN
    RAISE EXCEPTION 'PASSWORD_TOO_SHORT';
  END IF;

  UPDATE employees SET
    worker_password_hash  = extensions.crypt(p_new_password, extensions.gen_salt('bf', 10)),
    worker_password_salt  = NULL,
    must_change_password  = false,
    password_reset_at     = now(),
    password_updated_at   = now()
  WHERE id = v_employee_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.worker_change_password_secure(uuid, text, text) TO anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. admin_reset_worker_password — bcrypt the generated temp password.
-- ─────────────────────────────────────────────────────────────────────────────
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
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM admin_sessions WHERE id = p_token AND expires_at > now()
  ) INTO v_session_valid;

  IF NOT v_session_valid THEN
    RAISE EXCEPTION 'INVALID_SESSION';
  END IF;

  FOR v_group IN 1..3 LOOP
    v_temp_password := v_temp_password || '-';
    FOR v_pos IN 1..4 LOOP
      v_temp_password := v_temp_password
        || substr(v_chars, (floor(random() * 32) + 1)::int, 1);
    END LOOP;
  END LOOP;

  UPDATE employees SET
    worker_password_hash  = extensions.crypt(v_temp_password, extensions.gen_salt('bf', 10)),
    worker_password_salt  = NULL,
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Cut over the stored credentials.
-- ─────────────────────────────────────────────────────────────────────────────

-- ADMIN: bcrypt-wrap the existing SHA-256 in place (only if not already bcrypt).
-- The current admin password keeps working — no lockout, no reset needed.
UPDATE admin_config
   SET value = extensions.crypt(value, extensions.gen_salt('bf', 10))
 WHERE key = 'admin_password_hash'
   AND value IS NOT NULL
   AND left(value, 2) <> '$2';

-- WORKERS: forced reset — invalidate existing passwords. Each worker must be
-- re-issued a temp password from the admin Workers tab before they can log in.
UPDATE employees
   SET worker_password_hash  = NULL,
       worker_password_salt  = NULL,
       must_change_password  = true,
       failed_login_attempts = 0,
       locked_until          = NULL
 WHERE worker_password_hash IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- OPTIONAL — also set a BRAND-NEW admin password (instead of keeping the current
-- one). Replace the plaintext and run separately. The SHA-256 wrapper matches what
-- the browser sends, and bcrypt wraps it:
--
--   UPDATE admin_config
--      SET value = extensions.crypt(
--            encode(extensions.digest('YOUR_NEW_ADMIN_PASSWORD', 'sha256'), 'hex'),
--            extensions.gen_salt('bf', 10))
--    WHERE key = 'admin_password_hash';
--
-- VERIFY (after re-issuing a worker temp and logging in once):
--   SELECT key, left(value, 4) AS fmt FROM admin_config WHERE key = 'admin_password_hash';  -- '$2b$'
--   SELECT full_name, left(worker_password_hash, 4) AS fmt FROM employees WHERE active;       -- '$2b$' once reset
-- ─────────────────────────────────────────────────────────────────────────────
