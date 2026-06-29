-- Stage 4: worker request-modification queue.
-- A worker can ask for two kinds of change — a schedule/availability change, or a
-- change to a specific assigned job (drop / reschedule / swap) — and it lands in
-- an admin approval queue. Approving/rejecting is an acknowledgement: the admin
-- then applies the change with the existing tools (edit schedule in the Workers
-- tab, release/reassign the job). Auto-apply on approval is a deliberate later
-- refinement, kept out of v1 so an approval can never silently move a live job.
--
-- Access is RPC-only (RLS on, no policies). Mirrors the _verify_worker /
-- _verify_admin token pattern used across the app.

begin;

create table if not exists public.worker_change_requests (
  id                 uuid primary key default gen_random_uuid(),
  employee_id        uuid not null references public.employees(id) on delete cascade,
  kind               text not null check (kind in ('schedule', 'job')),
  service_request_id uuid references public.service_requests(id) on delete set null,
  details            text not null default '',
  requested_changes  jsonb,
  status             text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note         text,
  created_at         timestamptz not null default now(),
  resolved_at        timestamptz
);

create index if not exists worker_change_requests_employee_idx on public.worker_change_requests (employee_id);
create index if not exists worker_change_requests_status_idx   on public.worker_change_requests (status);

alter table public.worker_change_requests enable row level security;
-- No policies on purpose: every read/write goes through the security-definer
-- RPCs below (service-role / token-gated), never directly from the client.

-- ── Worker: submit a change request ───────────────────────────────────────────
create or replace function public.worker_submit_change_request(
  p_token              uuid,
  p_kind               text,
  p_details            text,
  p_service_request_id uuid  default null,
  p_requested_changes  jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employee_id uuid;
  v_id          uuid;
begin
  v_employee_id := _verify_worker(p_token);
  if v_employee_id is null then
    raise exception 'Unauthorized';
  end if;
  if p_kind not in ('schedule', 'job') then
    raise exception 'Invalid request kind';
  end if;

  -- A job request must reference a job that actually belongs to this worker.
  if p_kind = 'job' then
    if p_service_request_id is null
       or not exists (
         select 1 from service_requests sr
         where sr.id = p_service_request_id
           and sr.assigned_employee_id = v_employee_id
       ) then
      raise exception 'Job not found for this worker';
    end if;
  end if;

  insert into worker_change_requests (employee_id, kind, service_request_id, details, requested_changes)
  values (
    v_employee_id,
    p_kind,
    case when p_kind = 'job' then p_service_request_id else null end,
    coalesce(p_details, ''),
    p_requested_changes
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.worker_submit_change_request(uuid, text, text, uuid, jsonb) from public;
grant execute on function public.worker_submit_change_request(uuid, text, text, uuid, jsonb) to anon;

-- ── Worker: list own requests ─────────────────────────────────────────────────
create or replace function public.worker_list_change_requests(p_token uuid)
returns table (
  id uuid, kind text, service_request_id uuid, details text,
  requested_changes jsonb, status text, admin_note text,
  created_at timestamptz, resolved_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employee_id uuid;
begin
  v_employee_id := _verify_worker(p_token);
  if v_employee_id is null then
    raise exception 'Unauthorized';
  end if;
  return query
    select r.id, r.kind, r.service_request_id, r.details, r.requested_changes,
           r.status, r.admin_note, r.created_at, r.resolved_at
    from worker_change_requests r
    where r.employee_id = v_employee_id
    order by r.created_at desc;
end;
$$;

revoke all on function public.worker_list_change_requests(uuid) from public;
grant execute on function public.worker_list_change_requests(uuid) to anon;

-- ── Admin: list requests (with worker + job context) ──────────────────────────
create or replace function public.admin_list_change_requests(
  p_token  uuid,
  p_status text default null
)
returns table (
  id uuid, employee_id uuid, employee_name text, kind text,
  service_request_id uuid, customer_name text, service_label text,
  service_date date, desired_return_time time,
  details text, requested_changes jsonb, status text, admin_note text,
  created_at timestamptz, resolved_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not _verify_admin(p_token) then
    raise exception 'Unauthorized';
  end if;
  return query
    select r.id, r.employee_id, e.full_name, r.kind,
           r.service_request_id, sr.customer_name, sr.service_label,
           sr.service_date, sr.desired_return_time,
           r.details, r.requested_changes, r.status, r.admin_note,
           r.created_at, r.resolved_at
    from worker_change_requests r
    left join employees e        on e.id = r.employee_id
    left join service_requests sr on sr.id = r.service_request_id
    where (p_status is null or r.status = p_status)
    order by (r.status = 'pending') desc, r.created_at desc;
end;
$$;

revoke execute on function public.admin_list_change_requests(uuid, text) from public, authenticated;
grant execute on function public.admin_list_change_requests(uuid, text) to anon, service_role;

-- ── Admin: resolve a request (approve / reject / reopen) ───────────────────────
create or replace function public.admin_resolve_change_request(
  p_token      uuid,
  p_request_id uuid,
  p_status     text,
  p_admin_note text default null
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
  if p_status not in ('approved', 'rejected', 'pending') then
    raise exception 'Invalid status';
  end if;
  update worker_change_requests
  set status      = p_status,
      admin_note  = p_admin_note,
      resolved_at = case when p_status = 'pending' then null else now() end
  where id = p_request_id;
end;
$$;

revoke execute on function public.admin_resolve_change_request(uuid, uuid, text, text) from public, authenticated;
grant execute on function public.admin_resolve_change_request(uuid, uuid, text, text) to anon, service_role;

notify pgrst, 'reload schema';

commit;
