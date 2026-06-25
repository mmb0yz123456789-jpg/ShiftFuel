-- Worker background-verification flag.
-- Drives the customer-facing "Verified ShiftFuel Employee" badge on the Track
-- page (which was previously hardcoded for everyone). An admin can override it
-- manually (e.g. the owner-operator verifies themselves while starting out);
-- at scale this is the gate that keeps the badge honest.
-- Idempotent and safe to re-run.

begin;

alter table public.employees
  add column if not exists background_verified boolean not null default false;

-- Expose background_verified through employees_public (admin reads it; the Track
-- page reads it anonymously to decide whether to show the verified badge).
-- Column list mirrors the current view (incl. presence columns) + the new one.
create or replace view public.employees_public
  with (security_invoker = true, security_barrier = true)
as
  select
    id, employee_code, full_name, phone, email, active, home_location, started_at,
    photo_url, original_photo_url, cropped_photo_url, photo_zoom,
    photo_position_x, photo_position_y, profile_updated_at, password_updated_at,
    last_seen_at, presence_status, background_verified
  from public.employees;

grant select on public.employees_public to anon, authenticated;
grant select (background_verified) on public.employees to anon, authenticated;

-- Admin override: set/clear a worker's verified flag.
create or replace function public.admin_set_worker_verified(
  p_token       uuid,
  p_employee_id uuid,
  p_verified    boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not _verify_admin(p_token) then
    raise exception 'Unauthorized';
  end if;
  update public.employees
  set background_verified = coalesce(p_verified, false)
  where id = p_employee_id;
end;
$$;

revoke execute on function public.admin_set_worker_verified(uuid, uuid, boolean) from public, authenticated;
grant execute on function public.admin_set_worker_verified(uuid, uuid, boolean) to anon, service_role;

notify pgrst, 'reload schema';

commit;
