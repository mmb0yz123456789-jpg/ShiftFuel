-- Security fix: worker_upsert_request_location and worker_stop_request_location
-- accept p_token but never verify it, despite being granted to anon. Anyone
-- with the public anon key could spoof a worker's GPS location for any
-- active request, or kill a real worker's live tracking, with zero auth.
--
-- Fix: verify p_token against worker_sessions via the existing _verify_worker
-- helper, and require the verified employee to match p_worker_id so a worker
-- can't spoof a different worker's location either. Signatures are unchanged.

begin;

create or replace function public.worker_upsert_request_location(
  p_token text,
  p_request_id uuid,
  p_worker_id uuid,
  p_latitude double precision,
  p_longitude double precision,
  p_accuracy double precision default null,
  p_heading double precision default null,
  p_speed double precision default null,
  p_created_at timestamptz default now()
)
returns public.request_locations
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.service_requests%rowtype;
  v_worker public.employees_public%rowtype;
  v_row public.request_locations%rowtype;
  v_verified_employee_id uuid;
begin
  select o_employee_id into v_verified_employee_id from public._verify_worker(p_token::uuid);

  if v_verified_employee_id is null then
    raise exception 'Unauthorized';
  end if;

  if v_verified_employee_id <> p_worker_id then
    raise exception 'Unauthorized';
  end if;

  select * into v_request
  from public.service_requests
  where id = p_request_id
  limit 1;

  if not found then
    raise exception 'Request not found';
  end if;

  select * into v_worker
  from public.employees_public
  where id = p_worker_id
  limit 1;

  if not found then
    raise exception 'Worker not found';
  end if;

  if v_request.status in ('complete','completed','finalized','denied','customer_canceled','canceled','cancelled','unable_to_complete','auto_reversed','closed_no_charge','canceled_return_completed') then
    raise exception 'GPS tracking is not allowed for closed requests';
  end if;

  if not (
    v_request.assigned_employee_id = p_worker_id
    or lower(coalesce(v_request.assigned_worker_name, '')) = lower(coalesce(v_worker.full_name, ''))
  ) then
    raise exception 'Worker is not assigned to this request';
  end if;

  update public.request_locations
  set is_active = false
  where request_id = p_request_id
    and worker_id = p_worker_id
    and is_active = true;

  insert into public.request_locations (
    request_id, worker_id, latitude, longitude, accuracy, heading, speed, created_at, is_active
  ) values (
    p_request_id, p_worker_id, p_latitude, p_longitude, p_accuracy, p_heading, p_speed, coalesce(p_created_at, now()), true
  ) returning * into v_row;

  return v_row;
end;
$$;

create or replace function public.worker_stop_request_location(
  p_token text,
  p_request_id uuid,
  p_worker_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_verified_employee_id uuid;
begin
  select o_employee_id into v_verified_employee_id from public._verify_worker(p_token::uuid);

  if v_verified_employee_id is null then
    raise exception 'Unauthorized';
  end if;

  if v_verified_employee_id <> p_worker_id then
    raise exception 'Unauthorized';
  end if;

  update public.request_locations
  set is_active = false
  where request_id = p_request_id
    and worker_id = p_worker_id
    and is_active = true;
end;
$$;

commit;
