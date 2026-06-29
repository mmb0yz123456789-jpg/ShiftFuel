-- Fixes Supabase database-linter findings (advisor export, 2026-06-23).
-- Idempotent and safe to re-run. Placed in migrations/ so CI applies it
-- automatically (these fixes were previously in manual SQL that never ran).

-- 1) ERROR: security_definer_view on public.employees_public.
--    Make the view run with the *querying* role's privileges + RLS, not the
--    creator's. The view already excludes password hash/salt columns.
alter view if exists public.employees_public set (security_invoker = on);

-- 2) SECURITY HOLE: drop the anon INSERT policy on service_requests.
--    Bookings are created server-side via /api/create-authorized-booking
--    (service-role key, Stripe-verified) and the SECURITY DEFINER
--    customer_complete_booking RPC. No browser/anon direct INSERT is used,
--    so this policy only let anyone POST a row with payment_status='authorized'
--    without ever paying.
drop policy if exists "Anyone can create service requests" on public.service_requests;

-- 3) Drop unused permissive quick_inspections policies (no client writes here).
drop policy if exists "Anyone can insert quick inspections" on public.quick_inspections;
drop policy if exists "Anyone can update quick inspections" on public.quick_inspections;

-- 4) Pin search_path on the flagged functions so a SECURITY DEFINER function
--    can't be tricked via a mutable search_path. Iterates pg_proc so it covers
--    overloads and unknown argument signatures automatically.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'clean_phone', 'customer_complete_booking', 'admin_create_request',
        'saved_vehicle_plate_key', 'saved_vehicle_color_key',
        'saved_address_text_key', 'saved_address_state_key', 'saved_address_zip_key'
      )
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
  end loop;
end $$;

-- 5) This app authenticates staff with custom session tokens, not Supabase Auth,
--    so the 'authenticated' role is never used by the frontend. Revoking EXECUTE
--    from it clears the ~43 "Signed-In Users Can Execute SECURITY DEFINER"
--    warnings with no functional impact. The anon grants are left in place
--    because the app needs them (every admin/worker RPC verifies its own token).
--    NOTE: if you later adopt Supabase Auth, remove this block and re-grant.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    execute format('revoke execute on function %s from authenticated', r.sig);
  end loop;
end $$;
