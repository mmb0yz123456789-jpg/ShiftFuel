-- ============================================================
-- supabase-reset-data.sql
-- Wipes all operational data while keeping:
--   • Mark Urban's employee record
--   • admin_config (shiftfuel-admin credentials)
--
-- Run in Supabase SQL Editor.
-- THIS CANNOT BE UNDONE.
-- ============================================================


-- 1. All service requests (open, in-progress, complete, closed, denied)
DELETE FROM public.service_requests;

-- 2. All reviews / ratings
DELETE FROM public.service_reviews;

-- 3. Photos table (metadata rows — storage files handled separately, see note below)
DELETE FROM public.photos;

-- 4. Payments table
DELETE FROM public.payments;

-- 5. Users table (booking-side user records)
DELETE FROM public.users;

-- 6. Vehicles table
DELETE FROM public.vehicles;

-- 7. Worker sessions (all workers are being removed)
DELETE FROM public.worker_sessions;

-- 8. Admin sessions (forces a fresh login — credentials in admin_config are kept)
DELETE FROM public.admin_sessions;

-- 9. Employee availability and days-off schedules
DELETE FROM public.employee_availability;
DELETE FROM public.employee_days_off;

-- 10. Applicants
DELETE FROM public.applicants;

-- 11. Customer vehicle profiles
DELETE FROM public.customer_vehicle_profiles;

-- 12. Quick inspection results stored on requests (already gone with service_requests)
--     quick_inspections config/templates — keep if it holds PSI guides, otherwise clear
-- DELETE FROM public.quick_inspections;  -- uncomment if you want to wipe inspection templates too

-- 13. All employees EXCEPT Mark Urban
DELETE FROM public.employees
WHERE full_name <> 'Mark Urban';

-- ============================================================
-- admin_config is NOT touched — shiftfuel-admin login is kept.
-- vehicle_psi_guides is NOT touched — that is configuration data.
-- ============================================================


-- ── STORAGE PHOTOS ──────────────────────────────────────────
-- SQL cannot delete Supabase Storage files directly.
-- After running this script, go to:
--   Supabase Dashboard → Storage → (your photos bucket)
--   Select all folders → Delete
-- This removes the actual uploaded photo files.
-- ============================================================
