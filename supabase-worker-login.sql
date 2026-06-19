-- ============================================================
-- ShiftFuel — Server-side worker login RPC
-- Run in Supabase SQL Editor.
-- Requires: pgcrypto extension (enabled by default on Supabase).
--
-- This replaces the client-side password hash comparison in
-- worker-login.html. Password hashes and salts are never sent
-- to the browser.
-- ============================================================

-- Ensure pgcrypto is available for digest().
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ──────────────────────────────────────────────────────────
-- worker_login
-- Accepts the worker's name or phone + their plaintext password.
-- Verifies the password server-side by re-hashing with the stored
-- salt and comparing to the stored hash.
-- Returns a JSON object with session token + basic worker info.
-- Raises an exception (never returns null) on any failure so the
-- client never has to distinguish "no result" from "wrong password".
-- ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.worker_login(
  p_identifier text,   -- worker name or phone number
  p_password   text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_employee  employees%ROWTYPE;
  v_computed  text;
  v_token     uuid;
BEGIN
  -- Normalize the identifier for matching.
  -- Accepts: full name (case-insensitive) or phone (digits only).
  SELECT * INTO v_employee
  FROM employees
  WHERE active = true
    AND (
      lower(trim(full_name)) = lower(trim(p_identifier))
      OR regexp_replace(coalesce(phone, ''), '\D', '', 'g')
           = regexp_replace(p_identifier, '\D', '', 'g')
    )
  LIMIT 1;

  -- Use a constant-time failure path — same exception for all failures.
  IF NOT FOUND
     OR v_employee.worker_password_hash IS NULL
     OR v_employee.worker_password_salt IS NULL
  THEN
    RAISE EXCEPTION 'Invalid credentials';
  END IF;

  -- Hash: sha256(salt:password), hex-encoded — matches client-side sha256Hex().
  v_computed := encode(
    extensions.digest(v_employee.worker_password_salt || ':' || p_password, 'sha256'),
    'hex'
  );

  IF v_computed <> v_employee.worker_password_hash THEN
    RAISE EXCEPTION 'Invalid credentials';
  END IF;

  -- Clean up expired sessions, then create a new one.
  DELETE FROM worker_sessions WHERE expires_at < now();

  INSERT INTO worker_sessions (employee_id, expires_at)
  VALUES (v_employee.id, now() + interval '8 hours')
  RETURNING id INTO v_token;

  RETURN jsonb_build_object(
    'token',       v_token,
    'employee_id', v_employee.id,
    'full_name',   v_employee.full_name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.worker_login(text, text) TO anon, authenticated;


-- ──────────────────────────────────────────────────────────
-- RLS: restrict password columns from anonymous reads.
-- The employees SELECT policy currently allows anon to read
-- all columns including worker_password_hash and
-- worker_password_salt. Replace it with a column-safe view
-- and a tighter policy.
--
-- Option A (recommended): use a security-barrier view.
-- The view is what the login page and worker.js query; the
-- underlying table is not directly accessible to anon.
-- ──────────────────────────────────────────────────────────

-- Public-safe view: excludes password columns.
CREATE OR REPLACE VIEW public.employees_public
  WITH (security_barrier = true)
AS
  SELECT
    id,
    employee_code,
    full_name,
    phone,
    email,
    active,
    home_location,
    started_at,
    photo_url,
    original_photo_url,
    cropped_photo_url,
    photo_zoom,
    photo_position_x,
    photo_position_y,
    profile_updated_at,
    password_updated_at
  FROM employees;

-- Allow anon to query the view (not the base table directly).
GRANT SELECT ON public.employees_public TO anon, authenticated;

-- ──────────────────────────────────────────────────────────
-- REQUIRED: Lock down the employees base table.
-- All app code (admin.js, worker.js) now queries employees_public
-- or SECURITY DEFINER RPCs — not the base table directly.
-- Run this block to prevent anon from reading password columns.
-- ──────────────────────────────────────────────────────────

-- Drop the open read policy and replace it with a deny-all for anon.
-- SECURITY DEFINER functions (worker_login, admin RPCs) bypass RLS
-- and can still read the full table — this only affects direct queries.
DROP POLICY IF EXISTS "Anyone can read employees" ON employees;

CREATE POLICY "deny_direct_select"
  ON employees
  FOR SELECT
  TO anon, authenticated
  USING (false);

-- ── Verification (run after applying the above) ──────────
-- The following query should return 0 rows when executed as anon
-- (i.e., from the client with a public anon key, no auth token).
-- If it returns rows the policy is not applied correctly.
--
--   SELECT id, worker_password_hash, worker_password_salt
--   FROM employees
--   LIMIT 1;
--
-- You can also confirm RLS is enabled on the table:
--
--   SELECT relname, relrowsecurity
--   FROM pg_class
--   WHERE relname = 'employees';
--   -- relrowsecurity should be true.
--
-- Confirm the view still works (should return rows without hash/salt):
--
--   SELECT id, full_name, phone FROM employees_public LIMIT 5;
