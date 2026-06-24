-- Cancellation / key-return / vehicle-return tracking + denormalized live GPS.
--
-- Additive only: existing cancellation columns (cancellation_fee_amount,
-- cancellation_total_charged, cancellation_requires_key_return, etc.) are kept.
-- These spec-named columns sit alongside them so the customer/worker/admin
-- flows can reason about returns from explicit fields instead of inferring from
-- notes. A canceled request is NOT fully closed until the relevant *_returned_at
-- is set.

begin;

-- ── Key / vehicle return + cancellation audit fields ────────────────────────
alter table public.service_requests
  add column if not exists key_received_at         timestamptz,
  add column if not exists key_return_required      boolean not null default false,
  add column if not exists key_returned_at          timestamptz,
  add column if not exists vehicle_picked_up_at     timestamptz,
  add column if not exists vehicle_return_required  boolean not null default false,
  add column if not exists vehicle_returned_at      timestamptz,
  add column if not exists canceled_at              timestamptz,
  add column if not exists canceled_by              text,
  add column if not exists cancellation_reason      text,
  add column if not exists cancellation_fee         numeric(10,2),
  add column if not exists payment_reversal_amount  numeric(10,2),
  add column if not exists final_charge_amount      numeric(10,2);

-- ── Latest known GPS location, denormalized onto the request ────────────────
-- Full history stays in request_locations; these give a single cheap read for
-- the customer/admin views and a live_tracking_enabled flag for lifecycle.
alter table public.service_requests
  add column if not exists last_latitude          double precision,
  add column if not exists last_longitude         double precision,
  add column if not exists last_location_accuracy double precision,
  add column if not exists last_location_at       timestamptz,
  add column if not exists live_tracking_enabled  boolean not null default false;

-- ── Mirror each GPS upsert onto the request, and flip the tracking flag ─────
-- Same signature/auth as 202606221500; only adds the denormalized write so the
-- latest location and live_tracking_enabled live on service_requests too.
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

  -- Denormalize the latest fix onto the request and mark tracking live.
  update public.service_requests
  set last_latitude = p_latitude,
      last_longitude = p_longitude,
      last_location_accuracy = p_accuracy,
      last_location_at = coalesce(p_created_at, now()),
      live_tracking_enabled = true
  where id = p_request_id;

  return v_row;
end;
$$;

-- Stopping tracking also clears the live flag on the request.
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

  update public.service_requests
  set live_tracking_enabled = false
  where id = p_request_id;
end;
$$;

commit;
