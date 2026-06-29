-- ============================================================
-- ShiftFuel — Catch-up migration
-- Run this in the Supabase SQL editor.
-- All statements are safe to re-run (IF NOT EXISTS, IF EXISTS,
-- or idempotent ON CONFLICT logic throughout).
-- ============================================================


-- ──────────────────────────────────────────────────────────
-- 1. service_requests — add all flat customer / vehicle /
--    address columns that replaced the original user_id /
--    vehicle_id foreign-key model.
-- ──────────────────────────────────────────────────────────

-- Customer identity (flat — no auth users table needed)
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS customer_name   text,
  ADD COLUMN IF NOT EXISTS customer_phone  text,
  ADD COLUMN IF NOT EXISTS customer_email  text;

-- Vehicle (flat — no vehicles table needed)
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS vehicle_year    text,
  ADD COLUMN IF NOT EXISTS vehicle_make    text,
  ADD COLUMN IF NOT EXISTS vehicle_model   text,
  ADD COLUMN IF NOT EXISTS vehicle_color   text,
  ADD COLUMN IF NOT EXISTS license_plate   text;

-- Structured service address (replaces the old 'hospital' text field)
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS address_street  text,
  ADD COLUMN IF NOT EXISTS address_apt     text,
  ADD COLUMN IF NOT EXISTS address_city    text,
  ADD COLUMN IF NOT EXISTS address_state   text,
  ADD COLUMN IF NOT EXISTS address_zip     text;

-- Vehicle return location recorded by worker after service
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS return_parking_location text,
  ADD COLUMN IF NOT EXISTS return_parking_spot     text,
  ADD COLUMN IF NOT EXISTS return_parking_map_url  text;

-- Quick inspection toggle (boolean companion to quick_inspection_fee)
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS quick_inspection boolean NOT NULL DEFAULT false;

-- Worker assignment — original (un-cropped) photo URL for lightbox
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS assigned_worker_original_photo_url text;

-- Review timestamp set when customer submits a review
ALTER TABLE service_requests
  ADD COLUMN IF NOT EXISTS review_completed_at timestamptz;

-- Make legacy columns nullable so admin edits and new bookings never block
DO $$
BEGIN
  -- key_handoff_method was dropped from the booking form
  BEGIN
    ALTER TABLE service_requests ALTER COLUMN key_handoff_method DROP NOT NULL;
  EXCEPTION WHEN others THEN NULL;
  END;
  -- desired_return_time may be cleared via admin edit
  BEGIN
    ALTER TABLE service_requests ALTER COLUMN desired_return_time DROP NOT NULL;
  EXCEPTION WHEN others THEN NULL;
  END;
  -- user_id / vehicle_id are no longer required (flat model)
  BEGIN
    ALTER TABLE service_requests ALTER COLUMN user_id DROP NOT NULL;
  EXCEPTION WHEN others THEN NULL;
  END;
  BEGIN
    ALTER TABLE service_requests ALTER COLUMN vehicle_id DROP NOT NULL;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;


-- ──────────────────────────────────────────────────────────
-- 2. employees — add photo cropping columns
-- ──────────────────────────────────────────────────────────

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS original_photo_url text,
  ADD COLUMN IF NOT EXISTS cropped_photo_url  text;


-- ──────────────────────────────────────────────────────────
-- 3. photos — add thumbnail / original URL columns
--    (used for performance: thumbnails in lists, originals
--    in the lightbox / tracking page)
-- ──────────────────────────────────────────────────────────

ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS thumbnail_url text,
  ADD COLUMN IF NOT EXISTS original_url  text;


-- ──────────────────────────────────────────────────────────
-- 4. service-photos storage bucket + policies
-- ──────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('service-photos', 'service-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Upload (workers and admins write photos)
DROP POLICY IF EXISTS "Anyone can upload service photos" ON storage.objects;
CREATE POLICY "Anyone can upload service photos"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'service-photos');

-- Read (tracking page, admin, worker all read)
DROP POLICY IF EXISTS "Anyone can read service photos" ON storage.objects;
CREATE POLICY "Anyone can read service photos"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'service-photos');

-- Delete (admin can remove worker profile photos stored under workers/)
DROP POLICY IF EXISTS "Anyone can delete service photos" ON storage.objects;
CREATE POLICY "Anyone can delete service photos"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'service-photos');

-- Update (required for upsert operations on storage objects)
DROP POLICY IF EXISTS "Anyone can update service photos" ON storage.objects;
CREATE POLICY "Anyone can update service photos"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'service-photos');


-- ──────────────────────────────────────────────────────────
-- 5. service_requests RLS
--    The admin and worker pages talk directly to the table
--    (no Supabase Auth), so policies must be permissive.
--    The tracking-page customer operations go through
--    security-definer RPCs (see supabase-security-hardening.sql).
-- ──────────────────────────────────────────────────────────

ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can create service requests" ON service_requests;
CREATE POLICY "Anyone can create service requests"
ON service_requests FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can read service requests" ON service_requests;
CREATE POLICY "Anyone can read service requests"
ON service_requests FOR SELECT
TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS "Anyone can update service requests" ON service_requests;
CREATE POLICY "Anyone can update service requests"
ON service_requests FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);


-- ──────────────────────────────────────────────────────────
-- 6. photos RLS
-- ──────────────────────────────────────────────────────────

ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can insert photos" ON photos;
CREATE POLICY "Anyone can insert photos"
ON photos FOR INSERT
TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can read photos" ON photos;
CREATE POLICY "Anyone can read photos"
ON photos FOR SELECT
TO anon, authenticated
USING (true);


-- ──────────────────────────────────────────────────────────
-- 7. service_reviews — add UPDATE policy
--    Needed when the direct-table fallback path does an
--    INSERT … ON CONFLICT DO UPDATE (upsert).
-- ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Anyone can update service reviews" ON service_reviews;
CREATE POLICY "Anyone can update service reviews"
ON service_reviews FOR UPDATE
TO anon, authenticated
USING (true)
WITH CHECK (true);


-- ──────────────────────────────────────────────────────────
-- 8. Useful indexes
-- ──────────────────────────────────────────────────────────

-- Fast customer lookup for Find Tickets search
CREATE INDEX IF NOT EXISTS service_requests_customer_name_idx
  ON service_requests (lower(customer_name));

CREATE INDEX IF NOT EXISTS service_requests_customer_phone_idx
  ON service_requests (customer_phone);

CREATE INDEX IF NOT EXISTS service_requests_customer_email_idx
  ON service_requests (lower(customer_email));

-- Fast photo retrieval per request
CREATE INDEX IF NOT EXISTS photos_service_request_id_idx
  ON photos (service_request_id, created_at);

-- Fast review lookup per request
CREATE INDEX IF NOT EXISTS service_reviews_request_id_idx
  ON service_reviews (service_request_id);

-- Fast open-request queue
CREATE INDEX IF NOT EXISTS service_requests_status_created_idx
  ON service_requests (status, created_at DESC);
