-- Customer identity model cleanup.
--
-- This keeps guest checkout nullable, but gives requests, saved snapshots, and
-- promo redemptions a safe customer_id path when exact normalized phone + email
-- match one customer profile.

begin;

alter table public.users
  add column if not exists phone_digits text,
  add column if not exists email_normalized text;

alter table public.service_requests
  add column if not exists customer_id uuid,
  add column if not exists customer_phone_digits text,
  add column if not exists customer_email_normalized text;

alter table public.saved_customer_vehicles
  add column if not exists customer_id uuid,
  add column if not exists customer_phone_digits text,
  add column if not exists customer_email_normalized text;

alter table public.saved_service_addresses
  add column if not exists customer_id uuid,
  add column if not exists customer_phone_digits text,
  add column if not exists customer_email_normalized text;

alter table public.promo_redemptions
  add column if not exists customer_id uuid,
  add column if not exists customer_phone_digits text,
  add column if not exists customer_email_normalized text;

-- Older PROD databases may still have the broad lifecycle trigger from
-- 202606232100, even after later migrations removed its old timestamp columns.
-- Keep the function as a no-op so cleanup updates can run without referencing
-- columns that may no longer exist.
create or replace function public.stamp_request_lifecycle_times()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  return new;
end;
$$;

update public.users
set phone_digits = nullif(public.clean_phone(phone), ''),
    email_normalized = nullif(lower(trim(coalesce(email, ''))), '')
where phone_digits is null
   or email_normalized is null;

update public.service_requests
set customer_phone_digits = nullif(public.clean_phone(customer_phone), ''),
    customer_email_normalized = nullif(lower(trim(coalesce(customer_email, ''))), '')
where customer_phone_digits is null
   or customer_email_normalized is null;

update public.saved_customer_vehicles
set customer_phone_digits = nullif(public.clean_phone(customer_phone), ''),
    customer_email_normalized = nullif(lower(trim(coalesce(customer_email, ''))), '')
where customer_phone_digits is null
   or customer_email_normalized is null;

update public.saved_service_addresses
set customer_phone_digits = nullif(public.clean_phone(customer_phone), ''),
    customer_email_normalized = nullif(lower(trim(coalesce(customer_email, ''))), '')
where customer_phone_digits is null
   or customer_email_normalized is null;

create or replace function public.set_profile_identity_normalized()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.phone_digits := nullif(public.clean_phone(new.phone), '');
  new.email_normalized := nullif(lower(trim(coalesce(new.email, ''))), '');
  return new;
end;
$$;

create or replace function public.set_customer_owned_identity_normalized()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_customer_id uuid;
begin
  new.customer_phone_digits := nullif(public.clean_phone(new.customer_phone), '');
  new.customer_email_normalized := nullif(lower(trim(coalesce(new.customer_email, ''))), '');

  if new.customer_id is null
     and new.customer_phone_digits is not null
     and new.customer_email_normalized is not null then
    select c.id
    into v_customer_id
    from public.customers c
    where c.phone_digits = new.customer_phone_digits
      and c.email_normalized = new.customer_email_normalized
      and (
        select count(*)
        from public.customers c2
        where c2.phone_digits = new.customer_phone_digits
          and c2.email_normalized = new.customer_email_normalized
      ) = 1
    limit 1;

    new.customer_id := v_customer_id;
  end if;

  return new;
end;
$$;

drop trigger if exists customers_normalize_identity on public.customers;
create trigger customers_normalize_identity
before insert or update of phone, email
on public.customers
for each row
execute function public.set_profile_identity_normalized();

drop trigger if exists users_normalize_identity on public.users;
create trigger users_normalize_identity
before insert or update of phone, email
on public.users
for each row
execute function public.set_profile_identity_normalized();

drop trigger if exists saved_customer_vehicles_normalize_identity on public.saved_customer_vehicles;
create trigger saved_customer_vehicles_normalize_identity
before insert or update of customer_phone, customer_email
on public.saved_customer_vehicles
for each row
execute function public.set_customer_owned_identity_normalized();

drop trigger if exists saved_service_addresses_normalize_identity on public.saved_service_addresses;
create trigger saved_service_addresses_normalize_identity
before insert or update of customer_phone, customer_email
on public.saved_service_addresses
for each row
execute function public.set_customer_owned_identity_normalized();

drop trigger if exists service_requests_normalize_customer_identity on public.service_requests;
create trigger service_requests_normalize_customer_identity
before insert or update of customer_phone, customer_email
on public.service_requests
for each row
execute function public.set_customer_owned_identity_normalized();

drop trigger if exists promo_redemptions_normalize_identity on public.promo_redemptions;
create trigger promo_redemptions_normalize_identity
before insert or update of customer_phone, customer_email
on public.promo_redemptions
for each row
execute function public.set_customer_owned_identity_normalized();

create index if not exists users_phone_email_identity_idx
  on public.users (phone_digits, email_normalized)
  where phone_digits is not null
    and email_normalized is not null;

create index if not exists saved_customer_vehicles_customer_id_idx
  on public.saved_customer_vehicles (customer_id)
  where customer_id is not null;

create index if not exists saved_service_addresses_customer_id_idx
  on public.saved_service_addresses (customer_id)
  where customer_id is not null;

create index if not exists promo_redemptions_customer_id_idx
  on public.promo_redemptions (customer_id)
  where customer_id is not null;

create index if not exists saved_customer_vehicles_identity_idx
  on public.saved_customer_vehicles (customer_phone_digits, customer_email_normalized)
  where customer_phone_digits is not null
    and customer_email_normalized is not null;

create index if not exists saved_service_addresses_identity_idx
  on public.saved_service_addresses (customer_phone_digits, customer_email_normalized)
  where customer_phone_digits is not null
    and customer_email_normalized is not null;

with exact_customer as (
  select phone_digits, email_normalized, (array_agg(id order by created_at asc))[1] as customer_id
  from public.customers
  where phone_digits is not null
    and email_normalized is not null
  group by phone_digits, email_normalized
  having count(*) = 1
)
update public.service_requests sr
set customer_id = ec.customer_id
from exact_customer ec
where sr.customer_id is null
  and sr.customer_phone_digits = ec.phone_digits
  and sr.customer_email_normalized = ec.email_normalized;

with exact_customer as (
  select phone_digits, email_normalized, (array_agg(id order by created_at asc))[1] as customer_id
  from public.customers
  where phone_digits is not null
    and email_normalized is not null
  group by phone_digits, email_normalized
  having count(*) = 1
)
update public.saved_customer_vehicles v
set customer_id = ec.customer_id
from exact_customer ec
where v.customer_id is null
  and v.customer_phone_digits = ec.phone_digits
  and v.customer_email_normalized = ec.email_normalized;

with exact_customer as (
  select phone_digits, email_normalized, (array_agg(id order by created_at asc))[1] as customer_id
  from public.customers
  where phone_digits is not null
    and email_normalized is not null
  group by phone_digits, email_normalized
  having count(*) = 1
)
update public.saved_service_addresses a
set customer_id = ec.customer_id
from exact_customer ec
where a.customer_id is null
  and a.customer_phone_digits = ec.phone_digits
  and a.customer_email_normalized = ec.email_normalized;

with exact_customer as (
  select phone_digits, email_normalized, (array_agg(id order by created_at asc))[1] as customer_id
  from public.customers
  where phone_digits is not null
    and email_normalized is not null
  group by phone_digits, email_normalized
  having count(*) = 1
)
update public.promo_redemptions pr
set customer_id = ec.customer_id
from exact_customer ec
where pr.customer_id is null
  and pr.customer_phone_digits = ec.phone_digits
  and pr.customer_email_normalized = ec.email_normalized;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'service_requests_customer_id_fk'
      and conrelid = 'public.service_requests'::regclass
  ) then
    alter table public.service_requests
      add constraint service_requests_customer_id_fk
      foreign key (customer_id) references public.customers(id)
      on delete set null
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'saved_customer_vehicles_customer_id_fk'
      and conrelid = 'public.saved_customer_vehicles'::regclass
  ) then
    alter table public.saved_customer_vehicles
      add constraint saved_customer_vehicles_customer_id_fk
      foreign key (customer_id) references public.customers(id)
      on delete set null
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'saved_service_addresses_customer_id_fk'
      and conrelid = 'public.saved_service_addresses'::regclass
  ) then
    alter table public.saved_service_addresses
      add constraint saved_service_addresses_customer_id_fk
      foreign key (customer_id) references public.customers(id)
      on delete set null
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'promo_redemptions_customer_id_fk'
      and conrelid = 'public.promo_redemptions'::regclass
  ) then
    alter table public.promo_redemptions
      add constraint promo_redemptions_customer_id_fk
      foreign key (customer_id) references public.customers(id)
      on delete set null
      not valid;
  end if;
end $$;

create or replace function public.public_returning_customer_options(
  p_phone text,
  p_email text
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  with identity as (
    select public.clean_phone(p_phone) as phone_digits,
           lower(trim(coalesce(p_email, ''))) as email_normalized
  )
  select jsonb_build_object(
    'addresses', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.updated_at desc, a.created_at desc)
      from (
        select id, customer_id, customer_name, hospital, address_street, address_apt, address_city,
               address_state, address_zip, parking_location, parking_spot,
               parking_map_url, key_handoff_details, service_area_valid, created_at, updated_at
        from public.saved_service_addresses ssa, identity i
        where ssa.customer_phone_digits = i.phone_digits
          and ssa.customer_email_normalized = i.email_normalized
          and i.phone_digits <> ''
          and i.email_normalized <> ''
          and is_active = true
          and deleted_at is null
          and coalesce(service_area_valid, false) = true
      ) a
    ), '[]'::jsonb),
    'vehicles', coalesce((
      select jsonb_agg(to_jsonb(v) order by v.updated_at desc, v.created_at desc)
      from (
        select id, customer_id, customer_name, vehicle_year, vehicle_make, vehicle_model,
               vehicle_color, license_plate, fuel_type, created_at, updated_at
        from public.saved_customer_vehicles scv, identity i
        where scv.customer_phone_digits = i.phone_digits
          and scv.customer_email_normalized = i.email_normalized
          and i.phone_digits <> ''
          and i.email_normalized <> ''
          and is_active = true
          and deleted_at is null
      ) v
    ), '[]'::jsonb),
    'recent_requests', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc)
      from (
        select id, customer_id, customer_name, customer_phone, customer_email, service_type,
               service_label, fuel_type, wash_package, wash_package_label,
               service_date, created_at
        from public.service_requests sr, identity i
        where sr.customer_phone_digits = i.phone_digits
          and sr.customer_email_normalized = i.email_normalized
          and i.phone_digits <> ''
          and i.email_normalized <> ''
        order by created_at desc
        limit 5
      ) r
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.public_returning_customer_options(text, text) to anon, authenticated;

create or replace view public.customer_identity_conflicts as
select phone_digits,
       email_normalized,
       count(*) as customer_count,
       array_agg(id order by created_at asc) as customer_ids
from public.customers
where phone_digits is not null
  and email_normalized is not null
group by phone_digits, email_normalized
having count(*) > 1;

create or replace view public.unclaimed_customer_history as
select 'service_request'::text as source_table,
       id,
       customer_phone_digits,
       customer_email_normalized,
       customer_id,
       created_at
from public.service_requests
where customer_id is null
  and customer_phone_digits is not null
  and customer_email_normalized is not null
union all
select 'saved_vehicle'::text as source_table,
       id,
       customer_phone_digits,
       customer_email_normalized,
       customer_id,
       created_at
from public.saved_customer_vehicles
where customer_id is null
  and customer_phone_digits is not null
  and customer_email_normalized is not null
union all
select 'saved_address'::text as source_table,
       id,
       customer_phone_digits,
       customer_email_normalized,
       customer_id,
       created_at
from public.saved_service_addresses
where customer_id is null
  and customer_phone_digits is not null
  and customer_email_normalized is not null
union all
select 'promo_redemption'::text as source_table,
       id,
       customer_phone_digits,
       customer_email_normalized,
       customer_id,
       redeemed_at as created_at
from public.promo_redemptions
where customer_id is null
  and customer_phone_digits is not null
  and customer_email_normalized is not null;

create or replace function public.public_customer_identity_candidates(
  p_customer_id uuid
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  with target as (
    select id, phone_digits, email_normalized
    from public.customers
    where id = p_customer_id
      and phone_digits is not null
      and email_normalized is not null
  )
  select coalesce(jsonb_build_object(
    'service_requests', (
      select count(*)
      from public.service_requests sr, target t
      where sr.customer_id is null
        and sr.customer_phone_digits = t.phone_digits
        and sr.customer_email_normalized = t.email_normalized
    ),
    'saved_vehicles', (
      select count(*)
      from public.saved_customer_vehicles v, target t
      where v.customer_id is null
        and v.customer_phone_digits = t.phone_digits
        and v.customer_email_normalized = t.email_normalized
    ),
    'saved_addresses', (
      select count(*)
      from public.saved_service_addresses a, target t
      where a.customer_id is null
        and a.customer_phone_digits = t.phone_digits
        and a.customer_email_normalized = t.email_normalized
    ),
    'promo_redemptions', (
      select count(*)
      from public.promo_redemptions pr, target t
      where pr.customer_id is null
        and pr.customer_phone_digits = t.phone_digits
        and pr.customer_email_normalized = t.email_normalized
    )
  ), '{}'::jsonb)
  from target;
$$;

grant execute on function public.public_customer_identity_candidates(uuid) to service_role;

create or replace function public.public_record_promo_redemption(
  p_promo_code_id uuid,
  p_request_id uuid,
  p_customer_phone text,
  p_customer_email text,
  p_discount_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_redemption public.promo_redemptions%rowtype;
  v_promo public.promo_codes%rowtype;
  v_phone text := nullif(public.clean_phone(p_customer_phone), '');
  v_email text := nullif(lower(trim(coalesce(p_customer_email, ''))), '');
  v_customer_id uuid;
begin
  if p_promo_code_id is null then
    raise exception 'Promo code id is required.';
  end if;

  select c.id
  into v_customer_id
  from public.customers c
  where c.phone_digits = v_phone
    and c.email_normalized = v_email
    and (
      select count(*)
      from public.customers c2
      where c2.phone_digits = v_phone
        and c2.email_normalized = v_email
    ) = 1
  limit 1;

  select *
  into v_promo
  from public.promo_codes
  where id = p_promo_code_id
  for update;

  if not found then
    raise exception 'Promo code was not found.';
  end if;

  if v_promo.max_redemptions is not null
     and v_promo.redemption_count >= v_promo.max_redemptions then
    raise exception 'This promo code has reached its redemption limit.';
  end if;

  insert into public.promo_redemptions (
    promo_code_id,
    request_id,
    customer_id,
    customer_phone,
    customer_email,
    customer_phone_digits,
    customer_email_normalized,
    discount_amount
  )
  values (
    p_promo_code_id,
    p_request_id,
    v_customer_id,
    v_phone,
    v_email,
    v_phone,
    v_email,
    greatest(coalesce(p_discount_amount, 0), 0)
  )
  returning * into v_redemption;

  update public.promo_codes
  set redemption_count = redemption_count + 1,
      updated_at = now()
  where id = p_promo_code_id
  returning * into v_promo;

  return jsonb_build_object(
    'redemption_id', v_redemption.id,
    'customer_id', v_redemption.customer_id,
    'redemption_count', v_promo.redemption_count
  );
end;
$$;

grant execute on function public.public_record_promo_redemption(uuid, uuid, text, text, numeric) to service_role;

commit;
