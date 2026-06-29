-- ============================================================
-- ShiftFuel — Car-photo retention (liability protection)
--
-- Requirement: service / inspection car photos must survive AT LEAST 5 YEARS so
-- the company always has before/after evidence for any damage dispute.
--
-- What was wrong before:
--   * photos.expires_at defaulted to now() + 30 DAYS, and
--     cleanup_expired_service_photos() permanently deletes the storage file AND
--     the row once expires_at passes  →  evidence could vanish after a month.
--   * the service-photos storage bucket let ANY anon-key holder DELETE photo
--     files  →  evidence could be wiped by anyone with the public key.
--
-- What this migration does:
--   1. New photos retain for 7 years (margin above the 5-year floor).
--   2. Every EXISTING photo is pushed to created_at + 7 years.
--   3. The cleanup is hard-floored so it can NEVER delete a photo younger than
--      5 years, no matter what expires_at says (belt-and-suspenders guarantee).
--   4. Storage DELETE is locked down so the public anon key can only delete a
--      just-uploaded photo (retake within 24h), never aged evidence.
-- ============================================================

BEGIN;

-- Make sure the column exists, then set the new retention default.
ALTER TABLE public.photos ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.photos ALTER COLUMN expires_at SET DEFAULT (now() + interval '7 years');

-- Extend every existing photo to 7 years from when it was captured.
UPDATE public.photos
   SET expires_at = created_at + interval '7 years'
 WHERE expires_at IS NULL
    OR expires_at < created_at + interval '7 years';

-- Hard 5-year floor: cleanup can never remove anything younger than 5 years,
-- regardless of expires_at. This is the real guarantee behind the requirement.
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
      SELECT storage_path FROM public.photos
      WHERE storage_path IS NOT NULL
        AND expires_at < now()
        AND created_at < now() - interval '5 years'   -- hard floor
    );

  DELETE FROM public.photos
  WHERE expires_at < now()
    AND created_at < now() - interval '5 years';        -- hard floor
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_expired_service_photos() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cleanup_expired_service_photos() TO service_role;

COMMIT;

-- Storage: only a just-uploaded photo (retake within 24h) may be deleted by the
-- public anon key. Aged evidence can only be removed with the service-role key
-- (i.e. deliberately, from the dashboard) — not by anyone holding the anon key.
DROP POLICY IF EXISTS "Anyone can delete service photos" ON storage.objects;
CREATE POLICY "Delete only recent service photos"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (
  bucket_id = 'service-photos'
  AND created_at > now() - interval '24 hours'
);

-- Same protection against OVERWRITE (UPDATE replaces a file's bytes = tampering
-- with evidence). Uploads use upsert:false (a new object each time), so the anon
-- key never needs to overwrite an aged photo — only same-session corrections.
DROP POLICY IF EXISTS "Anyone can update service photos" ON storage.objects;
CREATE POLICY "Update only recent service photos"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (
  bucket_id = 'service-photos'
  AND created_at > now() - interval '24 hours'
);

NOTIFY pgrst, 'reload schema';

-- ── Verification ─────────────────────────────────────────────────────────────
-- New default is 7 years:
--   SELECT column_default FROM information_schema.columns
--   WHERE table_name='photos' AND column_name='expires_at';
-- No existing photo expires within 5 years:
--   SELECT count(*) FROM public.photos WHERE expires_at < now() + interval '5 years';  -- expect 0
