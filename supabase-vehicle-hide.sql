-- ============================================================
-- supabase-vehicle-hide.sql
-- Fixes the "Delete this car" returning-customer bug.
--
-- 1. Add vehicle_hidden column to service_requests
-- 2. Update public_returning_customer_lookup to exclude hidden vehicles
-- 3. Add public_hide_vehicle RPC (called when customer deletes a car)
-- ============================================================


-- ── 1. Add column ────────────────────────────────────────────────────────────

ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS vehicle_hidden boolean NOT NULL DEFAULT false;


-- ── 2. Update lookup RPC to exclude hidden vehicles ──────────────────────────
-- Adds AND NOT sr.vehicle_hidden to the WHERE clause.
-- Must DROP first because PostgreSQL won't replace a function whose
-- return type definition differs from the stored one.

DROP FUNCTION IF EXISTS public.public_returning_customer_lookup(text, text);

CREATE OR REPLACE FUNCTION public.public_returning_customer_lookup(
  p_phone text,
  p_email text
)
RETURNS TABLE (
  id                uuid,
  customer_name     text,
  customer_phone    text,
  customer_email    text,
  vehicle_year      text,
  vehicle_make      text,
  vehicle_model     text,
  vehicle_color     text,
  license_plate     text,
  hospital          text,
  parking_location  text,
  parking_spot      text,
  parking_map_url   text,
  key_handoff_method  text,
  key_handoff_details text,
  service_type      text,
  service_label     text,
  fuel_type         text,
  wash_package      text,
  wash_package_label text,
  service_date      date,
  created_at        timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT ON (
    lower(coalesce(sr.license_plate, '')),
    sr.vehicle_year,
    lower(coalesce(sr.vehicle_make, '')),
    lower(coalesce(sr.vehicle_model, ''))
  )
    sr.id,
    sr.customer_name,
    sr.customer_phone,
    sr.customer_email,
    sr.vehicle_year,
    sr.vehicle_make,
    sr.vehicle_model,
    sr.vehicle_color,
    sr.license_plate,
    sr.hospital,
    sr.parking_location,
    sr.parking_spot,
    sr.parking_map_url,
    sr.key_handoff_method,
    sr.key_handoff_details,
    sr.service_type,
    sr.service_label,
    sr.fuel_type,
    sr.wash_package,
    sr.wash_package_label,
    sr.service_date,
    sr.created_at
  FROM service_requests sr
  WHERE public.clean_phone(sr.customer_phone) = public.clean_phone(p_phone)
    AND lower(coalesce(sr.customer_email, '')) = lower(coalesce(p_email, ''))
    AND public.clean_phone(p_phone) <> ''
    AND coalesce(p_email, '') <> ''
    AND NOT sr.vehicle_hidden
  ORDER BY
    lower(coalesce(sr.license_plate, '')),
    sr.vehicle_year,
    lower(coalesce(sr.vehicle_make, '')),
    lower(coalesce(sr.vehicle_model, '')),
    sr.created_at DESC
  LIMIT 5;
$$;

GRANT EXECUTE ON FUNCTION public.public_returning_customer_lookup(text, text) TO anon, authenticated;


-- ── 3. public_hide_vehicle RPC ───────────────────────────────────────────────
-- Marks all service_requests for this customer+vehicle combination as hidden.
-- Verifies the supplied phone+email match before making any changes so a
-- customer cannot hide another customer's vehicles.
-- The DISTINCT ON in the lookup could surface an older row if only the
-- representative request were hidden — marking all rows prevents that.

CREATE OR REPLACE FUNCTION public.public_hide_vehicle(
  p_request_id uuid,
  p_phone      text,
  p_email      text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_license_plate text;
  v_vehicle_year  text;
  v_vehicle_make  text;
  v_vehicle_model text;
BEGIN
  -- Verify the request belongs to the supplied customer identity.
  SELECT license_plate, vehicle_year, vehicle_make, vehicle_model
  INTO v_license_plate, v_vehicle_year, v_vehicle_make, v_vehicle_model
  FROM service_requests
  WHERE id = p_request_id
    AND public.clean_phone(customer_phone) = public.clean_phone(p_phone)
    AND lower(coalesce(customer_email, '')) = lower(coalesce(p_email, ''))
    AND public.clean_phone(p_phone) <> ''
    AND coalesce(p_email, '') <> '';

  -- Silently return if phone+email don't match — no data leaked.
  IF NOT FOUND THEN RETURN; END IF;

  -- Mark every request for this vehicle+customer as hidden.
  UPDATE service_requests SET vehicle_hidden = true
  WHERE public.clean_phone(customer_phone) = public.clean_phone(p_phone)
    AND lower(coalesce(customer_email, '')) = lower(coalesce(p_email, ''))
    AND lower(coalesce(license_plate, '')) = lower(coalesce(v_license_plate, ''))
    AND vehicle_year IS NOT DISTINCT FROM v_vehicle_year
    AND lower(coalesce(vehicle_make, '')) = lower(coalesce(v_vehicle_make, ''))
    AND lower(coalesce(vehicle_model, '')) = lower(coalesce(v_vehicle_model, ''));
END;
$$;

GRANT EXECUTE ON FUNCTION public.public_hide_vehicle(uuid, text, text) TO anon, authenticated;
