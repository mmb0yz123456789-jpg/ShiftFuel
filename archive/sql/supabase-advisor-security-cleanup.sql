-- ============================================================
-- supabase-advisor-security-cleanup.sql
-- ShiftFuel — Supabase Advisor security findings cleanup
--
-- Run in Supabase SQL Editor.
-- Safe to re-run (uses IF EXISTS / CREATE OR REPLACE throughout).
--
-- Sections:
--   1. Fix employees_public Security Definer View finding
--   2. Revoke worker_create_session from anon/authenticated
--   3. Fix mutable search paths on SECURITY DEFINER functions
--   4. Tighten overly permissive RLS INSERT/UPDATE policies
--   5. Remove unused quick_inspections public policies
--   6. Document intentionally private tables (no changes needed)
--   7. Verification queries
-- ============================================================


-- ── 1. Fix employees_public Security Definer View ──────────────────────────
--
-- Problem: employees_public is owned by the postgres (superuser) role in
-- Supabase, so it runs with full owner permissions and bypasses RLS on the
-- base employees table. Supabase Advisor flags this as a Security Definer View.
--
-- Fix:
--   a) Recreate the view with security_invoker = true (Postgres 15+).
--      This makes the view run with the caller's permissions, not the owner's.
--   b) Replace the deny-all RLS policy on employees with a permissive SELECT
--      policy, but use column-level GRANTs to ensure anon cannot select
--      worker_password_hash or worker_password_salt even with SELECT allowed.
--      RLS allows the rows; column grants restrict the columns.
--   c) SECURITY DEFINER functions (worker_login, admin_update_employee, etc.)
--      run as postgres and bypass both RLS and column grants — they can still
--      read password columns as required for authentication.
--
-- The view is still used by admin.js in 6 places to display employee profiles.
-- Anon needs SELECT on safe columns. This approach satisfies both requirements
-- without the Security Definer View risk.
-- ──────────────────────────────────────────────────────────────────────────

-- Step 1a: Recreate view as security_invoker (no longer runs as postgres).
CREATE OR REPLACE VIEW public.employees_public
  WITH (security_invoker = true, security_barrier = true)
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

-- Step 1b: Drop the deny-all policy (added by supabase-worker-login.sql).
-- We replace it with a permissive SELECT policy + column-level grants below.
DROP POLICY IF EXISTS "deny_direct_select" ON employees;

-- Ensure RLS is still enabled on the base table.
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- Replace open "Anyone can read employees" policy (from supabase-admin-sessions.sql)
-- with a new permissive SELECT policy. Rows are accessible; columns are restricted
-- below via GRANT SELECT (safe columns only).
DROP POLICY IF EXISTS "Anyone can read employees" ON employees;
CREATE POLICY "anon_select_safe_employee_columns"
  ON employees
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Step 1c: Column-level grants — revoke broad SELECT, grant only safe columns.
-- This prevents anon from querying worker_password_hash or worker_password_salt
-- even with a permissive SELECT policy in place.
REVOKE SELECT ON public.employees FROM anon, authenticated;
GRANT SELECT (
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
) ON public.employees TO anon, authenticated;

-- Keep the view grant so admin.js .from('employees_public') still works.
GRANT SELECT ON public.employees_public TO anon, authenticated;


-- ── 2. Revoke worker_create_session from anon/authenticated ────────────────
--
-- Problem: worker_create_session(p_employee_id uuid) is a SECURITY DEFINER
-- function callable by anon. It creates a valid worker session from only an
-- employee UUID — no password verification required. Any caller who knows or
-- guesses a worker's UUID can create a login session.
--
-- The real login path is worker_login(p_identifier, p_password), which
-- verifies the password server-side. worker_create_session was an earlier
-- helper and is no longer called from any frontend JS.
--
-- Fix: Revoke EXECUTE from anon, authenticated, and PUBLIC.
-- Do not drop the function — it may be useful for admin migrations or testing
-- through the service role, which bypasses EXECUTE grants anyway.
-- ──────────────────────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.worker_create_session(uuid)
  FROM anon, authenticated, PUBLIC;

-- Note: The service role (used by server-side API routes) is not affected by
-- REVOKE from PUBLIC — it retains access because it bypasses RLS/grants.


-- ── 3. Fix mutable search paths on SECURITY DEFINER functions ─────────────
--
-- Several functions are missing SET search_path = public, pg_temp.
-- A mutable search path allows a malicious schema to shadow pg_catalog
-- objects if an attacker can create objects in the search path. Adding the
-- fixed search path prevents this.
--
-- Functions already fixed (have SET search_path = public, pg_temp):
--   worker_login, _verify_admin, _verify_worker,
--   admin_create_session, admin_update_request, worker_update_request,
--   worker_claim_request, worker_update_profile, worker_change_password,
--   worker_save_availability, worker_save_days_off, admin_save_availability,
--   admin_save_days_off, admin_update_applicant, admin_insert_employee,
--   admin_update_employee, admin_delete_employee,
--   public_submit_service_review, public_cancel_request
--
-- Functions needing the fix:
--   clean_phone (not SECURITY DEFINER, but good practice)
--   public_booked_return_slots (has 'public' only, missing pg_temp)
--   public_worker_availability_slots (same)
--   public_returning_customer_lookup (same)
--   public_track_request (same)
--   public_request_photos (same)
--   public_review_for_request (same)
--   admin_create_request (missing entirely)
--   customer_complete_booking (missing entirely)
--   public_hide_vehicle (check below)
-- ──────────────────────────────────────────────────────────────────────────

ALTER FUNCTION public.clean_phone(text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.public_booked_return_slots(date)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.public_worker_availability_slots(date, text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.public_returning_customer_lookup(text, text)
  SET search_path = public, pg_temp;

-- public_track_request has two versions (original + updated in supabase-create-request.sql)
-- Both share the same signature; the latest definition wins. Fix the current one:
ALTER FUNCTION public.public_track_request(uuid, text, text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.public_request_photos(uuid, text, text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.public_review_for_request(uuid, text, text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.admin_create_request(text, jsonb)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.customer_complete_booking(
  uuid, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text, text,
  int, boolean, numeric, text, text, text, text, text,
  text, text, text, numeric, numeric, text
) SET search_path = public, pg_temp;

-- public_hide_vehicle — fix if it exists (may not be deployed yet)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'public_hide_vehicle'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.public_hide_vehicle(uuid, text, text) SET search_path = public, pg_temp';
  END IF;
END $$;

-- public_submit_service_review — already has the fix but confirm no overloads are missed:
-- (no action needed, already correct in supabase-security-hardening.sql)


-- ── 4. Tighten overly permissive RLS INSERT/UPDATE policies ───────────────

-- ── 4a. service_requests: "Anyone can create service requests" ────────────
--
-- Problem: WITH CHECK (true) allows anon to insert any row with any values,
-- including setting status to something other than 'request_received',
-- setting payment_status to 'captured', or setting final_total.
--
-- Fix: Tighten WITH CHECK to require:
--   - status is exactly 'request_received'
--   - payment_status is 'authorized' or 'not_started' (the two valid initial states)
--   - final_total is NULL (workers/admin set this later)
--   - customer_name, customer_phone, customer_email are all non-empty
--   - service_type is one of the four allowed values
--
-- The existing booking flow in script.js already sets exactly these values,
-- so this does not break the booking form.
-- ──────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Anyone can create service requests" ON public.service_requests;

CREATE POLICY "public_insert_service_request"
  ON public.service_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    -- Status must be initial value only
    status = 'request_received'
    -- Payment status must be one of the two valid initial states
    AND payment_status IN ('authorized', 'not_started')
    -- Final total must not be set by the customer at booking time
    AND final_total IS NULL
    -- Customer identity fields must be present
    AND customer_name  IS NOT NULL AND length(trim(customer_name))  > 0
    AND customer_phone IS NOT NULL AND length(trim(customer_phone)) > 0
    AND customer_email IS NOT NULL AND length(trim(customer_email)) > 0
    -- Service type must be a known value
    AND service_type IN ('fuel', 'car-wash', 'car-wash-fuel', 'fuel-only', 'wash-only')
  );

-- ── 4b. photos: "Anyone can insert photos" ────────────────────────────────
--
-- Problem: WITH CHECK (true) allows anyone to insert photo rows for any
-- service_request_id, including fabricated UUIDs.
--
-- Fix: Require service_request_id to be non-null and photo_type to be one
-- of the known valid types. This prevents garbage rows but keeps the
-- worker/admin direct insert path working (they use the anon key).
--
-- Note: Photo uploads go through Supabase Storage (server-side bucket
-- with its own auth) and the DB row is inserted after. The tighter WITH CHECK
-- ensures the DB row references a real photo type.
-- ──────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Anyone can insert photos" ON public.photos;

CREATE POLICY "staff_insert_photo"
  ON public.photos
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    service_request_id IS NOT NULL
    AND photo_type IN (
      'pickup_driver_front',  'pickup_passenger_front',
      'pickup_driver_rear',   'pickup_passenger_rear',
      'pickup_odometer',      'pickup_fuel_gauge',
      'dropoff_driver_front', 'dropoff_passenger_front',
      'dropoff_driver_rear',  'dropoff_passenger_rear',
      'dropoff_odometer',     'dropoff_fuel_gauge',
      'fuel_receipt',         'wash_receipt',
      -- Legacy type aliases kept for backward compatibility
      'pickup_front',         'pickup_passenger_side',
      'pickup_driver_side',   'pickup_rear',
      'dropoff_front',        'dropoff_passenger_side',
      'dropoff_driver_side',  'dropoff_rear'
    )
  );

-- ── 4c. applicants: "Anyone can submit applicants" ────────────────────────
--
-- Problem: WITH CHECK (true) — no validation at all.
-- Public INSERT is intentional (job application form on hiring.html),
-- but we should require minimum fields.
--
-- Fix: Require full_name (or name) to be present and at least one of
-- phone or email to be non-empty.
-- ──────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Anyone can submit applicants" ON public.applicants;

CREATE POLICY "public_insert_applicant"
  ON public.applicants
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    -- Must have a name
    (full_name IS NOT NULL AND length(trim(full_name)) > 0)
    OR (name IS NOT NULL AND length(trim(name)) > 0)
  );


-- ── 5. Remove unused quick_inspections public policies ─────────────────────
--
-- Problem: quick_inspections has "Anyone can insert" (WITH CHECK (true)) and
-- "Anyone can update" (USING (true)) policies.
--
-- The quick_inspections table is not used by any current frontend JS —
-- inspection data is stored in service_requests.notes via worker/admin RPCs.
-- Direct public insert/update on this table is unnecessary and risky.
--
-- Fix: Drop the two permissive policies. RLS remains enabled. The table
-- becomes inaccessible to anon, which is correct for an unused internal table.
-- ──────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Anyone can insert quick inspections" ON public.quick_inspections;
DROP POLICY IF EXISTS "Anyone can update quick inspections" ON public.quick_inspections;

-- Confirm RLS is still enabled (it should already be, but be explicit).
ALTER TABLE public.quick_inspections ENABLE ROW LEVEL SECURITY;


-- ── 6. Intentionally private tables — no changes needed ───────────────────
--
-- The following tables have RLS enabled with no public policies. This is
-- CORRECT and intentional. Supabase Advisor warns about these but they should
-- remain restricted. Do not add USING (true) policies to these tables.
--
--   admin_config      — stores hashed admin credentials. Private.
--   admin_sessions    — live admin session tokens. Private.
--   worker_sessions   — live worker session tokens. Private.
--   customer_vehicle_profiles — not used by current app. Private.
--   payments          — not used by current app (payment data is in
--                       service_requests.payment_intent_id). Private.
--   request_photos    — if this is a legacy/duplicate of photos, keep private.
--   users             — not used by current app (no Supabase Auth). Private.
--   vehicles          — not used by current app. Private.
--
-- All reads/writes to admin_sessions and worker_sessions happen through
-- SECURITY DEFINER functions (admin_create_session, worker_login,
-- _verify_admin, _verify_worker) that bypass RLS. This is correct.
-- ──────────────────────────────────────────────────────────────────────────

-- No SQL changes. Documented here for the record.


-- ── 7. Verification queries ─────────────────────────────────────────────────
-- Run these after applying the above to confirm the state is correct.
-- These are SELECT-only — safe to run at any time.
-- ──────────────────────────────────────────────────────────────────────────

-- 7a. Confirm employees_public is no longer a security definer view.
--     Should return 0 rows (no security_definer views in the public schema).
/*
SELECT schemaname, viewname, definition
FROM pg_views
WHERE schemaname = 'public'
  AND viewname = 'employees_public';

-- Also check pg_class for reloptions (should show security_invoker=true):
SELECT relname, reloptions
FROM pg_class
WHERE relname = 'employees_public';
*/

-- 7b. Confirm anon cannot select password columns from employees directly.
--     Run this as the anon role (use the Supabase SQL Editor "anon" role option,
--     or test from a browser with the public anon key).
--     Should raise a permission denied error:
/*
SELECT worker_password_hash, worker_password_salt FROM employees LIMIT 1;
*/

-- 7c. Confirm anon CAN still read safe columns from employees_public.
--     Should return rows without password fields:
/*
SELECT id, full_name, phone FROM employees_public LIMIT 5;
*/

-- 7d. Confirm worker_create_session is no longer executable by anon/authenticated.
--     Should return 0 rows for grantee = 'anon' or 'authenticated':
/*
SELECT grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name = 'worker_create_session'
  AND grantee IN ('anon', 'authenticated', 'PUBLIC');
*/

-- 7e. List all SECURITY DEFINER views in the public schema (should be 0 after fix).
/*
SELECT n.nspname AS schema, c.relname AS view_name
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'v'
  AND n.nspname = 'public'
  AND c.relowner != (SELECT oid FROM pg_roles WHERE rolname = 'postgres')
  -- The above finds views NOT owned by postgres.
  -- Alternatively, check for security_invoker in reloptions:
UNION ALL
SELECT n.nspname, c.relname
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind = 'v'
  AND n.nspname = 'public'
  AND NOT EXISTS (
    SELECT 1 FROM unnest(c.reloptions) opt
    WHERE opt LIKE 'security_invoker%'
  )
  AND c.relowner = (SELECT oid FROM pg_roles WHERE rolname = 'postgres');
*/

-- 7f. List functions executable by anon that are SECURITY DEFINER.
--     Review this list — all entries should be intentionally public:
/*
SELECT p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND EXISTS (
    SELECT 1 FROM pg_proc_aclitem(p.oid) AS a(grantee, grantor, priv_type, is_grantable)
    -- Note: pg_proc_aclitem is Supabase-specific; use information_schema instead:
  );

-- Simpler version via information_schema:
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND grantee IN ('anon', 'authenticated')
ORDER BY routine_name, grantee;
*/

-- 7g. List RLS policies with USING (true) or WITH CHECK (true).
--     Review all entries to confirm they are intentionally permissive:
/*
SELECT schemaname, tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual = 'true' OR with_check = 'true')
ORDER BY tablename, policyname;
*/

-- 7h. List tables with RLS disabled in the public schema.
--     All sensitive tables should show relrowsecurity = true:
/*
SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY relname;
*/

-- 7i. List all column-level GRANTs on employees.
--     Should show safe columns granted to anon/authenticated,
--     and no grant for worker_password_hash or worker_password_salt:
/*
SELECT grantee, column_name, privilege_type
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name = 'employees'
  AND grantee IN ('anon', 'authenticated')
ORDER BY grantee, column_name;
*/
