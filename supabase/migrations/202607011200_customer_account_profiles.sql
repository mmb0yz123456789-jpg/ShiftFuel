-- Persist lightweight customer account profiles before a customer has saved
-- vehicles, addresses, or service history.

begin;

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  first_name text,
  last_name text,
  name text,
  phone text not null,
  phone_digits text not null,
  email text not null,
  email_normalized text not null,
  service_area text,
  zip_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create unique index if not exists customers_phone_email_key
  on public.customers (phone_digits, email_normalized);

alter table public.customers enable row level security;

insert into public.customers (
  name,
  phone,
  phone_digits,
  email,
  email_normalized,
  created_at,
  updated_at,
  last_seen_at
)
select distinct on (phone_digits, email_normalized)
  customer_name,
  phone_digits,
  phone_digits,
  email_normalized,
  email_normalized,
  created_at,
  updated_at,
  updated_at
from (
  select
    nullif(customer_name, '') as customer_name,
    public.clean_phone(customer_phone) as phone_digits,
    lower(nullif(customer_email, '')) as email_normalized,
    created_at,
    updated_at
  from public.saved_customer_vehicles
  where public.clean_phone(customer_phone) <> ''
    and nullif(customer_email, '') is not null

  union all

  select
    nullif(customer_name, '') as customer_name,
    public.clean_phone(customer_phone) as phone_digits,
    lower(nullif(customer_email, '')) as email_normalized,
    created_at,
    updated_at
  from public.saved_service_addresses
  where public.clean_phone(customer_phone) <> ''
    and nullif(customer_email, '') is not null

  union all

  select
    nullif(customer_name, '') as customer_name,
    public.clean_phone(customer_phone) as phone_digits,
    lower(nullif(customer_email, '')) as email_normalized,
    created_at,
    coalesce(updated_at, created_at) as updated_at
  from public.service_requests
  where public.clean_phone(customer_phone) <> ''
    and nullif(customer_email, '') is not null
) existing_customers
where phone_digits <> ''
  and email_normalized is not null
order by phone_digits, email_normalized, updated_at desc nulls last
on conflict (phone_digits, email_normalized) do nothing;

create or replace function public.public_lookup_customer_account(
  p_phone text,
  p_email text
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select to_jsonb(c)
    from (
      select id, first_name, last_name, name, phone, email, service_area,
             zip_code, created_at, updated_at, last_seen_at
      from public.customers
      where phone_digits = public.clean_phone(p_phone)
        and email_normalized = lower(coalesce(p_email, ''))
        and public.clean_phone(p_phone) <> ''
        and coalesce(p_email, '') <> ''
      limit 1
    ) c
  ), 'null'::jsonb);
$$;

create or replace function public.public_upsert_customer_account(
  p_phone text,
  p_email text,
  p_first_name text default null,
  p_last_name text default null,
  p_name text default null,
  p_service_area text default null,
  p_zip_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_phone text := public.clean_phone(p_phone);
  v_email text := lower(trim(coalesce(p_email, '')));
  v_first_name text := nullif(trim(coalesce(p_first_name, '')), '');
  v_last_name text := nullif(trim(coalesce(p_last_name, '')), '');
  v_name text := coalesce(
    nullif(trim(coalesce(p_name, '')), ''),
    nullif(trim(concat_ws(' ', v_first_name, v_last_name)), '')
  );
  v_service_area text := nullif(trim(coalesce(p_service_area, '')), '');
  v_zip_code text := nullif(trim(coalesce(p_zip_code, '')), '');
  v_customer public.customers%rowtype;
begin
  if v_phone = '' or v_email = '' then
    raise exception 'Phone and email are required.';
  end if;

  insert into public.customers (
    first_name,
    last_name,
    name,
    phone,
    phone_digits,
    email,
    email_normalized,
    service_area,
    zip_code,
    updated_at,
    last_seen_at
  )
  values (
    v_first_name,
    v_last_name,
    v_name,
    v_phone,
    v_phone,
    v_email,
    v_email,
    v_service_area,
    v_zip_code,
    now(),
    now()
  )
  on conflict (phone_digits, email_normalized) do update
    set first_name = coalesce(excluded.first_name, public.customers.first_name),
        last_name = coalesce(excluded.last_name, public.customers.last_name),
        name = coalesce(excluded.name, public.customers.name),
        phone = excluded.phone,
        email = excluded.email,
        service_area = coalesce(excluded.service_area, public.customers.service_area),
        zip_code = coalesce(excluded.zip_code, public.customers.zip_code),
        updated_at = now(),
        last_seen_at = now()
  returning * into v_customer;

  return to_jsonb(v_customer);
end;
$$;

grant execute on function public.public_lookup_customer_account(text, text) to anon, authenticated;
grant execute on function public.public_upsert_customer_account(text, text, text, text, text, text, text) to anon, authenticated;

commit;
