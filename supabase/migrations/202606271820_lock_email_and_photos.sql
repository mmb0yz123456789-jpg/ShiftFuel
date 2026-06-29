-- ============================================================
-- ShiftFuel — Step 3 (RESTRICTIVE): close worker-email + photos-enumeration reads
--
-- ⚠️ RUN ONLY AFTER:
--    (a) 202606271810_staff_read_rpcs.sql is applied, AND
--    (b) the admin.js that calls admin_list_employees / staff_request_photos is
--        deployed and you've confirmed the Workers tab and ticket photos load.
--    This removes the open read paths those RPCs replace; running it earlier
--    would break the (old) admin dashboard.
--
--   1. Recreate employees_public WITHOUT email (exact live column list minus
--      email). Admin reads email via admin_list_employees now; no other client
--      selects email. Worker `phone` intentionally stays (the worker app reads it).
--   2. Revoke the base-table email column grant (defense in depth).
--   3. Lock the photos table to RPC-only reads (stop anon enumeration). Uploads
--      (INSERT) and the gated read RPCs (public_request_photos /
--      staff_request_photos) keep working.
-- ============================================================

BEGIN;

-- 1. employees_public minus email. DROP+CREATE because a column can't be removed
--    via CREATE OR REPLACE VIEW. Column list = live pg_get_viewdef minus `email`.
DROP VIEW IF EXISTS public.employees_public;
CREATE VIEW public.employees_public WITH (security_barrier = true) AS
  SELECT id,
         employee_code,
         full_name,
         phone,
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
         password_updated_at,
         last_seen_at,
         presence_status,
         background_verified,
         username
  FROM public.employees;
GRANT SELECT ON public.employees_public TO anon, authenticated;

-- 2. No direct base-table email reads either.
REVOKE SELECT (email) ON public.employees FROM anon, authenticated;

-- 3. Lock photos reads to the gated RPCs (drop the open SELECT; keep INSERT so
--    uploads still work). Customer reads go through public_request_photos, admin
--    through staff_request_photos.
DROP POLICY IF EXISTS "Anyone can read photos" ON public.photos;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── Verify ───────────────────────────────────────────────────────────────────
-- email gone from the view (expect 0 rows):
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='employees_public' AND column_name='email';
-- photos has no anon SELECT policy (reads now via RPC):
--   SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='photos';
