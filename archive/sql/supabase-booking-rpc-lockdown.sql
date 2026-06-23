-- ============================================================
-- supabase-booking-rpc-lockdown.sql
-- ShiftFuel — close the direct-insert path on service_requests
--
-- Run in the Supabase SQL Editor AFTER supabase-production-rls-lockdown.sql.
-- Safe to re-run (idempotent).
--
-- Context: booking creation now happens through the server-side
-- /api/payments (action: create_authorized_booking) endpoint, which verifies
-- the Stripe PaymentIntent before inserting with the service-role key
-- (bypasses RLS). The previous "public_insert_service_request" policy
-- (added by supabase-advisor-security-cleanup.sql) allowed anon to insert a
-- row directly with a self-reported payment_intent_id/payment_status —
-- RLS has no way to verify that PaymentIntent against Stripe, so leaving
-- that policy in place would let anyone fabricate an "authorized" booking
-- without ever paying. The frontend no longer uses this path, so it is
-- safe to remove.
-- ============================================================

DROP POLICY IF EXISTS "public_insert_service_request" ON public.service_requests;
DROP POLICY IF EXISTS "Anyone can create service requests" ON public.service_requests;

-- No INSERT policy remains for anon/authenticated on service_requests.
-- Booking creation is now SECURITY DEFINER-equivalent: the service-role key
-- used by /api/payments bypasses RLS after the server has independently
-- verified the PaymentIntent with Stripe.
