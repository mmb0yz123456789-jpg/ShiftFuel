-- ============================================================================
-- Physical Issuing fuel cards (extends Phase 3)
--
-- A physical card is what a worker taps/inserts at the pump — no app or wallet
-- provisioning needed. It's a separate Stripe card from the virtual one, so a
-- worker can have both (virtual for online, physical for the pump). These
-- columns hold the physical card alongside the existing virtual-card columns;
-- /api/fuel-cards manages both. Same fuel/car-wash + $150 per-transaction
-- controls apply.
--
-- Physical cards are created `inactive` and must be activated once received
-- (admin or the worker, via /api/fuel-cards activate_physical_card).
-- ============================================================================

begin;

alter table public.employees
  add column if not exists stripe_phys_card_id          text,
  add column if not exists stripe_phys_card_last4        text,
  add column if not exists stripe_phys_card_status       text,
  add column if not exists stripe_phys_card_updated_at   timestamptz;

commit;

notify pgrst, 'reload schema';
