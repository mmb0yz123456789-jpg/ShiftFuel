-- Real worker presence for the admin "Worker Snapshot".
-- The worker app pings worker_heartbeat() every ~30s while open (and when the
-- worker toggles a break). The admin derives Online / On Break / Busy / Offline
-- from heartbeat freshness + presence_status + current job assignments.
-- Idempotent and safe to re-run.

begin;

-- 1) Presence columns on the employees base table.
alter table public.employees
  add column if not exists last_seen_at timestamptz,
  add column if not exists presence_status text not null default 'offline';

alter table public.employees drop constraint if exists employees_presence_status_check;
alter table public.employees
  add constraint employees_presence_status_check
  check (presence_status in ('online', 'on_break', 'offline'));

-- 2) Expose the two presence columns through employees_public (admin reads this).
--    Column list mirrors the existing safe view + the two new columns appended.
--    DROP+CREATE because PostgreSQL cannot reorder existing view columns with
--    CREATE OR REPLACE VIEW.
drop view if exists public.employees_public;

create view public.employees_public
  with (security_invoker = true, security_barrier = true)
as
  select
    id, employee_code, full_name, phone, email, active, home_location, started_at,
    photo_url, original_photo_url, cropped_photo_url, photo_zoom,
    photo_position_x, photo_position_y, profile_updated_at, password_updated_at,
    last_seen_at, presence_status
  from public.employees;

grant select on public.employees_public to anon, authenticated;

-- security_invoker view reads base columns as the querying role, so the
-- column-level grants on employees must include the new columns.
grant select (last_seen_at, presence_status) on public.employees to anon, authenticated;

-- 3) Heartbeat RPC. Verifies the worker session token, then stamps presence.
--    Defaults to 'online'; the break toggle passes 'on_break'; sign-out passes
--    'offline' (best effort — stale heartbeats also age out to Offline).
create or replace function public.worker_heartbeat(
  p_token text,
  p_status text default 'online'
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employee_id uuid;
  v_status text := lower(coalesce(p_status, 'online'));
begin
  select o_employee_id into v_employee_id from public._verify_worker(p_token::uuid);
  if v_employee_id is null then
    raise exception 'Unauthorized';
  end if;
  if v_status not in ('online', 'on_break', 'offline') then
    v_status := 'online';
  end if;
  update public.employees
  set last_seen_at = now(),
      presence_status = v_status
  where id = v_employee_id;
end;
$$;

revoke execute on function public.worker_heartbeat(text, text) from public;
grant execute on function public.worker_heartbeat(text, text) to anon, service_role;

notify pgrst, 'reload schema';

commit;
