-- Optional live GPS tracking for ShiftFuel active requests.
-- Run this in Supabase SQL Editor.
-- The location is the worker phone location, not the vehicle's built-in GPS.

create extension if not exists pgcrypto;

create table if not exists public.request_locations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  -- employees_public may be a view in some deployments, so keep worker_id as uuid and validate it in RPCs.
  worker_id uuid not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy double precision,
  heading double precision,
  speed double precision,
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);

create index if not exists request_locations_request_active_idx
  on public.request_locations (request_id, is_active, created_at desc);

create index if not exists request_locations_worker_active_idx
  on public.request_locations (worker_id, is_active, created_at desc);

alter table public.request_locations enable row level security;

-- Direct anonymous table access stays closed. The app uses the validated RPCs below.
drop policy if exists "request_locations_no_anon_select" on public.request_locations;
create policy "request_locations_no_anon_select"
  on public.request_locations
  for select
  to anon
  using (false);

-- Authenticated/admin sessions may inspect locations if you use Supabase auth later.
drop policy if exists "request_locations_authenticated_read" on public.request_locations;
create policy "request_locations_authenticated_read"
  on public.request_locations
  for select
  to authenticated
  using (true);

-- Try to add the table to Supabase Realtime. If publication already has it, ignore.
do $$
begin
  begin
    alter publication supabase_realtime add table public.request_locations;
  exception
    when duplicate_object then null;
    when undefined_object then null;
  end;
end $$;

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
set search_path = public
as $$
declare
  v_request public.service_requests%rowtype;
  v_worker public.employees_public%rowtype;
  v_row public.request_locations%rowtype;
begin
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
set search_path = public
as $$
begin
  update public.request_locations
  set is_active = false
  where request_id = p_request_id
    and worker_id = p_worker_id
    and is_active = true;
end;
$$;

create or replace function public.public_track_request_location(
  p_request_id text,
  p_phone text default null,
  p_email text default null
)
returns table (
  request_id uuid,
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  heading double precision,
  speed double precision,
  created_at timestamptz,
  is_active boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.service_requests%rowtype;
  v_request_uuid uuid;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  begin
    v_request_uuid := p_request_id::uuid;
  exception when others then
    raise exception 'Invalid request id';
  end;

  select * into v_request
  from public.service_requests
  where id = v_request_uuid
  limit 1;

  if not found then
    return;
  end if;

  -- Customer must prove relationship to this request through phone or email.
  if not (
    (v_phone <> '' and regexp_replace(coalesce(v_request.customer_phone, ''), '\D', '', 'g') = v_phone)
    or (v_email <> '' and lower(coalesce(v_request.customer_email, '')) = v_email)
  ) then
    return;
  end if;

  if v_request.status in ('complete','completed','finalized','denied','customer_canceled','canceled','cancelled','unable_to_complete','auto_reversed','closed_no_charge','canceled_return_completed') then
    return;
  end if;

  return query
  select rl.request_id, rl.latitude, rl.longitude, rl.accuracy, rl.heading, rl.speed, rl.created_at, rl.is_active
  from public.request_locations rl
  where rl.request_id = v_request_uuid
    and rl.is_active = true
    and rl.created_at >= now() - interval '3 minutes'
  order by rl.created_at desc
  limit 1;
end;
$$;

-- Optional cleanup job target: run manually or from a scheduled job.
create or replace function public.cleanup_old_request_locations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.request_locations
  where created_at < now() - interval '72 hours';

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

grant execute on function public.worker_upsert_request_location(text, uuid, uuid, double precision, double precision, double precision, double precision, double precision, timestamptz) to anon, authenticated;
grant execute on function public.worker_stop_request_location(text, uuid, uuid) to anon, authenticated;
grant execute on function public.public_track_request_location(text, text, text) to anon, authenticated;
grant execute on function public.cleanup_old_request_locations() to authenticated;
