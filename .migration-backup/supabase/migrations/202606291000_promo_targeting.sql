-- Adds optional targeting metadata for customer-facing promo codes.
-- Existing promo behavior is preserved through the legacy audience column.

alter table public.promo_codes
  add column if not exists name text,
  add column if not exists target_audience text not null default 'everyone'
    check (target_audience in ('everyone', 'account', 'guest', 'inactive', 'specific', 'new', 'returning')),
  add column if not exists eligible_services text[] not null default array['all']::text[],
  add column if not exists inactive_days_threshold integer,
  add column if not exists specific_customer_phone text,
  add column if not exists specific_customer_email text,
  add column if not exists starts_at timestamptz;

create index if not exists promo_codes_target_audience_idx on public.promo_codes(target_audience);
create index if not exists promo_codes_specific_phone_idx on public.promo_codes(specific_customer_phone);
create index if not exists promo_codes_specific_email_idx on public.promo_codes(specific_customer_email);

update public.promo_codes
set target_audience = case
  when audience = 'new' then 'new'
  when audience = 'returning' then 'returning'
  else 'everyone'
end
where target_audience = 'everyone'
  and audience in ('new', 'returning');
