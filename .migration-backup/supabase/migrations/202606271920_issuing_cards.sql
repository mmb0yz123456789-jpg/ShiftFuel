-- ============================================================================
-- Stripe Issuing fuel cards (Phase 3 of payroll payments)
--
-- Each worker gets a virtual card (shown in their worker-app profile) that is
-- restricted to fuel + car-wash merchants with a per-transaction cap, so they
-- never spend their own money on gas and the card can't be misused. The
-- /api/fuel-cards function creates/manages cards via the service role and
-- stores the identifiers here; admin.js reads them through admin_list_employees
-- (which returns the whole employee row) and the worker app reads its own card
-- straight from /api/fuel-cards.
--
-- Sandbox/test: requires Issuing enabled in the Stripe dashboard. The full card
-- number is only retrievable via the API in TEST mode (used for the in-profile
-- display); in live mode you'd reveal it client-side with Issuing Elements.
-- ============================================================================

begin;

alter table public.employees
  add column if not exists stripe_cardholder_id  text,
  add column if not exists stripe_card_id          text,
  add column if not exists stripe_card_last4       text,
  add column if not exists stripe_card_status      text,
  add column if not exists stripe_card_updated_at  timestamptz;

commit;

notify pgrst, 'reload schema';
