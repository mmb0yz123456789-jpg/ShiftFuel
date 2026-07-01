-- Includes customer_id in returning-customer option payloads when the saved
-- option was derived from an existing customer/request.

alter table public.saved_service_addresses
  add column if not exists customer_name text,
  add column if not exists hospital text,
  add column if not exists parking_location text,
  add column if not exists parking_spot text,
  add column if not exists parking_map_url text,
  add column if not exists key_handoff_details text,
  add column if not exists service_area_valid boolean not null default true,
  add column if not exists is_active boolean not null default true,
  add column if not exists deleted_at timestamptz;

alter table public.saved_customer_vehicles
  add column if not exists customer_name text,
  add column if not exists fuel_type text,
  add column if not exists is_active boolean not null default true,
  add column if not exists deleted_at timestamptz;

alter table public.service_requests
  add column if not exists customer_id uuid;

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
        select id, customer_id, customer_name, customer_phone, customer_email, service_type,
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
