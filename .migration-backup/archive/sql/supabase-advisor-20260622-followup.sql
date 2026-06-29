-- ============================================================
-- ShiftFuel Concierge - Supabase Advisor follow-up cleanup
-- Date: 2026-06-22
--
-- Run this in the Supabase SQL Editor after the existing ShiftFuel
-- schema / lockdown scripts.
--
-- This file addresses the two current advisor exports:
--   - RLS enabled but no policy
--   - Overly broad write policies
--   - Public storage bucket listing on applicant resumes
--   - Missing search_path on cleanup_expired_service_photos
--   - Two remaining authenticated SECURITY DEFINER execute grants
--
-- Important:
-- The remaining anon SECURITY DEFINER function warnings are intentionally
-- not revoked here. The current browser app calls token-checked RPCs through
-- the anon Supabase client. Revoking anon EXECUTE from those RPCs before
-- moving them behind server-side API routes would break booking, tracking,
-- returning customer, admin, and worker flows.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. Tables with RLS enabled but no policy.
--
-- These tables should not be directly readable/writable by browser clients.
-- Adding an explicit deny-all policy satisfies the advisor without opening
-- access. SECURITY DEFINER RPCs and service-role API routes can still perform
-- the controlled operations they already handle.
-- ------------------------------------------------------------
do $$
declare
  target_table text;
  affected_tables text[] := array[
    'admin_config',
    'admin_lockout',
    'admin_sessions',
    'customer_vehicle_profiles',
    'payments',
    'request_photos',
    'service_pricing_settings',
    'service_requests',
    'users',
    'vehicles',
    'worker_sessions'
  ];
begin
  foreach target_table in array affected_tables loop
    if to_regclass('public.' || quote_ident(target_table)) is not null then
      execute format('alter table public.%I enable row level security', target_table);

      if not exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = target_table
          and policyname = 'No direct client access'
      ) then
        execute format(
          'create policy "No direct client access" on public.%I for all to anon, authenticated using (false) with check (false)',
          target_table
        );
      end if;
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 2. Replace RLS policies that used USING/WITH CHECK (true).
--
-- Applicants are still submitted directly from hiring.html, so public insert
-- remains allowed. Direct applicant updates are not needed from the public
-- client.
-- ------------------------------------------------------------
do $$
begin
  if to_regclass('public.applicants') is not null then
    drop policy if exists "Anyone can submit applicants" on public.applicants;
    drop policy if exists "Anyone can update applicants" on public.applicants;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'applicants'
        and policyname = 'Public can submit applicants'
    ) then
      create policy "Public can submit applicants"
        on public.applicants
        for insert
        to anon
        with check (auth.role() = 'anon');
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'applicants'
        and policyname = 'No direct applicant updates'
    ) then
      create policy "No direct applicant updates"
        on public.applicants
        for update
        to anon, authenticated
        using (false)
        with check (false);
    end if;
  end if;
end $$;

-- Employee/admin tables are managed through token-checked RPCs.
do $$
declare
  target_table text;
  affected_tables text[] := array[
    'employee_availability',
    'employee_days_off',
    'employees'
  ];
begin
  foreach target_table in array affected_tables loop
    if to_regclass('public.' || quote_ident(target_table)) is not null then
      execute format('drop policy if exists "Anyone can save %s" on public.%I', replace(target_table, '_', ' '), target_table);

      if not exists (
        select 1 from pg_policies
        where schemaname = 'public'
          and tablename = target_table
          and policyname = 'No direct client writes'
      ) then
        execute format(
          'create policy "No direct client writes" on public.%I for all to anon, authenticated using (false) with check (false)',
          target_table
        );
      end if;
    end if;
  end loop;
end $$;

-- Photos are inserted directly by admin/worker photo upload code after the
-- file is stored. Keep insert working but remove literal WITH CHECK (true).
do $$
begin
  if to_regclass('public.photos') is not null then
    drop policy if exists "Anyone can insert photos" on public.photos;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'photos'
        and policyname = 'Portal clients can insert photos'
    ) then
      create policy "Portal clients can insert photos"
        on public.photos
        for insert
        to anon, authenticated
        with check (auth.role() in ('anon', 'authenticated'));
    end if;
  end if;
end $$;

-- quick_inspections no longer appears to be written directly by current JS.
do $$
begin
  if to_regclass('public.quick_inspections') is not null then
    drop policy if exists "Anyone can insert quick inspections" on public.quick_inspections;
    drop policy if exists "Anyone can update quick inspections" on public.quick_inspections;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'quick_inspections'
        and policyname = 'No direct quick inspection writes'
    ) then
      create policy "No direct quick inspection writes"
        on public.quick_inspections
        for all
        to anon, authenticated
        using (false)
        with check (false);
    end if;
  end if;
end $$;

-- vehicle_psi_guides is read directly by admin/worker pages. Keep public read,
-- remove direct public writes.
do $$
begin
  if to_regclass('public.vehicle_psi_guides') is not null then
    drop policy if exists "Anyone can save vehicle psi guides" on public.vehicle_psi_guides;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'vehicle_psi_guides'
        and policyname = 'Anyone can read vehicle psi guides'
    ) then
      create policy "Anyone can read vehicle psi guides"
        on public.vehicle_psi_guides
        for select
        to anon, authenticated
        using (true);
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public'
        and tablename = 'vehicle_psi_guides'
        and policyname = 'No direct vehicle psi guide writes'
    ) then
      create policy "No direct vehicle psi guide writes"
        on public.vehicle_psi_guides
        for all
        to anon, authenticated
        using (false)
        with check (false);
    end if;
  end if;
end $$;

-- ------------------------------------------------------------
-- 3. Remove public object listing from applicant-resumes.
--
-- Public bucket object URLs do not require a broad SELECT policy on
-- storage.objects. Dropping this prevents clients from listing all resumes.
-- ------------------------------------------------------------
do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Anyone can read applicant resumes'
  ) then
    drop policy "Anyone can read applicant resumes" on storage.objects;
  end if;
end $$;

-- ------------------------------------------------------------
-- 4. Fix function_search_path_mutable for cleanup_expired_service_photos.
-- ------------------------------------------------------------
do $$
declare
  fn record;
begin
  for fn in
    select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'cleanup_expired_service_photos'
  loop
    execute format(
      'alter function %I.%I(%s) set search_path = public, storage, pg_temp',
      fn.nspname,
      fn.proname,
      fn.args
    );
  end loop;
end $$;

-- ------------------------------------------------------------
-- 5. Remove the two remaining authenticated SECURITY DEFINER execute grants.
--
-- Keep anon access where the browser app intentionally calls these RPCs.
-- ------------------------------------------------------------
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
        'admin_update_service_pricing',
        'public_get_service_pricing'
      )
  loop
    execute format('revoke execute on function %I.%I(%s) from public', fn.nspname, fn.proname, fn.args);
    execute format('revoke execute on function %I.%I(%s) from authenticated', fn.nspname, fn.proname, fn.args);
    execute format('grant execute on function %I.%I(%s) to anon', fn.nspname, fn.proname, fn.args);
  end loop;
end $$;

notify pgrst, 'reload schema';

commit;

-- Verification helpers:
-- Re-run the Supabase Advisor after this script.
-- If anon SECURITY DEFINER warnings remain, that is expected until the
-- browser-called RPCs are moved behind server-side API routes.
