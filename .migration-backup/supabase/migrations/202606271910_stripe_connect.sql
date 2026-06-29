-- ============================================================================
-- Stripe Connect (Phase 2 of payroll payments) — 1099 contractor payouts
--
-- Adds the columns the /api/payouts function uses to remember each worker's
-- Stripe Express connected account and whether onboarding is complete. The
-- /api/payouts function writes these via the service role; admin.js reads them
-- for free because admin_list_employees returns the whole employee row, and the
-- worker app reads its own status straight from /api/payouts (connect_status).
--
-- No RPCs here: all Stripe-touching writes happen server-side in /api/payouts.
-- ============================================================================

begin;

alter table public.employees
  add column if not exists stripe_connect_account_id  text,
  add column if not exists stripe_connect_ready        boolean not null default false,
  add column if not exists stripe_connect_updated_at   timestamptz;

commit;

notify pgrst, 'reload schema';
