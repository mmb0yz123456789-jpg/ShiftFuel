-- ============================================================
-- ShiftFuel — SANDBOX RESET (clean slate)
--
-- ⚠️⚠️  DESTRUCTIVE & IRREVERSIBLE. Run ONLY against the SANDBOX project.
--        Double-check the Supabase SQL editor is connected to the sandbox,
--        NOT production, before running. There is no undo.
--
-- This is a utility script, NOT a migration — it lives in supabase/ (not
-- supabase/migrations/) so it never runs automatically on deploy.
--
-- KEEPS:  admin login (admin_config), all workers (employees) + their schedules
--         + worker profile photos, and your settings (pricing / fuel prices /
--         service area / promo codes / PSI guides).
-- WIPES:  every ticket and everything attached to it (photos, GPS, inspections,
--         payments, saved cards), customers (saved addresses/vehicles/profiles),
--         reviews, applicants, worker change-requests, and the legacy
--         users/vehicles tables.
--
-- NOTE ON FILES: Supabase blocks deleting storage objects via SQL
-- (storage.protect_delete()). So this script clears the DB photo *records* only;
-- the image *files* become harmless orphans. To remove them, use the Dashboard:
-- Storage → service-photos → delete the <request-id> folders (KEEP the
-- `workers/` folder), and empty the applicant-resumes bucket. In a sandbox you
-- can also just leave the orphaned files — nothing references them.
-- ============================================================

-- ── Optional: preview row counts before wiping ──────────────────────────────
-- SELECT 'service_requests' t, count(*) FROM service_requests
-- UNION ALL SELECT 'photos',     count(*) FROM photos
-- UNION ALL SELECT 'payments',   count(*) FROM payments
-- UNION ALL SELECT 'applicants', count(*) FROM applicants;

-- ── 1) Wipe all operational / customer / transaction data ───────────────────
DO $$
DECLARE
  t text;
  wipe text[] := ARRAY[
    'service_requests',          -- the tickets
    'photos', 'request_photos', 'quick_inspections',
    'request_locations', 'request_payment_methods', 'pending_authorizations',
    'payments', 'service_reviews', 'promo_redemptions',
    'saved_customer_vehicles', 'saved_service_addresses', 'customer_vehicle_profiles',
    'applicants', 'worker_change_requests',
    'users', 'vehicles'          -- legacy customer tables
  ];
BEGIN
  FOREACH t IN ARRAY wipe LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('TRUNCATE TABLE public.%I RESTART IDENTITY CASCADE', t);
    END IF;
  END LOOP;
END $$;

-- ── 2) Clear leftover lockouts so admin + workers can log in cleanly ────────
UPDATE employees     SET failed_login_attempts = 0, locked_until = NULL;
UPDATE admin_lockout SET failed_attempts = 0, locked_until = NULL;

-- ── Verify (all should be 0) ────────────────────────────────────────────────
-- SELECT count(*) FROM service_requests;  -- expect 0
-- SELECT count(*) FROM photos;            -- expect 0

-- ============================================================
-- OPTIONAL — also wipe your SETTINGS for a totally bare slate.
-- ⚠️ Leave these commented to KEEP your pricing/coverage config. Uncomment only
--    if you want to reconfigure from scratch (bookings can't price/area-check
--    until these are set again).
-- ============================================================
-- TRUNCATE TABLE promo_codes RESTART IDENTITY CASCADE;
-- TRUNCATE TABLE service_pricing_settings, fuel_price_settings,
--                service_area_settings, vehicle_psi_guides RESTART IDENTITY CASCADE;
