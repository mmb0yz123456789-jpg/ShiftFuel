-- Auto-apply support for the change-request queue: add a single day off for a
-- worker. Used when an admin approves a "time off" schedule request that carries
-- a specific date — the day-off is applied without the admin re-typing it. Safe
-- to call repeatedly (no-op if the day is already off). All other change-request
-- kinds still apply manually (see worker_change_requests migration).

begin;

create or replace function public.admin_add_day_off(
  p_token       uuid,
  p_employee_id uuid,
  p_day         date
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
  if p_employee_id is null or p_day is null then
    return;
  end if;
  insert into public.employee_days_off (employee_id, day_off)
  select p_employee_id, p_day
  where not exists (
    select 1 from public.employee_days_off
    where employee_id = p_employee_id and day_off = p_day
  );
end;
$$;

revoke execute on function public.admin_add_day_off(uuid, uuid, date) from public, authenticated;
grant execute on function public.admin_add_day_off(uuid, uuid, date) to anon, service_role;

notify pgrst, 'reload schema';

commit;
