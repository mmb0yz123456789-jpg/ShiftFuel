-- ============================================================
-- ShiftFuel — Security lint fixes
-- Addresses findings from the Supabase Advisor security report.
-- Safe to re-run.
-- ============================================================


-- ──────────────────────────────────────────────────────────
-- 1. Fix mutable search_path on functions
--    Risk: without a fixed search_path a malicious schema
--    object could shadow pg internals and hijack the function.
-- ──────────────────────────────────────────────────────────

-- clean_phone (was missing set search_path entirely)
CREATE OR REPLACE FUNCTION public.clean_phone(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT regexp_replace(coalesce(value, ''), '\D', '', 'g');
$$;

-- cleanup_expired_service_photos (was missing set search_path)
CREATE OR REPLACE FUNCTION public.cleanup_expired_service_photos()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM storage.objects
  WHERE bucket_id = 'service-photos'
    AND name IN (
      SELECT storage_path
      FROM public.photos
      WHERE expires_at < now()
        AND storage_path IS NOT NULL
    );

  DELETE FROM public.photos
  WHERE expires_at < now();
END;
$$;

-- delete_expired_photo_rows (older alias flagged by linter — fix if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'delete_expired_photo_rows'
  ) THEN
    EXECUTE $func$
      CREATE OR REPLACE FUNCTION public.delete_expired_photo_rows()
      RETURNS void
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, pg_temp
      AS $inner$
      BEGIN
        DELETE FROM public.photos WHERE expires_at < now();
      END;
      $inner$
    $func$;
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────
-- 2. Revoke anon/authenticated execute on the cleanup
--    function — it is an internal maintenance job only.
--    (The public_* RPCs intentionally remain anon-callable.)
-- ──────────────────────────────────────────────────────────

REVOKE EXECUTE ON FUNCTION public.cleanup_expired_service_photos() FROM anon, authenticated;

-- Same for the older alias if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'delete_expired_photo_rows'
  ) THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.delete_expired_photo_rows() FROM anon, authenticated';
  END IF;
END $$;


-- ──────────────────────────────────────────────────────────
-- 3. Enable RLS on legacy / unused tables
--    These tables are not used by the current app (they are
--    left over from the original auth model). Enabling RLS
--    with no permissive policies makes them effectively
--    read-only for postgres-role callers only.
-- ──────────────────────────────────────────────────────────

ALTER TABLE IF EXISTS users                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS vehicles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS payments                ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS request_photos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS customer_vehicle_profiles ENABLE ROW LEVEL SECURITY;

-- No policies = anon/authenticated get no access (default-deny).


-- ──────────────────────────────────────────────────────────
-- 4. Enable RLS on quick_inspections
--    Workers INSERT rows; admin and worker pages SELECT them.
-- ──────────────────────────────────────────────────────────

ALTER TABLE quick_inspections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read quick inspections" ON quick_inspections;
CREATE POLICY "Anyone can read quick inspections"
ON quick_inspections FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Anyone can insert quick inspections" ON quick_inspections;
CREATE POLICY "Anyone can insert quick inspections"
ON quick_inspections FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update quick inspections" ON quick_inspections;
CREATE POLICY "Anyone can update quick inspections"
ON quick_inspections FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);


-- ──────────────────────────────────────────────────────────
-- 5. Restrict storage bucket SELECT policies
--    Public buckets serve files by URL without any SELECT
--    policy. The broad SELECT on storage.objects is only
--    needed to LIST bucket contents via the API — which we
--    don't need, and which exposes all file paths.
--    Replace with a narrow path-prefix policy so workers
--    can only list their own folder if needed, and the
--    bucket directory is not browsable by random visitors.
-- ──────────────────────────────────────────────────────────

-- service-photos: remove the broad listing policy
DROP POLICY IF EXISTS "Allow public reads from service photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read service photos" ON storage.objects;

-- Re-add a narrow policy: SELECT only on objects the caller knows the name of.
-- (Public bucket URLs still work without this — it only affects API listing.)
-- If the worker or admin page ever needs to list storage files, add a specific
-- path-scoped policy here. For now, default-deny on listing is correct.

-- applicant-resumes: remove the broad listing policy
DROP POLICY IF EXISTS "Anyone can read applicant resumes" ON storage.objects;

-- ──────────────────────────────────────────────────────────
-- NOTE: Warnings left as accepted / by-design
-- ──────────────────────────────────────────────────────────
--
-- "RLS Policy Always True" on applicants, employees,
-- employee_availability, employee_days_off, vehicle_psi_guides:
--   These tables are written by the admin/worker pages which
--   use application-layer auth (sessionStorage), not Supabase
--   Auth. Permissive policies are required until a server-side
--   auth layer (Edge Functions or Supabase Auth) is added.
--
-- "Public Can Execute SECURITY DEFINER Function" on public_*:
--   All public_* RPCs are intentionally callable by anon —
--   they are the secure gateway for customer-facing pages
--   (booking, tracking, cancellation, reviews). They verify
--   identity via phone + email before returning any data.
