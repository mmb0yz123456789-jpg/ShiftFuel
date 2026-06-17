-- ============================================================
-- ShiftFuel — Admin + worker session tokens
-- Moves admin credentials server-side and gates all
-- sensitive writes behind a verified session token.
--
-- Run AFTER supabase-catchup.sql and supabase-security-fixes.sql.
-- Safe to re-run.
-- ============================================================


-- ──────────────────────────────────────────────────────────
-- 1. admin_config — stores hashed credentials server-side
--    (removes the need to expose hashes in admin-login.html)
-- ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_config (
  key   text PRIMARY KEY,
  value text NOT NULL
);

ALTER TABLE admin_config ENABLE ROW LEVEL SECURITY;
-- No SELECT policy = anon/authenticated cannot read this table.

-- Seed with the current hashes from admin-login.html.
-- To change the admin password: update these rows with new SHA-256 hashes,
-- or call an admin_change_credentials() helper you add later.
INSERT INTO admin_config (key, value) VALUES
  ('admin_username_hash', 'bb231df866f8d13d03a2dcd0ae16c5307a3437bb095c3b0ad5c7324f4afe9130'),
  ('admin_password_hash',  '5dcc42b2c69708ecddfaffac8db472d340a5385e5360c49ba89ab884d507642a')
ON CONFLICT (key) DO NOTHING;


-- ──────────────────────────────────────────────────────────
-- 2. admin_sessions — one row per live admin browser tab
-- ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_sessions (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL    DEFAULT now(),
  expires_at timestamptz NOT NULL    DEFAULT (now() + interval '8 hours')
);

ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;
-- No policies = default deny.


-- ──────────────────────────────────────────────────────────
-- 3. worker_sessions — one row per live worker browser tab
-- ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS worker_sessions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '8 hours')
);

CREATE INDEX IF NOT EXISTS worker_sessions_employee_idx
  ON worker_sessions (employee_id, expires_at);

ALTER TABLE worker_sessions ENABLE ROW LEVEL SECURITY;
-- No policies = default deny.


-- ──────────────────────────────────────────────────────────
-- 4. admin_create_session
--    Verifies hashed username + password against admin_config,
--    then returns a fresh session UUID.
--    Called from admin-login.html after the user submits the form.
-- ──────────────────────────────────────────────────────────

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
    RAISE EXCEPTION 'Invalid credentials';
  END IF;

  -- Prune stale sessions each time so the table stays small.
  DELETE FROM admin_sessions WHERE expires_at < now();

  INSERT INTO admin_sessions (expires_at)
  VALUES (now() + interval '8 hours')
  RETURNING id INTO new_token;

  RETURN new_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_create_session(text, text) TO anon, authenticated;


-- ──────────────────────────────────────────────────────────
-- 5. worker_create_session
--    Called after the worker's phone+password is verified
--    client-side. Returns a token scoped to that employee.
-- ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.worker_create_session(p_employee_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  new_token uuid;
BEGIN
  -- Verify the employee exists and is active.
  IF NOT EXISTS (
    SELECT 1 FROM employees WHERE id = p_employee_id AND active = true
  ) THEN
    RAISE EXCEPTION 'Employee not found or inactive';
  END IF;

  DELETE FROM worker_sessions WHERE expires_at < now();

  INSERT INTO worker_sessions (employee_id, expires_at)
  VALUES (p_employee_id, now() + interval '8 hours')
  RETURNING id INTO new_token;

  RETURN new_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.worker_create_session(uuid) TO anon, authenticated;


-- ──────────────────────────────────────────────────────────
-- 6. Internal helpers (not exposed to anon)
-- ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._verify_admin(p_token uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admin_sessions WHERE id = p_token AND expires_at > now()
  );
$$;

REVOKE EXECUTE ON FUNCTION public._verify_admin(uuid) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public._verify_worker(p_token uuid, OUT o_employee_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT employee_id FROM worker_sessions
  WHERE id = p_token AND expires_at > now()
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public._verify_worker(uuid) FROM anon, authenticated;


-- ──────────────────────────────────────────────────────────
-- 7. Admin employee write RPCs
-- ──────────────────────────────────────────────────────────

-- Update an existing employee. p_data keys that are present override
-- the stored value (including explicit JSON null → SQL NULL).
-- Keys that are absent leave the stored value unchanged.
CREATE OR REPLACE FUNCTION public.admin_update_employee(
  p_token       uuid,
  p_employee_id uuid,
  p_data        jsonb
)
RETURNS SETOF employees
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT _verify_admin(p_token) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  -- Sync availability work_location when home_location changes.
  IF p_data ? 'home_location' THEN
    UPDATE employee_availability
    SET work_location = (p_data->>'home_location')
    WHERE employee_id = p_employee_id;
  END IF;

  RETURN QUERY
  UPDATE employees SET
    full_name           = CASE WHEN p_data ? 'full_name'           THEN (p_data->>'full_name')                    ELSE full_name           END,
    phone               = CASE WHEN p_data ? 'phone'               THEN (p_data->>'phone')                        ELSE phone               END,
    email               = CASE WHEN p_data ? 'email'               THEN (p_data->>'email')                        ELSE email               END,
    home_location       = CASE WHEN p_data ? 'home_location'       THEN (p_data->>'home_location')                ELSE home_location       END,
    started_at          = CASE WHEN p_data ? 'started_at'          THEN (p_data->>'started_at')::date             ELSE started_at          END,
    active              = CASE WHEN p_data ? 'active'              THEN (p_data->>'active')::boolean              ELSE active              END,
    photo_url           = CASE WHEN p_data ? 'photo_url'           THEN (p_data->>'photo_url')                    ELSE photo_url           END,
    original_photo_url  = CASE WHEN p_data ? 'original_photo_url'  THEN (p_data->>'original_photo_url')           ELSE original_photo_url  END,
    cropped_photo_url   = CASE WHEN p_data ? 'cropped_photo_url'   THEN (p_data->>'cropped_photo_url')            ELSE cropped_photo_url   END,
    photo_zoom          = CASE WHEN p_data ? 'photo_zoom'          THEN (p_data->>'photo_zoom')::numeric          ELSE photo_zoom          END,
    photo_position_x    = CASE WHEN p_data ? 'photo_position_x'    THEN (p_data->>'photo_position_x')::numeric    ELSE photo_position_x    END,
    photo_position_y    = CASE WHEN p_data ? 'photo_position_y'    THEN (p_data->>'photo_position_y')::numeric    ELSE photo_position_y    END,
    worker_password_hash= CASE WHEN p_data ? 'worker_password_hash' THEN (p_data->>'worker_password_hash')        ELSE worker_password_hash END,
    worker_password_salt= CASE WHEN p_data ? 'worker_password_salt' THEN (p_data->>'worker_password_salt')        ELSE worker_password_salt END,
    password_updated_at = CASE WHEN p_data ? 'password_updated_at' THEN (p_data->>'password_updated_at')::timestamptz ELSE password_updated_at END,
    profile_updated_at  = CASE WHEN p_data ? 'profile_updated_at'  THEN (p_data->>'profile_updated_at')::timestamptz ELSE profile_updated_at  END
  WHERE id = p_employee_id
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_employee(uuid, uuid, jsonb) TO anon, authenticated;


-- Insert a new employee and return the created row.
CREATE OR REPLACE FUNCTION public.admin_insert_employee(
  p_token uuid,
  p_data  jsonb
)
RETURNS SETOF employees
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT _verify_admin(p_token) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  RETURN QUERY
  INSERT INTO employees (
    employee_code, full_name, phone, email,
    active, home_location, started_at,
    worker_password_hash, worker_password_salt, password_updated_at,
    profile_updated_at
  )
  VALUES (
    p_data->>'employee_code',
    p_data->>'full_name',
    p_data->>'phone',
    p_data->>'email',
    COALESCE((p_data->>'active')::boolean, true),
    p_data->>'home_location',
    (p_data->>'started_at')::date,
    p_data->>'worker_password_hash',
    p_data->>'worker_password_salt',
    (p_data->>'password_updated_at')::timestamptz,
    now()
  )
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_insert_employee(uuid, jsonb) TO anon, authenticated;


-- Delete an inactive employee and clean up references.
CREATE OR REPLACE FUNCTION public.admin_delete_employee(
  p_token       uuid,
  p_employee_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT _verify_admin(p_token) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  IF EXISTS (SELECT 1 FROM employees WHERE id = p_employee_id AND active = true) THEN
    RAISE EXCEPTION 'Deactivate the worker before permanently deleting them';
  END IF;

  -- Clear live assignment references (keep name/phone/photo text snapshot).
  UPDATE service_requests
  SET assigned_employee_id = NULL
  WHERE assigned_employee_id = p_employee_id;

  DELETE FROM employee_availability WHERE employee_id = p_employee_id;
  DELETE FROM employee_days_off     WHERE employee_id = p_employee_id;
  DELETE FROM employees             WHERE id = p_employee_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_employee(uuid, uuid) TO anon, authenticated;


-- ──────────────────────────────────────────────────────────
-- 8. Admin schedule write RPCs
-- ──────────────────────────────────────────────────────────

-- Replace all availability rows for one employee.
-- p_workdays: [{"day_of_week":1,"starts_at":"07:00","ends_at":"22:00"}, ...]
CREATE OR REPLACE FUNCTION public.admin_save_availability(
  p_token       uuid,
  p_employee_id uuid,
  p_workdays    jsonb,
  p_location    text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT _verify_admin(p_token) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  DELETE FROM employee_availability WHERE employee_id = p_employee_id;

  INSERT INTO employee_availability (employee_id, day_of_week, starts_at, ends_at, work_location)
  SELECT
    p_employee_id,
    (w->>'day_of_week')::int,
    (w->>'starts_at')::time,
    (w->>'ends_at')::time,
    p_location
  FROM jsonb_array_elements(p_workdays) w;

  -- Keep home_location in sync.
  UPDATE employees
  SET home_location = p_location, profile_updated_at = now()
  WHERE id = p_employee_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_save_availability(uuid, uuid, jsonb, text) TO anon, authenticated;


-- Replace all days-off rows for one employee.
-- p_days_off: ['2025-07-04', '2025-12-25', ...]
CREATE OR REPLACE FUNCTION public.admin_save_days_off(
  p_token       uuid,
  p_employee_id uuid,
  p_days_off    text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT _verify_admin(p_token) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  DELETE FROM employee_days_off WHERE employee_id = p_employee_id;

  IF array_length(p_days_off, 1) > 0 THEN
    INSERT INTO employee_days_off (employee_id, day_off)
    SELECT p_employee_id, d::date
    FROM unnest(p_days_off) d;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_save_days_off(uuid, uuid, text[]) TO anon, authenticated;


-- ──────────────────────────────────────────────────────────
-- 9. Admin applicant write RPC
-- ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_update_applicant(
  p_token        uuid,
  p_applicant_id uuid,
  p_data         jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT _verify_admin(p_token) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  UPDATE applicants SET
    status = CASE WHEN p_data ? 'status' THEN (p_data->>'status') ELSE status END
  WHERE id = p_applicant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_applicant(uuid, uuid, jsonb) TO anon, authenticated;


-- ──────────────────────────────────────────────────────────
-- 10. Worker schedule write RPCs
--     Verified by worker_sessions token instead of employee_id directly.
-- ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.worker_save_availability(
  p_token    uuid,
  p_workdays jsonb,
  p_location text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employee_id uuid;
BEGIN
  v_employee_id := _verify_worker(p_token);
  IF v_employee_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  DELETE FROM employee_availability WHERE employee_id = v_employee_id;

  INSERT INTO employee_availability (employee_id, day_of_week, starts_at, ends_at, work_location)
  SELECT
    v_employee_id,
    (w->>'day_of_week')::int,
    (w->>'starts_at')::time,
    (w->>'ends_at')::time,
    p_location
  FROM jsonb_array_elements(p_workdays) w;

  UPDATE employees
  SET home_location = p_location, profile_updated_at = now()
  WHERE id = v_employee_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.worker_save_availability(uuid, jsonb, text) TO anon, authenticated;


CREATE OR REPLACE FUNCTION public.worker_save_days_off(
  p_token    uuid,
  p_days_off text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employee_id uuid;
BEGIN
  v_employee_id := _verify_worker(p_token);
  IF v_employee_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  DELETE FROM employee_days_off WHERE employee_id = v_employee_id;

  IF array_length(p_days_off, 1) > 0 THEN
    INSERT INTO employee_days_off (employee_id, day_off)
    SELECT v_employee_id, d::date
    FROM unnest(p_days_off) d;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.worker_save_days_off(uuid, text[]) TO anon, authenticated;


-- Worker profile update (name, phone, location, photo fields — NOT password via this path).
CREATE OR REPLACE FUNCTION public.worker_update_profile(
  p_token uuid,
  p_data  jsonb
)
RETURNS SETOF employees
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employee_id uuid;
BEGIN
  v_employee_id := _verify_worker(p_token);
  IF v_employee_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  RETURN QUERY
  UPDATE employees SET
    full_name          = CASE WHEN p_data ? 'full_name'          THEN (p_data->>'full_name')                   ELSE full_name          END,
    phone              = CASE WHEN p_data ? 'phone'              THEN (p_data->>'phone')                       ELSE phone              END,
    home_location      = CASE WHEN p_data ? 'home_location'      THEN (p_data->>'home_location')               ELSE home_location      END,
    photo_url          = CASE WHEN p_data ? 'photo_url'          THEN (p_data->>'photo_url')                   ELSE photo_url          END,
    original_photo_url = CASE WHEN p_data ? 'original_photo_url' THEN (p_data->>'original_photo_url')          ELSE original_photo_url END,
    cropped_photo_url  = CASE WHEN p_data ? 'cropped_photo_url'  THEN (p_data->>'cropped_photo_url')           ELSE cropped_photo_url  END,
    photo_zoom         = CASE WHEN p_data ? 'photo_zoom'         THEN (p_data->>'photo_zoom')::numeric         ELSE photo_zoom         END,
    photo_position_x   = CASE WHEN p_data ? 'photo_position_x'   THEN (p_data->>'photo_position_x')::numeric   ELSE photo_position_x   END,
    photo_position_y   = CASE WHEN p_data ? 'photo_position_y'   THEN (p_data->>'photo_position_y')::numeric   ELSE photo_position_y   END,
    profile_updated_at = now()
  WHERE id = v_employee_id
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION public.worker_update_profile(uuid, jsonb) TO anon, authenticated;


-- Worker password change (separate from profile so it's auditable).
CREATE OR REPLACE FUNCTION public.worker_change_password(
  p_token uuid,
  p_hash  text,
  p_salt  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employee_id uuid;
BEGIN
  v_employee_id := _verify_worker(p_token);
  IF v_employee_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  UPDATE employees SET
    worker_password_hash = p_hash,
    worker_password_salt = p_salt,
    password_updated_at  = now(),
    profile_updated_at   = now()
  WHERE id = v_employee_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.worker_change_password(uuid, text, text) TO anon, authenticated;


-- ──────────────────────────────────────────────────────────
-- 11. Restrict write policies on sensitive tables
--     Removes the permissive ALL policies; keeps SELECT only.
--     All writes now go through the security-definer RPCs above.
-- ──────────────────────────────────────────────────────────

-- employees
DROP POLICY IF EXISTS "Anyone can save employees" ON employees;

DROP POLICY IF EXISTS "Anyone can read employees" ON employees;
CREATE POLICY "Anyone can read employees"
ON employees FOR SELECT
TO anon, authenticated
USING (true);

-- employee_availability
DROP POLICY IF EXISTS "Anyone can save employee availability" ON employee_availability;

DROP POLICY IF EXISTS "Anyone can read employee availability" ON employee_availability;
CREATE POLICY "Anyone can read employee availability"
ON employee_availability FOR SELECT
TO anon, authenticated
USING (true);

-- employee_days_off
DROP POLICY IF EXISTS "Anyone can save employee days off" ON employee_days_off;

DROP POLICY IF EXISTS "Anyone can read employee days off" ON employee_days_off;
CREATE POLICY "Anyone can read employee days off"
ON employee_days_off FOR SELECT
TO anon, authenticated
USING (true);

-- vehicle_psi_guides
DROP POLICY IF EXISTS "Anyone can save vehicle psi guides" ON vehicle_psi_guides;

DROP POLICY IF EXISTS "Anyone can read vehicle psi guides" ON vehicle_psi_guides;
CREATE POLICY "Anyone can read vehicle psi guides"
ON vehicle_psi_guides FOR SELECT
TO anon, authenticated
USING (true);

-- applicants: keep public INSERT (job form), remove UPDATE (now goes through RPC)
DROP POLICY IF EXISTS "Anyone can update applicants" ON applicants;
