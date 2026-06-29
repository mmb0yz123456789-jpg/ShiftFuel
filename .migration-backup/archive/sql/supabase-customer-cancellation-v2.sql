-- ─────────────────────────────────────────────────────────────────────────────
-- Customer cancellation workflow v2.
--
-- Replaces the old free-cancel-only customer_cancel path with a single
-- status-aware cancellation flow that can apply a fee (and, once service has
-- started, a Stripe-fee-covering charge plus any submitted receipt totals)
-- directly at cancellation time, instead of routing through the admin-only
-- customer_request_return / resolve_return_request decision flow.
--
-- New status values used going forward (status is plain text, no enum/check
-- constraint exists on service_requests.status, so no migration is needed to
-- introduce them):
--   cancelled                    -- fully closed, no key/vehicle outstanding
--   cancelled_pending_key_return -- cancelled, but the worker still has the
--                                    key/vehicle and must return it before the
--                                    request can close
--
-- The legacy customer_canceled / canceled status values used by the old flow
-- are left as-is on historical rows; they are not migrated or removed.
-- ─────────────────────────────────────────────────────────────────────────────

alter table service_requests
  add column if not exists cancellation_requested_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_stripe_fee_amount numeric,
  add column if not exists cancellation_receipt_total numeric,
  add column if not exists cancellation_total_charged numeric,
  add column if not exists cancellation_status text,
  add column if not exists cancellation_requires_key_return boolean default false,
  add column if not exists cancellation_key_returned_at timestamptz,
  add column if not exists cancellation_worker_notified_at timestamptz;

-- cancellation_fee_amount, cancellation_reason, canceled_at/canceled_by already
-- exist from supabase-schema.sql / supabase-cancellation-return.sql and are
-- reused as-is (cancellation_fee_amount now holds the flat $15 fee component
-- specifically; cancellation_total_charged holds the full amount captured).
