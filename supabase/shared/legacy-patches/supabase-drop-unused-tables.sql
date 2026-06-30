-- ============================================================
-- supabase-drop-unused-tables.sql
-- Drops legacy tables that were never used by the application.
-- RLS was enabled on all of them with no policies (default deny),
-- so they contain no accessible data.
--
-- Safe to run at any time — no application code references these.
-- ============================================================

DROP TABLE IF EXISTS public.customer_vehicle_profiles;
DROP TABLE IF EXISTS public.payments;
DROP TABLE IF EXISTS public.request_photos;
DROP TABLE IF EXISTS public.users;
DROP TABLE IF EXISTS public.vehicles;
