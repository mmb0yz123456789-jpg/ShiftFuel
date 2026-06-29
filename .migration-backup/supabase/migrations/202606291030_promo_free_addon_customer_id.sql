-- Extends promo targeting/discount metadata for free add-ons and customer-id targeting.

alter table public.promo_codes
  add column if not exists specific_customer_id uuid;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.promo_codes'::regclass
      and conname = 'promo_codes_discount_type_check'
  ) then
    alter table public.promo_codes drop constraint promo_codes_discount_type_check;
  end if;
end $$;

alter table public.promo_codes
  add constraint promo_codes_discount_type_check
  check (discount_type in ('percent', 'fixed', 'free_addon'));

create index if not exists promo_codes_specific_customer_id_idx
  on public.promo_codes(specific_customer_id);
