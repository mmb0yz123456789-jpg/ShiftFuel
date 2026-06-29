-- Worker profile photo visibility repair.
--
-- Run this in Supabase SQL Editor if the admin page can see a worker photo
-- but the worker portal/profile cannot. It refreshes employees_public so
-- worker.js can read the safe profile photo fields without exposing password
-- hash/salt columns.

begin;

create or replace view public.employees_public
  with (security_invoker = true, security_barrier = true)
as
  select
    id,
    employee_code,
    full_name,
    phone,
    email,
    active,
    home_location,
    started_at,
    photo_url,
    original_photo_url,
    cropped_photo_url,
    photo_zoom,
    photo_position_x,
    photo_position_y,
    profile_updated_at,
    password_updated_at
  from public.employees;

grant select on public.employees_public to anon, authenticated;

alter table public.employees enable row level security;
drop policy if exists "deny_direct_select" on public.employees;
drop policy if exists "Anyone can read employees" on public.employees;
drop policy if exists "anon_select_safe_employee_columns" on public.employees;
create policy "anon_select_safe_employee_columns"
  on public.employees
  for select
  to anon, authenticated
  using (true);

revoke select on public.employees from anon, authenticated;
grant select (
  id,
  employee_code,
  full_name,
  phone,
  email,
  active,
  home_location,
  started_at,
  photo_url,
  original_photo_url,
  cropped_photo_url,
  photo_zoom,
  photo_position_x,
  photo_position_y,
  profile_updated_at,
  password_updated_at
) on public.employees to anon, authenticated;

notify pgrst, 'reload schema';

commit;
