-- Completes the active promo_codes system used by /api/promos and booking
-- authorization. This intentionally extends promo_codes instead of introducing
-- a second parallel promos table.

begin;

alter table public.promo_codes
  add column if not exists name text,
  add column if not exists target_audience text not null default 'everyone',
  add column if not exists eligible_services text[] not null default array['all']::text[],
  add column if not exists inactive_days_threshold integer,
  add column if not exists specific_customer_id uuid,
  add column if not exists specific_customer_phone text,
  add column if not exists specific_customer_email text,
  add column if not exists starts_at timestamptz,
  add column if not exists applies_to text not null default 'service_fees';

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.promo_codes'::regclass
      and conname = 'promo_codes_target_audience_check'
  ) then
    alter table public.promo_codes drop constraint promo_codes_target_audience_check;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.promo_codes'::regclass
      and conname = 'promo_codes_discount_type_check'
  ) then
    alter table public.promo_codes drop constraint promo_codes_discount_type_check;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.promo_codes'::regclass
      and conname = 'promo_codes_applies_to_check'
  ) then
    alter table public.promo_codes drop constraint promo_codes_applies_to_check;
  end if;
end $$;

alter table public.promo_codes
  add constraint promo_codes_target_audience_check
  check (target_audience in ('everyone', 'account', 'guest', 'inactive', 'specific', 'new', 'returning')),
  add constraint promo_codes_discount_type_check
  check (discount_type in ('percent', 'fixed', 'free_addon')),
  add constraint promo_codes_applies_to_check
  check (applies_to in ('service_fees', 'wash_and_fees', 'total', 'fuel_service', 'wash_service', 'inspection'));

alter table public.service_requests
  add column if not exists promo_code text,
  add column if not exists promo_discount numeric not null default 0;

create index if not exists promo_codes_target_audience_idx on public.promo_codes(target_audience);
create index if not exists promo_codes_specific_customer_id_idx on public.promo_codes(specific_customer_id);
create index if not exists promo_codes_specific_phone_idx on public.promo_codes(specific_customer_phone);
create index if not exists promo_codes_specific_email_idx on public.promo_codes(specific_customer_email);
create index if not exists promo_redemptions_request_id_idx on public.promo_redemptions(request_id);

update public.promo_codes
set target_audience = case
  when audience = 'new' then 'new'
  when audience = 'returning' then 'returning'
  else target_audience
end
where audience in ('new', 'returning');

commit;
