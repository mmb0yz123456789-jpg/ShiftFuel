-- ============================================================
-- supabase-vehicle-hide.sql
-- Deprecated compatibility shim.
--
-- Older frontend builds called public_hide_vehicle(request_id, phone, email).
-- That old implementation updated service_requests.vehicle_hidden, which
-- changed historical request rows. Do not do that.
--
-- Current behavior:
-- - Ensures the soft-delete saved-option tables/RPCs exist by relying on
--   supabase-returning-saved-options.sql being run after this file.
-- - Redefines public_hide_vehicle to soft-delete the matching saved vehicle
--   only when the saved vehicle table exists.
-- - Never updates service_requests.
-- ============================================================

create or replace function public.public_hide_vehicle(
  p_request_id uuid,
  p_phone      text,
  p_email      text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_license_plate text;
  v_vehicle_year  text;
  v_vehicle_make  text;
  v_vehicle_model text;
begin
  select license_plate, vehicle_year, vehicle_make, vehicle_model
  into v_license_plate, v_vehicle_year, v_vehicle_make, v_vehicle_model
  from public.service_requests
  where id = p_request_id
    and public.clean_phone(customer_phone) = public.clean_phone(p_phone)
    and lower(coalesce(customer_email, '')) = lower(coalesce(p_email, ''))
    and public.clean_phone(p_phone) <> ''
    and coalesce(p_email, '') <> '';

  if not found then return; end if;

  if to_regclass('public.saved_customer_vehicles') is null then
    return;
  end if;

  execute $sql$
    update public.saved_customer_vehicles
    set is_active = false,
        deleted_at = now(),
        updated_at = now()
    where public.clean_phone(customer_phone) = public.clean_phone($1)
      and lower(coalesce(customer_email, '')) = lower(coalesce($2, ''))
      and lower(coalesce(license_plate, '')) = lower(coalesce($3, ''))
      and vehicle_year is not distinct from $4
      and lower(coalesce(vehicle_make, '')) = lower(coalesce($5, ''))
      and lower(coalesce(vehicle_model, '')) = lower(coalesce($6, ''))
      and is_active = true
      and deleted_at is null
  $sql$ using p_phone, p_email, v_license_plate, v_vehicle_year, v_vehicle_make, v_vehicle_model;
end;
$$;

grant execute on function public.public_hide_vehicle(uuid, text, text) to anon, authenticated;
