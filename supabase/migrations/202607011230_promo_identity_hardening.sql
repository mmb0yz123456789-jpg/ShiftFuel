-- Harden promo identity matching so one limited promo cannot be redeemed twice
-- by the same normalized phone or normalized email, including guest checkout.

begin;

alter table public.promo_redemptions
  add column if not exists customer_phone_digits text,
  add column if not exists customer_email_normalized text;

alter table public.service_requests
  add column if not exists customer_phone_digits text,
  add column if not exists customer_email_normalized text;

update public.promo_redemptions
set customer_phone_digits = nullif(public.clean_phone(customer_phone), ''),
    customer_email_normalized = nullif(lower(trim(coalesce(customer_email, ''))), '')
where customer_phone_digits is null
   or customer_email_normalized is null;

update public.service_requests
set customer_phone_digits = nullif(public.clean_phone(customer_phone), ''),
    customer_email_normalized = nullif(lower(trim(coalesce(customer_email, ''))), '')
where customer_phone_digits is null
   or customer_email_normalized is null;

create or replace function public.set_customer_identity_normalized()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.customer_phone_digits := nullif(public.clean_phone(new.customer_phone), '');
  new.customer_email_normalized := nullif(lower(trim(coalesce(new.customer_email, ''))), '');
  return new;
end;
$$;

drop trigger if exists promo_redemptions_normalize_identity on public.promo_redemptions;
create trigger promo_redemptions_normalize_identity
before insert or update of customer_phone, customer_email
on public.promo_redemptions
for each row
execute function public.set_customer_identity_normalized();

drop trigger if exists service_requests_normalize_customer_identity on public.service_requests;
create trigger service_requests_normalize_customer_identity
before insert or update of customer_phone, customer_email
on public.service_requests
for each row
execute function public.set_customer_identity_normalized();

-- Preserve existing redemption rows, but if historical duplicates already exist,
-- only the earliest row keeps the normalized key so the new unique indexes can
-- be created safely. The original phone/email text remains unchanged for audit.
with ranked_phone as (
  select id,
         row_number() over (
           partition by promo_code_id, customer_phone_digits
           order by redeemed_at asc, id asc
         ) as rn
  from public.promo_redemptions
  where customer_phone_digits is not null
)
update public.promo_redemptions pr
set customer_phone_digits = null
from ranked_phone rp
where pr.id = rp.id
  and rp.rn > 1;

with ranked_email as (
  select id,
         row_number() over (
           partition by promo_code_id, customer_email_normalized
           order by redeemed_at asc, id asc
         ) as rn
  from public.promo_redemptions
  where customer_email_normalized is not null
)
update public.promo_redemptions pr
set customer_email_normalized = null
from ranked_email re
where pr.id = re.id
  and re.rn > 1;

create unique index if not exists promo_redemptions_unique_phone_idx
  on public.promo_redemptions (promo_code_id, customer_phone_digits)
  where customer_phone_digits is not null;

create unique index if not exists promo_redemptions_unique_email_idx
  on public.promo_redemptions (promo_code_id, customer_email_normalized)
  where customer_email_normalized is not null;

create index if not exists service_requests_customer_phone_digits_idx
  on public.service_requests (customer_phone_digits)
  where customer_phone_digits is not null;

create index if not exists service_requests_customer_email_normalized_idx
  on public.service_requests (customer_email_normalized)
  where customer_email_normalized is not null;

commit;
