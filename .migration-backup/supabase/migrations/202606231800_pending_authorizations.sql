-- Tracks Stripe authorization holds that have been placed but not yet turned
-- into a booking, so the admin can see and close out abandoned holds early
-- instead of waiting ~7 days for Stripe's authorization to expire on its own.
--
-- Lifecycle (all writes are server-side via the service-role key in /api):
--   1. create_intent          → insert a row with status 'pending'
--   2. booking succeeds        → status 'booked'   (resolved)
--   3. cancel/abandon (beacon) → status 'voided', reason 'abandoned'
--   4. admin "Void hold"       → status 'voided', reason 'admin_voided'
--   5. daily cron (>24h old)   → status 'voided', reason 'auto_expired'
--   6. booking insert failed   → stays 'pending', reason 'booking_failed'
--
-- RLS is enabled with NO policies on purpose: anon/authenticated browser
-- clients can never read or write this table. Only the service-role key
-- (used by the API functions) touches it, and service_role bypasses RLS.

begin;

CREATE TABLE IF NOT EXISTS public.pending_authorizations (
  payment_intent_id text PRIMARY KEY,
  client_secret     text,
  amount_cents      integer NOT NULL DEFAULT 0,
  customer_name     text,
  customer_email    text,
  service_label     text,
  status            text NOT NULL DEFAULT 'pending', -- pending | booked | voided
  reason            text,                            -- abandoned | booking_failed | admin_voided | auto_expired
  created_at        timestamptz NOT NULL DEFAULT now(),
  resolved_at       timestamptz
);

-- Fast lookup of the holds the admin card cares about (oldest first).
CREATE INDEX IF NOT EXISTS pending_authorizations_pending_idx
  ON public.pending_authorizations (created_at)
  WHERE status = 'pending';

ALTER TABLE public.pending_authorizations ENABLE ROW LEVEL SECURITY;

commit;
