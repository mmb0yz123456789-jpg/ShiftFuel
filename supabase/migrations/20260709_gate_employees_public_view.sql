-- ============================================================
-- ShiftFuel — Close the anon read path on public.employees_public (Option C)
--
-- WHY: `employees_public` is a curated view over the (RLS-locked) `employees`
-- table, granted SELECT to anon so the customer Track page could show the
-- assigned worker's Verified badge + photo. In PROD the view had lost its
-- `security_invoker` setting (a DROP+CREATE in 202606271830 reverted it), so the
-- Supabase linter flags it ERROR 0010 (security_definer_view). More importantly,
-- the anon grant let ANYONE with the public anon key enumerate the whole staff
-- roster + login usernames via /rest/v1/employees_public.
--
-- FIX (no functional loss):
--   1. Move the ONE piece of data the Track page couldn't get elsewhere
--      (employees.background_verified) plus the *live* worker photo into the
--      existing token/identity-gated public_track_request RPC, embedded per row.
--   2. REVOKE the anon/authenticated grant on the view — the roster is no longer
--      anonymously enumerable.
--   3. Set security_invoker = on to clear lint 0010. The only remaining readers
--      are SECURITY DEFINER functions (worker_upsert_request_location /
--      worker_stop_request_location), which read the view as the function owner
--      and so are unaffected by both the revoke and the invoker flip.
--
-- ⚠️ DEPLOY ORDER: ship the updated track.js + worker.js BEFORE (or with) this
--    migration. Old track.js's loadVerifiedWorkers() fails safe on revoke (badge
--    off, wrapped in try/catch). Old worker.js's dead dup-phone check would THROW
--    on revoke and block profile saves — so its removal must be deployed first.
--
-- Idempotent + safe to run on DEV and PROD (DEV already has invoker=on; the
-- ALTER is a no-op there). Closes the DEV/PROD drift on this view.
-- ============================================================

BEGIN;

-- 1. public_track_request: same signature + SETOF jsonb return, now LEFT JOINing
--    the assigned worker so each returned request carries the worker's *current*
--    verified flag and photo (mirrors the old client-side employees_public join;
--    coalesces to the request's denormalized photo so it never regresses to null).
CREATE OR REPLACE FUNCTION public.public_track_request(
  p_request_id text DEFAULT NULL,
  p_phone      text DEFAULT NULL,
  p_email      text DEFAULT NULL
)
RETURNS SETOF jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH resolved AS (
    SELECT
      upper(trim(coalesce(p_request_id, '')))                          AS req,
      regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')             AS phone,
      lower(trim(coalesce(p_email, '')))                               AS email
  ),
  resolved2 AS (
    SELECT
      req, phone, email,
      ((phone <> '')::int + (email <> '')::int + (req <> '')::int)     AS id_count,
      CASE
        WHEN req LIKE 'SF-%'         THEN lower(substring(req FROM 4 FOR 8))
        WHEN req ~ '^[A-F0-9]{8}$'   THEN lower(req)
        ELSE NULL
      END                                                              AS ticket_prefix
    FROM resolved
  )
  SELECT (to_jsonb(sr) - ARRAY[
      'base_fuel_service_fee', 'base_car_wash_service_fee', 'base_inspection_fee',
      'displayed_fuel_service_fee', 'displayed_car_wash_service_fee', 'displayed_inspection_fee',
      'payment_operating_recovery_amount', 'net_target_amount', 'gross_total_before_rounding',
      'rounded_customer_total', 'authorized_amount',
      'actual_fuel_receipt_amount', 'actual_car_wash_receipt_amount',
      'driven_miles'
    ])
    || jsonb_build_object(
      'assigned_worker_verified',
        coalesce(e.background_verified, false),
      'assigned_worker_photo_url',
        coalesce(nullif(e.cropped_photo_url, ''), nullif(e.photo_url, ''), sr.assigned_worker_photo_url),
      'assigned_worker_original_photo_url',
        coalesce(nullif(e.original_photo_url, ''), sr.assigned_worker_original_photo_url)
    )
  FROM service_requests sr
  LEFT JOIN employees e ON e.id = sr.assigned_employee_id
  CROSS JOIN resolved2 r
  WHERE r.id_count >= 2
    AND (
      (r.req <> '' AND r.ticket_prefix IS NULL AND sr.id::text = lower(r.req))
      OR (r.ticket_prefix IS NOT NULL AND sr.id::text LIKE r.ticket_prefix || '%')
      OR (r.req = '')
    )
    AND (r.phone = '' OR regexp_replace(coalesce(sr.customer_phone, ''), '\D', '', 'g') = r.phone)
    AND (r.email = '' OR lower(coalesce(sr.customer_email, '')) = r.email)
  ORDER BY sr.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.public_track_request(text, text, text) TO anon, authenticated;

-- 2. Remove the anon read path (the actual security win — no more roster/username
--    enumeration via /rest/v1/employees_public).
REVOKE SELECT ON public.employees_public FROM anon, authenticated;

-- 3. Clear lint 0010. Internal SECURITY DEFINER readers run as owner, so this is
--    transparent to them; nothing else can read the view now.
ALTER VIEW public.employees_public SET (security_invoker = on);

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Verification ─────────────────────────────────────────────────────────────
-- 1) Track RPC now embeds the worker fields (phone+email of a real booking):
--      SELECT public.public_track_request(NULL, '<phone>', '<email>')
--             -> '{assigned_worker_verified,assigned_worker_photo_url}';
-- 2) Anon can no longer read the view (run as anon / from the client):
--      SELECT * FROM public.employees_public;   -- expect: permission denied
-- 3) Live GPS still works: accept a job, Start service, confirm the map tracks
--    (exercises worker_upsert_request_location / worker_stop_request_location,
--    which read the view internally).
-- 4) Lint 0010 (security_definer_view) on employees_public is gone.
