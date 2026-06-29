-- Worker self-service login username.
--
-- Workers can set/change a unique username they log in with. The immutable
-- employees.id stays the admin's stable reference (assignments already key off
-- assigned_employee_id), and full_name stays the customer-facing display name —
-- so changing the username never affects what customers see or breaks tracking.
--
-- Login now matches username OR phone (name matching is dropped because names
-- collide). Existing workers without a username can still log in by phone until
-- they set one.

begin;

-- 1. Username column + case-insensitive uniqueness.
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS username text;

CREATE UNIQUE INDEX IF NOT EXISTS employees_username_lower_unique
  ON public.employees (lower(username))
  WHERE username IS NOT NULL AND btrim(username) <> '';

-- 2. Expose username through the public-safe view (mirrors the current column
--    list + the new one). Keep the existing security flags.
create or replace view public.employees_public
  with (security_invoker = true, security_barrier = true)
as
  select
    id, employee_code, full_name, phone, email, active, home_location, started_at,
    photo_url, original_photo_url, cropped_photo_url, photo_zoom,
    photo_position_x, photo_position_y, profile_updated_at, password_updated_at,
    last_seen_at, presence_status, background_verified, username
  from public.employees;

grant select on public.employees_public to anon, authenticated;
grant select (username) on public.employees to anon, authenticated;

-- 3. worker_update_profile — allow the worker to set their username (trimmed,
--    empty -> NULL). Uniqueness is enforced by the index above; a clash raises
--    unique_violation, which worker.js turns into a friendly "taken" message.
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
  v_updated     employees%ROWTYPE;
BEGIN
  v_employee_id := _verify_worker(p_token);
  IF v_employee_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  UPDATE employees SET
    full_name          = CASE WHEN p_data ? 'full_name'          THEN (p_data->>'full_name')                 ELSE full_name          END,
    username           = CASE WHEN p_data ? 'username'            THEN NULLIF(btrim(p_data->>'username'), '') ELSE username           END,
    phone              = CASE WHEN p_data ? 'phone'              THEN (p_data->>'phone')                     ELSE phone              END,
    home_location      = CASE WHEN p_data ? 'home_location'      THEN (p_data->>'home_location')             ELSE home_location      END,
    photo_url          = CASE WHEN p_data ? 'photo_url'          THEN (p_data->>'photo_url')                 ELSE photo_url          END,
    original_photo_url = CASE WHEN p_data ? 'original_photo_url' THEN (p_data->>'original_photo_url')        ELSE original_photo_url END,
    cropped_photo_url  = CASE WHEN p_data ? 'cropped_photo_url'  THEN (p_data->>'cropped_photo_url')         ELSE cropped_photo_url  END,
    photo_zoom         = CASE WHEN p_data ? 'photo_zoom'         THEN (p_data->>'photo_zoom')::numeric       ELSE photo_zoom         END,
    photo_position_x   = CASE WHEN p_data ? 'photo_position_x'   THEN (p_data->>'photo_position_x')::numeric ELSE photo_position_x   END,
    photo_position_y   = CASE WHEN p_data ? 'photo_position_y'   THEN (p_data->>'photo_position_y')::numeric ELSE photo_position_y   END,
    profile_updated_at = now()
  WHERE id = v_employee_id
  RETURNING * INTO v_updated;

  -- Keep display fields on the worker's open requests in sync (username is NOT
  -- a display field, so it is intentionally not synced here).
  UPDATE service_requests SET
    assigned_worker_name               = v_updated.full_name,
    assigned_worker_phone              = v_updated.phone,
    assigned_worker_photo_url          = COALESCE(v_updated.cropped_photo_url, v_updated.photo_url),
    assigned_worker_original_photo_url = v_updated.original_photo_url,
    updated_at                         = now()
  WHERE assigned_employee_id = v_employee_id;

  RETURN NEXT v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.worker_update_profile(uuid, jsonb) TO anon, authenticated;

-- 4. worker_login — match by username (case-insensitive) or phone (>= 7 digits,
--    so a username that happens to contain a digit isn't treated as a phone).
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
  v_employee      employees%ROWTYPE;
  v_computed      text;
  v_token         uuid;
  v_new_attempts  int;
BEGIN
  SELECT * INTO v_employee
  FROM employees
  WHERE active = true
    AND (
      (username IS NOT NULL AND btrim(username) <> ''
        AND lower(btrim(username)) = lower(btrim(p_identifier)))
      OR (
        length(regexp_replace(p_identifier, '\D', '', 'g')) >= 7
        AND regexp_replace(coalesce(phone, ''), '\D', '', 'g')
              = regexp_replace(p_identifier, '\D', '', 'g')
      )
    )
  LIMIT 1;

  IF NOT FOUND
     OR v_employee.worker_password_hash IS NULL
     OR v_employee.worker_password_salt IS NULL
  THEN
    RAISE EXCEPTION 'INVALID_CREDENTIALS';
  END IF;

  IF v_employee.locked_until IS NOT NULL AND v_employee.locked_until > now() THEN
    RAISE EXCEPTION 'ACCOUNT_LOCKED';
  END IF;

  v_computed := encode(
    extensions.digest(v_employee.worker_password_salt || ':' || p_password, 'sha256'),
    'hex'
  );

  IF v_computed <> v_employee.worker_password_hash THEN
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

commit;
