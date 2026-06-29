-- ============================================================
-- ShiftFuel — Fuel Price Settings
-- Run in Supabase SQL Editor.
-- ============================================================
-- Creates a fuel_price_settings table with a single active row.
-- Prices are read by the booking page and set by the admin.
-- No external API is wired — admin updates prices manually.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1. Table
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fuel_price_settings (
  id               int          PRIMARY KEY DEFAULT 1,
  regular_price    numeric(6,3) NOT NULL DEFAULT 3.799,
  midgrade_price   numeric(6,3) NOT NULL DEFAULT 4.199,
  premium_price    numeric(6,3) NOT NULL DEFAULT 4.499,
  diesel_price     numeric(6,3) NOT NULL DEFAULT 4.199,
  service_area_label text        NOT NULL DEFAULT 'Delaware area',
  last_updated_at  timestamptz  NOT NULL DEFAULT now(),
  updated_by       text
);

ALTER TABLE fuel_price_settings ENABLE ROW LEVEL SECURITY;

-- Allow anon (booking page) to read fuel prices.
CREATE POLICY "anon_read_fuel_prices"
  ON fuel_price_settings
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- No direct INSERT/UPDATE for anon — admin updates via RPC only.

-- Seed the single row.
INSERT INTO fuel_price_settings (id) VALUES (1) ON CONFLICT DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- 2. Public read RPC
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.public_get_fuel_prices()
RETURNS fuel_price_settings
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT * FROM fuel_price_settings WHERE id = 1;
$$;

GRANT EXECUTE ON FUNCTION public.public_get_fuel_prices() TO anon, authenticated;


-- ────────────────────────────────────────────────────────────
-- 3. Admin update RPC
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.admin_update_fuel_prices(
  p_token          uuid,
  p_regular        numeric,
  p_midgrade       numeric,
  p_premium        numeric,
  p_diesel         numeric,
  p_service_area   text DEFAULT NULL
)
RETURNS fuel_price_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_session_valid boolean;
  v_row           fuel_price_settings;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM admin_sessions WHERE id = p_token AND expires_at > now()
  ) INTO v_session_valid;

  IF NOT v_session_valid THEN
    RAISE EXCEPTION 'INVALID_SESSION';
  END IF;

  UPDATE fuel_price_settings SET
    regular_price      = p_regular,
    midgrade_price     = p_midgrade,
    premium_price      = p_premium,
    diesel_price       = p_diesel,
    service_area_label = COALESCE(p_service_area, service_area_label),
    last_updated_at    = now(),
    updated_by         = 'admin'
  WHERE id = 1
  RETURNING * INTO v_row;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_fuel_prices(uuid, numeric, numeric, numeric, numeric, text) TO anon, authenticated;


-- ────────────────────────────────────────────────────────────
-- 4. Verification
-- ────────────────────────────────────────────────────────────
/*
SELECT * FROM fuel_price_settings;
SELECT * FROM public_get_fuel_prices();
*/
