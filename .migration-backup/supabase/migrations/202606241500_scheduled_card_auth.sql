-- Deferred card authorization for advance bookings.
--
-- A Stripe manual-capture authorization hold expires on its own after ~7 days,
-- so it can't cover a booking made weeks/months ahead. For those advance
-- bookings we instead SAVE the customer's card now (Stripe SetupIntent, no money
-- moved) and let the daily cron (api/auto-reverse-payments) place the real hold
-- ~2 days before the service date, off-session against the saved card.
--
-- New payment_status string values on service_requests (payment_status is free
-- text — no enum to alter):
--   payment_scheduled — card saved, no hold placed yet
--   authorizing       — transient claim while the cron places the hold
--   needs_reauth      — off-session authorization failed; customer must re-authorize
-- These statuses are safe to expose to the customer (they already see their own
-- payment_status), so they stay on service_requests.
--
-- The Stripe customer + payment-method identifiers are SENSITIVE and must never
-- reach the browser. public_track_request() is SECURITY DEFINER, returns
-- `SELECT sr.*`, and is granted to anon — so anything stored on service_requests
-- is visible to customers. We therefore keep the Stripe IDs in a dedicated
-- side table with RLS enabled and NO policies, so only the service-role key
-- (used by /api and the cron, which bypasses RLS) can ever read or write them.
-- This mirrors the pending_authorizations design.

begin;

CREATE TABLE IF NOT EXISTS public.request_payment_methods (
  request_id               uuid PRIMARY KEY
                             REFERENCES public.service_requests(id) ON DELETE CASCADE,
  stripe_customer_id       text NOT NULL,
  stripe_payment_method_id text NOT NULL,
  auth_attempts            integer NOT NULL DEFAULT 0,
  auth_error               text,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.request_payment_methods ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: anon/authenticated browser clients can never touch
-- this table. Only the service-role key (server-side /api + cron) reaches it.

-- Fast lookup for the cron sweep that authorizes upcoming saved-card bookings.
CREATE INDEX IF NOT EXISTS service_requests_payment_scheduled_idx
  ON public.service_requests (service_date)
  WHERE payment_status = 'payment_scheduled';

commit;
