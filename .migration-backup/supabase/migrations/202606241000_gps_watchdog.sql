-- GPS watchdog: nudge a worker to reopen the app when their active job stops
-- receiving live GPS pings (app swiped away or backgrounded too long).
--
-- A closed/backgrounded PWA cannot notify itself, so this runs server-side on a
-- schedule (api/gps-watchdog.js, triggered by a free external cron). It finds
-- active jobs whose latest ping is stale, marks them nudged (so the worker is
-- reminded periodically, not spammed), and returns who to push to.
-- Idempotent and safe to re-run.

begin;

-- Debounce: when we last nudged this request's worker. Null = never nudged.
alter table public.service_requests
  add column if not exists gps_last_nudge_at timestamptz;

create or replace function public.gps_watchdog_collect(
  p_stale_seconds   integer default 240,  -- 4 min of silence = app went dark
  p_renudge_seconds integer default 600   -- re-nudge at most every 10 min
)
returns table (
  request_id   uuid,
  employee_id  uuid,
  service_label text,
  customer_name text,
  last_ping_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  with candidates as (
    -- Jobs where GPS is mandatory: assigned, key received, not yet returned.
    -- Mirrors worker-gps-tracking.js ACTIVE_FROM_STATUSES (minus 'accepted',
    -- which is pre-key-pickup so tracking hasn't started).
    select
      sr.id,
      sr.assigned_employee_id,
      sr.service_label,
      sr.customer_name,
      sr.gps_last_nudge_at,
      (
        select max(rl.created_at)
        from public.request_locations rl
        where rl.request_id = sr.id
          and rl.worker_id = sr.assigned_employee_id
      ) as last_ping
    from public.service_requests sr
    where sr.assigned_employee_id is not null
      and sr.status in (
        'key_received',
        'pickup_vehicle_photo_uploaded', 'pickup_odometer_photo_uploaded', 'pickup_fuel_gauge_photo_uploaded',
        'vehicle_picked_up', 'service_in_progress',
        'fueling_in_progress', 'car_wash_in_progress', 'partial_service_complete',
        'fueling_complete', 'car_wash_complete', 'fuel_and_wash_complete',
        'fuel_receipt_uploaded', 'wash_receipt_uploaded',
        'service_complete', 'receipts_recorded',
        'returned_location_pending', 'return_location_recorded', 'return_photos_needed',
        'dropoff_vehicle_photo_uploaded', 'dropoff_odometer_photo_uploaded', 'dropoff_fuel_gauge_photo_uploaded',
        'vehicle_returned', 'inspection_needed', 'inspection_recorded', 'final_payment_processed',
        'awaiting_key_return',
        'pending_customer_payment', 'payment_issue', 'authorization_too_low',
        'cancelled_pending_key_return', 'return_requested', 'customer_return_requested'
      )
  ),
  to_nudge as (
    select c.*
    from candidates c
    where c.last_ping is not null  -- had tracking, then went dark (ignore jobs that never started)
      and c.last_ping < now() - make_interval(secs => p_stale_seconds)
      and (c.gps_last_nudge_at is null
           or c.gps_last_nudge_at < now() - make_interval(secs => p_renudge_seconds))
  ),
  stamped as (
    update public.service_requests sr
    set gps_last_nudge_at = now()
    from to_nudge t
    where sr.id = t.id
    returning t.id, t.assigned_employee_id, t.service_label, t.customer_name, t.last_ping
  )
  select s.id, s.assigned_employee_id, s.service_label, s.customer_name, s.last_ping
  from stamped s;
end;
$$;

-- Server-only (called via the service role from api/gps-watchdog.js). Keep it
-- off the public anon/authenticated surface since it returns customer names.
revoke all on function public.gps_watchdog_collect(integer, integer) from public, anon, authenticated;
grant execute on function public.gps_watchdog_collect(integer, integer) to service_role;

commit;
