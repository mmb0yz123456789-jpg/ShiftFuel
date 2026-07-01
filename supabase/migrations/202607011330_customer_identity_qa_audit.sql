-- Batch 6 QA/backfill pass for customer identity, promo redemption, and
-- guest-to-account claiming. This is intentionally conservative: normalize
-- fields that are derived directly from snapshots, and expose conflicts in
-- views for review instead of merging ambiguous records.

begin;

alter table public.service_requests
  add column if not exists customer_phone_digits text,
  add column if not exists customer_email_normalized text;

alter table public.promo_redemptions
  add column if not exists customer_phone_digits text,
  add column if not exists customer_email_normalized text;

alter table public.saved_customer_vehicles
  add column if not exists customer_phone_digits text,
  add column if not exists customer_email_normalized text;

alter table public.saved_service_addresses
  add column if not exists customer_phone_digits text,
  add column if not exists customer_email_normalized text;

update public.service_requests
set customer_phone_digits = nullif(public.clean_phone(customer_phone), ''),
    customer_email_normalized = nullif(lower(trim(coalesce(customer_email, ''))), '')
where (customer_phone is not null and customer_phone_digits is distinct from nullif(public.clean_phone(customer_phone), ''))
   or (customer_email is not null and customer_email_normalized is distinct from nullif(lower(trim(coalesce(customer_email, ''))), ''));

update public.promo_redemptions pr
set customer_phone_digits = nullif(public.clean_phone(pr.customer_phone), '')
where pr.customer_phone is not null
  and pr.customer_phone_digits is distinct from nullif(public.clean_phone(pr.customer_phone), '')
  and not exists (
    select 1
    from public.promo_redemptions other
    where other.id <> pr.id
      and other.promo_code_id = pr.promo_code_id
      and other.customer_phone_digits = nullif(public.clean_phone(pr.customer_phone), '')
  );

update public.promo_redemptions pr
set customer_email_normalized = nullif(lower(trim(coalesce(pr.customer_email, ''))), '')
where pr.customer_email is not null
  and pr.customer_email_normalized is distinct from nullif(lower(trim(coalesce(pr.customer_email, ''))), '')
  and not exists (
    select 1
    from public.promo_redemptions other
    where other.id <> pr.id
      and other.promo_code_id = pr.promo_code_id
      and other.customer_email_normalized = nullif(lower(trim(coalesce(pr.customer_email, ''))), '')
  );

update public.saved_customer_vehicles
set customer_phone_digits = nullif(public.clean_phone(customer_phone), ''),
    customer_email_normalized = nullif(lower(trim(coalesce(customer_email, ''))), '')
where (customer_phone is not null and customer_phone_digits is distinct from nullif(public.clean_phone(customer_phone), ''))
   or (customer_email is not null and customer_email_normalized is distinct from nullif(lower(trim(coalesce(customer_email, ''))), ''));

update public.saved_service_addresses
set customer_phone_digits = nullif(public.clean_phone(customer_phone), ''),
    customer_email_normalized = nullif(lower(trim(coalesce(customer_email, ''))), '')
where (customer_phone is not null and customer_phone_digits is distinct from nullif(public.clean_phone(customer_phone), ''))
   or (customer_email is not null and customer_email_normalized is distinct from nullif(lower(trim(coalesce(customer_email, ''))), ''));

create or replace view public.customer_identity_qa_conflicts as
select 'duplicate_promo_redemption_phone'::text as issue,
       promo_code_id::text as scope,
       customer_phone_digits as identity_value,
       count(*) as row_count,
       array_agg(id::text order by redeemed_at asc) as sample_ids
from public.promo_redemptions
where customer_phone_digits is not null
group by promo_code_id, customer_phone_digits
having count(*) > 1
union all
select 'duplicate_promo_redemption_email'::text as issue,
       promo_code_id::text as scope,
       customer_email_normalized as identity_value,
       count(*) as row_count,
       array_agg(id::text order by redeemed_at asc) as sample_ids
from public.promo_redemptions
where customer_email_normalized is not null
group by promo_code_id, customer_email_normalized
having count(*) > 1
union all
select 'duplicate_customer_phone_email'::text as issue,
       phone_digits as scope,
       email_normalized as identity_value,
       count(*) as row_count,
       array_agg(id::text order by created_at asc) as sample_ids
from public.customers
where phone_digits is not null
  and email_normalized is not null
group by phone_digits, email_normalized
having count(*) > 1
union all
select 'same_phone_multiple_emails'::text as issue,
       phone_digits as scope,
       'multiple_emails'::text as identity_value,
       count(distinct email_normalized) as row_count,
       array_agg(id::text order by created_at asc) as sample_ids
from public.customers
where phone_digits is not null
  and email_normalized is not null
group by phone_digits
having count(distinct email_normalized) > 1
union all
select 'same_email_multiple_phones'::text as issue,
       email_normalized as scope,
       'multiple_phones'::text as identity_value,
       count(distinct phone_digits) as row_count,
       array_agg(id::text order by created_at asc) as sample_ids
from public.customers
where phone_digits is not null
  and email_normalized is not null
group by email_normalized
having count(distinct phone_digits) > 1
union all
select 'service_request_missing_normalized_identity'::text as issue,
       'service_requests'::text as scope,
       coalesce(customer_email, customer_phone, 'missing_contact') as identity_value,
       count(*) as row_count,
       array_agg(id::text order by created_at asc) as sample_ids
from public.service_requests
where (customer_phone is not null and customer_phone_digits is null)
   or (customer_email is not null and customer_email_normalized is null)
group by coalesce(customer_email, customer_phone, 'missing_contact')
union all
select 'service_request_stale_customer_id'::text as issue,
       'service_requests'::text as scope,
       sr.customer_id::text as identity_value,
       count(*) as row_count,
       array_agg(sr.id::text order by sr.created_at asc) as sample_ids
from public.service_requests sr
left join public.customers c on c.id = sr.customer_id
where sr.customer_id is not null
  and c.id is null
group by sr.customer_id
union all
select 'saved_vehicle_safely_matchable'::text as issue,
       v.customer_phone_digits as scope,
       v.customer_email_normalized as identity_value,
       count(*) as row_count,
       array_agg(v.id::text order by v.created_at asc) as sample_ids
from public.saved_customer_vehicles v
join public.customers c
  on c.phone_digits = v.customer_phone_digits
 and c.email_normalized = v.customer_email_normalized
where v.customer_id is null
  and v.customer_phone_digits is not null
  and v.customer_email_normalized is not null
  and not exists (
    select 1
    from public.customers c2
    where c2.phone_digits = v.customer_phone_digits
      and c2.email_normalized = v.customer_email_normalized
      and c2.id <> c.id
  )
group by v.customer_phone_digits, v.customer_email_normalized
union all
select 'saved_address_safely_matchable'::text as issue,
       a.customer_phone_digits as scope,
       a.customer_email_normalized as identity_value,
       count(*) as row_count,
       array_agg(a.id::text order by a.created_at asc) as sample_ids
from public.saved_service_addresses a
join public.customers c
  on c.phone_digits = a.customer_phone_digits
 and c.email_normalized = a.customer_email_normalized
where a.customer_id is null
  and a.customer_phone_digits is not null
  and a.customer_email_normalized is not null
  and not exists (
    select 1
    from public.customers c2
    where c2.phone_digits = a.customer_phone_digits
      and c2.email_normalized = a.customer_email_normalized
      and c2.id <> c.id
  )
group by a.customer_phone_digits, a.customer_email_normalized;

create or replace view public.customer_identity_qa_summary as
select 'duplicate_or_conflict_groups'::text as metric,
       count(*)::bigint as value
from public.customer_identity_qa_conflicts
union all
select 'unclaimed_history_rows'::text as metric,
       count(*)::bigint as value
from public.unclaimed_customer_history
union all
select 'claim_audit_rows'::text as metric,
       count(*)::bigint as value
from public.customer_history_claim_audit
union all
select 'service_requests_missing_customer_id_with_exact_customer'::text as metric,
       count(*)::bigint as value
from public.service_requests sr
join public.customers c
  on c.phone_digits = sr.customer_phone_digits
 and c.email_normalized = sr.customer_email_normalized
where sr.customer_id is null
  and sr.customer_phone_digits is not null
  and sr.customer_email_normalized is not null;

commit;
