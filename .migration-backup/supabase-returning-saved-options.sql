-- ============================================================
-- supabase-returning-saved-options.sql
-- Returning customer saved addresses / vehicles with soft delete.
--
-- Safe to re-run. Run after supabase-production-rls-lockdown.sql and
-- supabase-booking-rpc-lockdown.sql.
-- ============================================================

create table if not exists public.saved_service_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_phone text not null,
  customer_email text not null,
  customer_name text,
  hospital text,
  address_street text,
  address_apt text,
  address_city text,
  address_state text,
  address_zip text,
  parking_location text,
  parking_spot text,
  parking_map_url text,
  key_handoff_details text,
  service_area_valid boolean not null default true,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_customer_vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_phone text not null,
  customer_email text not null,
  customer_name text,
  vehicle_year text,
  vehicle_make text,
  vehicle_model text,
  vehicle_color text,
  license_plate text,
  fuel_type text,
  is_active boolean not null default true,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.saved_service_addresses
  add column if not exists service_area_valid boolean not null default true,
  add column if not exists is_active boolean not null default true,
  add column if not exists deleted_at timestamptz;

alter table public.saved_customer_vehicles
  add column if not exists is_active boolean not null default true,
  add column if not exists deleted_at timestamptz;

create index if not exists saved_service_addresses_lookup_idx
on public.saved_service_addresses (customer_phone, lower(customer_email), is_active, deleted_at);

create index if not exists saved_customer_vehicles_lookup_idx
on public.saved_customer_vehicles (customer_phone, lower(customer_email), is_active, deleted_at);

-- Backfill reusable saved options from historical service request snapshots.
insert into public.saved_service_addresses (
  customer_phone, customer_email, customer_name, hospital,
  address_street, address_apt, address_city, address_state, address_zip,
  parking_location, parking_spot, parking_map_url, key_handoff_details, service_area_valid
)
select distinct on (
  public.clean_phone(sr.customer_phone),
  lower(coalesce(sr.customer_email, '')),
  lower(coalesce(sr.address_street, sr.hospital, '')),
  lower(coalesce(sr.address_apt, '')),
  lower(coalesce(sr.address_city, '')),
  lower(coalesce(sr.address_state, '')),
  lower(coalesce(sr.address_zip, ''))
)
  sr.customer_phone, sr.customer_email, sr.customer_name, sr.hospital,
  sr.address_street, sr.address_apt, sr.address_city, sr.address_state, sr.address_zip,
  sr.parking_location, sr.parking_spot, sr.parking_map_url, sr.key_handoff_details, true
from public.service_requests sr
where public.clean_phone(sr.customer_phone) <> ''
  and coalesce(sr.customer_email, '') <> ''
  and coalesce(sr.address_street, sr.hospital, '') <> ''
  and not exists (
    select 1
    from public.saved_service_addresses ssa
    where public.clean_phone(ssa.customer_phone) = public.clean_phone(sr.customer_phone)
      and lower(coalesce(ssa.customer_email, '')) = lower(coalesce(sr.customer_email, ''))
      and lower(coalesce(ssa.address_street, ssa.hospital, '')) = lower(coalesce(sr.address_street, sr.hospital, ''))
      and lower(coalesce(ssa.address_apt, '')) = lower(coalesce(sr.address_apt, ''))
      and lower(coalesce(ssa.address_city, '')) = lower(coalesce(sr.address_city, ''))
      and lower(coalesce(ssa.address_state, '')) = lower(coalesce(sr.address_state, ''))
      and lower(coalesce(ssa.address_zip, '')) = lower(coalesce(sr.address_zip, ''))
  )
order by
  public.clean_phone(sr.customer_phone),
  lower(coalesce(sr.customer_email, '')),
  lower(coalesce(sr.address_street, sr.hospital, '')),
  lower(coalesce(sr.address_apt, '')),
  lower(coalesce(sr.address_city, '')),
  lower(coalesce(sr.address_state, '')),
  lower(coalesce(sr.address_zip, '')),
  sr.created_at desc;

insert into public.saved_customer_vehicles (
  customer_phone, customer_email, customer_name,
  vehicle_year, vehicle_make, vehicle_model, vehicle_color, license_plate, fuel_type
)
select distinct on (
  public.clean_phone(sr.customer_phone),
  lower(coalesce(sr.customer_email, '')),
  lower(coalesce(sr.license_plate, '')),
  sr.vehicle_year,
  lower(coalesce(sr.vehicle_make, '')),
  lower(coalesce(sr.vehicle_model, ''))
)
  sr.customer_phone, sr.customer_email, sr.customer_name,
  sr.vehicle_year, sr.vehicle_make, sr.vehicle_model, sr.vehicle_color, sr.license_plate, sr.fuel_type
from public.service_requests sr
where public.clean_phone(sr.customer_phone) <> ''
  and coalesce(sr.customer_email, '') <> ''
  and coalesce(sr.vehicle_make, '') <> ''
  and coalesce(sr.vehicle_model, '') <> ''
  and not exists (
    select 1
    from public.saved_customer_vehicles scv
    where public.clean_phone(scv.customer_phone) = public.clean_phone(sr.customer_phone)
      and lower(coalesce(scv.customer_email, '')) = lower(coalesce(sr.customer_email, ''))
      and lower(coalesce(scv.license_plate, '')) = lower(coalesce(sr.license_plate, ''))
      and scv.vehicle_year is not distinct from sr.vehicle_year
      and lower(coalesce(scv.vehicle_make, '')) = lower(coalesce(sr.vehicle_make, ''))
      and lower(coalesce(scv.vehicle_model, '')) = lower(coalesce(sr.vehicle_model, ''))
  )
order by
  public.clean_phone(sr.customer_phone),
  lower(coalesce(sr.customer_email, '')),
  lower(coalesce(sr.license_plate, '')),
  sr.vehicle_year,
  lower(coalesce(sr.vehicle_make, '')),
  lower(coalesce(sr.vehicle_model, '')),
  sr.created_at desc;

alter table public.saved_service_addresses enable row level security;
alter table public.saved_customer_vehicles enable row level security;

drop policy if exists "No direct saved address access" on public.saved_service_addresses;
create policy "No direct saved address access"
on public.saved_service_addresses
for all
to anon, authenticated
using (false)
with check (false);

drop policy if exists "No direct saved vehicle access" on public.saved_customer_vehicles;
create policy "No direct saved vehicle access"
on public.saved_customer_vehicles
for all
to anon, authenticated
using (false)
with check (false);

create or replace function public.public_returning_customer_options(
  p_phone text,
  p_email text
)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'addresses', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.updated_at desc, a.created_at desc)
      from (
        select id, customer_name, hospital, address_street, address_apt, address_city,
               address_state, address_zip, parking_location, parking_spot,
               parking_map_url, key_handoff_details, service_area_valid, created_at, updated_at
        from public.saved_service_addresses
        where public.clean_phone(customer_phone) = public.clean_phone(p_phone)
          and lower(coalesce(customer_email, '')) = lower(coalesce(p_email, ''))
          and public.clean_phone(p_phone) <> ''
          and coalesce(p_email, '') <> ''
          and is_active = true
          and deleted_at is null
          and coalesce(service_area_valid, false) = true
      ) a
    ), '[]'::jsonb),
    'vehicles', coalesce((
      select jsonb_agg(to_jsonb(v) order by v.updated_at desc, v.created_at desc)
      from (
        select id, customer_name, vehicle_year, vehicle_make, vehicle_model,
               vehicle_color, license_plate, fuel_type, created_at, updated_at
        from public.saved_customer_vehicles
        where public.clean_phone(customer_phone) = public.clean_phone(p_phone)
          and lower(coalesce(customer_email, '')) = lower(coalesce(p_email, ''))
          and public.clean_phone(p_phone) <> ''
          and coalesce(p_email, '') <> ''
          and is_active = true
          and deleted_at is null
      ) v
    ), '[]'::jsonb),
    'recent_requests', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at desc)
      from (
        select id, customer_name, customer_phone, customer_email, service_type,
               service_label, fuel_type, wash_package, wash_package_label,
               service_date, created_at
        from public.service_requests
        where public.clean_phone(customer_phone) = public.clean_phone(p_phone)
          and lower(coalesce(customer_email, '')) = lower(coalesce(p_email, ''))
          and public.clean_phone(p_phone) <> ''
          and coalesce(p_email, '') <> ''
        order by created_at desc
        limit 5
      ) r
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.public_returning_customer_options(text, text) to anon, authenticated;

create or replace function public.public_soft_delete_saved_address(
  p_address_id uuid,
  p_phone text,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.saved_service_addresses
  set is_active = false,
      deleted_at = now(),
      updated_at = now()
  where id = p_address_id
    and public.clean_phone(customer_phone) = public.clean_phone(p_phone)
    and lower(coalesce(customer_email, '')) = lower(coalesce(p_email, ''))
    and is_active = true
    and deleted_at is null;
end;
$$;

grant execute on function public.public_soft_delete_saved_address(uuid, text, text) to anon, authenticated;

create or replace function public.public_soft_delete_saved_vehicle(
  p_vehicle_id uuid,
  p_phone text,
  p_email text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.saved_customer_vehicles
  set is_active = false,
      deleted_at = now(),
      updated_at = now()
  where id = p_vehicle_id
    and public.clean_phone(customer_phone) = public.clean_phone(p_phone)
    and lower(coalesce(customer_email, '')) = lower(coalesce(p_email, ''))
    and is_active = true
    and deleted_at is null;
end;
$$;

grant execute on function public.public_soft_delete_saved_vehicle(uuid, text, text) to anon, authenticated;

create or replace function public.saved_vehicle_plate_key(p_plate text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(trim(coalesce(p_plate, '')), '[\s-]+', '', 'g'));
$$;

create or replace function public.saved_vehicle_color_key(p_color text)
returns text
language sql
immutable
as $$
  select lower(trim(coalesce(p_color, '')));
$$;

create or replace function public.saved_address_text_key(p_value text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(trim(coalesce(p_value, '')), '\s+', ' ', 'g'));
$$;

create or replace function public.saved_address_state_key(p_state text)
returns text
language sql
immutable
as $$
  select upper(trim(coalesce(p_state, '')));
$$;

create or replace function public.saved_address_zip_key(p_zip text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(p_zip, ''), '\D', '', 'g');
$$;

create or replace function public.public_add_saved_address(
  p_phone text,
  p_email text,
  p_data jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if public.clean_phone(p_phone) = '' or coalesce(p_email, '') = '' then
    raise exception 'Phone and email are required.';
  end if;
  if coalesce((p_data->>'service_area_valid')::boolean, false) is not true then
    raise exception 'Address is outside the service area.';
  end if;
  if exists (
    select 1
    from public.saved_service_addresses
    where public.clean_phone(customer_phone) = public.clean_phone(p_phone)
      and lower(coalesce(customer_email, '')) = lower(coalesce(p_email, ''))
      and is_active = true
      and deleted_at is null
      and public.saved_address_text_key(coalesce(address_street, hospital)) = public.saved_address_text_key(p_data->>'address_street')
      and public.saved_address_text_key(address_apt) = public.saved_address_text_key(p_data->>'address_apt')
      and public.saved_address_text_key(address_city) = public.saved_address_text_key(p_data->>'address_city')
      and public.saved_address_state_key(address_state) = public.saved_address_state_key(p_data->>'address_state')
      and public.saved_address_zip_key(address_zip) = public.saved_address_zip_key(p_data->>'address_zip')
  ) then
    raise exception 'This address is already saved. Please use the saved address or edit the existing one.';
  end if;

  insert into public.saved_service_addresses (
    customer_phone, customer_email, customer_name, hospital,
    address_street, address_apt, address_city, address_state, address_zip,
    parking_location, parking_spot, parking_map_url, key_handoff_details,
    service_area_valid, is_active, deleted_at
  ) values (
    p_phone, lower(p_email), p_data->>'customer_name', p_data->>'hospital',
    p_data->>'address_street', p_data->>'address_apt', p_data->>'address_city',
    p_data->>'address_state', p_data->>'address_zip',
    p_data->>'parking_location', p_data->>'parking_spot',
    p_data->>'parking_map_url', p_data->>'key_handoff_details',
    true, true, null
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.public_add_saved_address(text, text, jsonb) to anon, authenticated;

create or replace function public.public_add_saved_vehicle(
  p_phone text,
  p_email text,
  p_data jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if public.clean_phone(p_phone) = '' or coalesce(p_email, '') = '' then
    raise exception 'Phone and email are required.';
  end if;

  if exists (
    select 1
    from public.saved_customer_vehicles
    where public.clean_phone(customer_phone) = public.clean_phone(p_phone)
      and lower(coalesce(customer_email, '')) = lower(coalesce(p_email, ''))
      and is_active = true
      and deleted_at is null
      and public.saved_vehicle_plate_key(license_plate) = public.saved_vehicle_plate_key(p_data->>'license_plate')
      and public.saved_vehicle_color_key(vehicle_color) = public.saved_vehicle_color_key(p_data->>'vehicle_color')
  ) then
    raise exception 'This vehicle already appears to be saved. Please use the saved vehicle or edit the existing one.';
  end if;

  insert into public.saved_customer_vehicles (
    customer_phone, customer_email, customer_name,
    vehicle_year, vehicle_make, vehicle_model, vehicle_color, license_plate, fuel_type,
    is_active, deleted_at
  ) values (
    p_phone, lower(p_email), p_data->>'customer_name',
    p_data->>'vehicle_year', p_data->>'vehicle_make', p_data->>'vehicle_model',
    p_data->>'vehicle_color', p_data->>'license_plate', p_data->>'fuel_type',
    true, null
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.public_add_saved_vehicle(text, text, jsonb) to anon, authenticated;

create or replace function public.public_update_saved_address(
  p_address_id uuid,
  p_phone text,
  p_email text,
  p_data jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.saved_service_addresses
    where id <> p_address_id
      and public.clean_phone(customer_phone) = public.clean_phone(p_phone)
      and lower(coalesce(customer_email, '')) = lower(coalesce(p_email, ''))
      and is_active = true
      and deleted_at is null
      and public.saved_address_text_key(coalesce(address_street, hospital)) = public.saved_address_text_key(p_data->>'address_street')
      and public.saved_address_text_key(address_apt) = public.saved_address_text_key(p_data->>'address_apt')
      and public.saved_address_text_key(address_city) = public.saved_address_text_key(p_data->>'address_city')
      and public.saved_address_state_key(address_state) = public.saved_address_state_key(p_data->>'address_state')
      and public.saved_address_zip_key(address_zip) = public.saved_address_zip_key(p_data->>'address_zip')
  ) then
    raise exception 'This address is already saved. Please use the saved address or edit the existing one.';
  end if;

  update public.saved_service_addresses
  set customer_name        = case when p_data ? 'customer_name'        then p_data->>'customer_name'        else customer_name end,
      hospital             = case when p_data ? 'hospital'             then p_data->>'hospital'             else hospital end,
      address_street       = case when p_data ? 'address_street'       then p_data->>'address_street'       else address_street end,
      address_apt          = case when p_data ? 'address_apt'          then p_data->>'address_apt'          else address_apt end,
      address_city         = case when p_data ? 'address_city'         then p_data->>'address_city'         else address_city end,
      address_state        = case when p_data ? 'address_state'        then p_data->>'address_state'        else address_state end,
      address_zip          = case when p_data ? 'address_zip'          then p_data->>'address_zip'          else address_zip end,
      parking_location     = case when p_data ? 'parking_location'     then p_data->>'parking_location'     else parking_location end,
      parking_spot         = case when p_data ? 'parking_spot'         then p_data->>'parking_spot'         else parking_spot end,
      parking_map_url      = case when p_data ? 'parking_map_url'      then p_data->>'parking_map_url'      else parking_map_url end,
      key_handoff_details  = case when p_data ? 'key_handoff_details'  then p_data->>'key_handoff_details'  else key_handoff_details end,
      service_area_valid   = case when p_data ? 'service_area_valid'   then (p_data->>'service_area_valid')::boolean else service_area_valid end,
      updated_at = now()
  where id = p_address_id
    and public.clean_phone(customer_phone) = public.clean_phone(p_phone)
    and lower(coalesce(customer_email, '')) = lower(coalesce(p_email, ''))
    and is_active = true
    and deleted_at is null;
end;
$$;

grant execute on function public.public_update_saved_address(uuid, text, text, jsonb) to anon, authenticated;

create or replace function public.public_update_saved_vehicle(
  p_vehicle_id uuid,
  p_phone text,
  p_email text,
  p_data jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
    from public.saved_customer_vehicles
    where id <> p_vehicle_id
      and public.clean_phone(customer_phone) = public.clean_phone(p_phone)
      and lower(coalesce(customer_email, '')) = lower(coalesce(p_email, ''))
      and is_active = true
      and deleted_at is null
      and public.saved_vehicle_plate_key(license_plate) = public.saved_vehicle_plate_key(p_data->>'license_plate')
      and public.saved_vehicle_color_key(vehicle_color) = public.saved_vehicle_color_key(p_data->>'vehicle_color')
  ) then
    raise exception 'This vehicle already appears to be saved. Please use the saved vehicle or edit the existing one.';
  end if;

  update public.saved_customer_vehicles
  set customer_name  = case when p_data ? 'customer_name'  then p_data->>'customer_name'  else customer_name end,
      vehicle_year   = case when p_data ? 'vehicle_year'   then p_data->>'vehicle_year'   else vehicle_year end,
      vehicle_make   = case when p_data ? 'vehicle_make'   then p_data->>'vehicle_make'   else vehicle_make end,
      vehicle_model  = case when p_data ? 'vehicle_model'  then p_data->>'vehicle_model'  else vehicle_model end,
      vehicle_color  = case when p_data ? 'vehicle_color'  then p_data->>'vehicle_color'  else vehicle_color end,
      license_plate  = case when p_data ? 'license_plate'  then p_data->>'license_plate'  else license_plate end,
      fuel_type      = case when p_data ? 'fuel_type'      then p_data->>'fuel_type'      else fuel_type end,
      updated_at = now()
  where id = p_vehicle_id
    and public.clean_phone(customer_phone) = public.clean_phone(p_phone)
    and lower(coalesce(customer_email, '')) = lower(coalesce(p_email, ''))
    and is_active = true
    and deleted_at is null;
end;
$$;

grant execute on function public.public_update_saved_vehicle(uuid, text, text, jsonb) to anon, authenticated;
