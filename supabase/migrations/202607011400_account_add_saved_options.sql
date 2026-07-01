-- Add-from-account support: ensure the RPCs that let a signed-in customer add a
-- saved vehicle / service address from the My Account settings page exist in the
-- database. These already ship in supabase/shared/legacy-patches, but that file
-- is not part of the tracked migration set, so this migration re-creates them
-- (idempotent create-or-replace) to guarantee they're live before account.js
-- starts calling them. Mirrors the delete/update RPCs the dashboard already uses.
--
-- Apply this migration BEFORE uploading the new account.js.

-- ── Dedup key helpers (used by the add RPCs to reject near-duplicate saves) ──
create or replace function public.saved_vehicle_plate_key(p_plate text)
returns text language sql immutable as $$
  select upper(regexp_replace(trim(coalesce(p_plate, '')), '[\s-]+', '', 'g'));
$$;

create or replace function public.saved_vehicle_color_key(p_color text)
returns text language sql immutable as $$
  select lower(trim(coalesce(p_color, '')));
$$;

create or replace function public.saved_address_text_key(p_value text)
returns text language sql immutable as $$
  select lower(regexp_replace(trim(coalesce(p_value, '')), '\s+', ' ', 'g'));
$$;

create or replace function public.saved_address_state_key(p_state text)
returns text language sql immutable as $$
  select upper(trim(coalesce(p_state, '')));
$$;

create or replace function public.saved_address_zip_key(p_zip text)
returns text language sql immutable as $$
  select regexp_replace(coalesce(p_zip, ''), '\D', '', 'g');
$$;

-- ── Add a saved service address (requires an in-service-area address) ────────
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

-- ── Add a saved vehicle ─────────────────────────────────────────────────────
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
