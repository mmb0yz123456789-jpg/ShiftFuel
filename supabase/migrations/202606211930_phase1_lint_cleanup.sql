-- Phase 1 Supabase lint cleanup for ShiftFuel.
-- Safe scope:
-- 1) Fix the employees_public SECURITY DEFINER view lint.
-- 2) Lock function search_path on functions flagged by Supabase.
-- 3) Remove broad PUBLIC/authenticated execute access from SECURITY DEFINER RPC functions,
--    while preserving anon access because the current website calls these RPCs from the frontend.

begin;

-- Fix: security_definer_view on public.employees_public
-- Supabase recommends security_invoker so the view respects the caller's permissions/RLS.
do $$
begin
  if exists (
    select 1
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'employees_public'
      and c.relkind in ('v', 'm')
  ) then
    execute 'alter view public.employees_public set (security_invoker = true)';
  end if;
end $$;

-- Fix: function_search_path_mutable warnings.
-- Setting search_path prevents a SECURITY DEFINER/helper function from resolving objects
-- through an unexpected schema.
do $$
declare
  fn record;
  target_names text[] := array[
    'admin_create_request',
    'clean_phone',
    'customer_complete_booking',
    'saved_address_state_key',
    'saved_address_text_key',
    'saved_address_zip_key',
    'saved_vehicle_color_key',
    'saved_vehicle_plate_key'
  ];
begin
  for fn in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any(target_names)
  loop
    execute format(
      'alter function %I.%I(%s) set search_path = public, pg_temp',
      fn.nspname,
      fn.proname,
      fn.args
    );
  end loop;
end $$;

-- Fix: authenticated can execute SECURITY DEFINER functions.
-- Important: the app currently uses the public anon Supabase client and app-level tokens.
-- So we remove broad PUBLIC/authenticated access but explicitly preserve anon access.
do $$
declare
  fn record;
begin
  for fn in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef = true
      and p.proname in (
        'admin_create_request',
        'admin_create_session',
        'admin_delete_employee',
        'admin_insert_employee',
        'admin_list_applicants',
        'admin_list_requests',
        'admin_reset_worker_password',
        'admin_save_availability',
        'admin_save_days_off',
        'admin_update_applicant',
        'admin_update_employee',
        'admin_update_fuel_prices',
        'admin_update_request',
        'customer_complete_booking',
        'public_add_saved_address',
        'public_add_saved_vehicle',
        'public_booked_return_slots',
        'public_cancel_request',
        'public_get_fuel_prices',
        'public_hide_vehicle',
        'public_request_photos',
        'public_returning_customer_lookup',
        'public_returning_customer_options',
        'public_review_for_request',
        'public_soft_delete_saved_address',
        'public_soft_delete_saved_vehicle',
        'public_submit_service_review',
        'public_track_request',
        'public_update_saved_address',
        'public_update_saved_vehicle',
        'public_worker_availability_slots',
        'worker_change_password',
        'worker_change_password_secure',
        'worker_claim_request',
        'worker_create_session',
        'worker_list_my_requests',
        'worker_list_open_requests',
        'worker_login',
        'worker_save_availability',
        'worker_save_days_off',
        'worker_update_profile',
        'worker_update_request'
      )
  loop
    execute format('revoke execute on function %I.%I(%s) from public', fn.nspname, fn.proname, fn.args);
    execute format('revoke execute on function %I.%I(%s) from authenticated', fn.nspname, fn.proname, fn.args);
    execute format('grant execute on function %I.%I(%s) to anon', fn.nspname, fn.proname, fn.args);
  end loop;
end $$;

commit;
