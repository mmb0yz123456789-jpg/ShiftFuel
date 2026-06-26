-- Stage 3: duration- and capacity-aware return-time gate.
--
-- public_capacity_return_slots returns the return-time slots that can actually be
-- staffed for a job of a given length on a given date. A slot is bookable when:
--   1. the job's duration block [slot - duration, slot] starts no earlier than the
--      customer's earliest pickup time (when one was given), and
--   2. at least one worker is free for that whole block — i.e. the number of
--      workers on shift covering the block, minus the number of existing
--      slot-holding bookings whose own block overlaps it, is >= 1.
--
-- Workers are treated as a fungible pool: every overlapping booking consumes one
-- unit of capacity regardless of which worker ends up taking it (open, unclaimed
-- requests still count, because someone will). Existing bookings are assumed to
-- run the same p_duration_minutes — a deliberate v1 approximation; per-booking
-- durations can be layered in later via a stored column.
--
-- All time math is done in integer minutes-since-midnight to avoid time/interval
-- wrap-around. Fail-open by design: the booking client falls back to the old
-- availability behaviour if this function is missing or errors.

create or replace function public.public_capacity_return_slots(
  p_service_date date,
  p_duration_minutes int default 60,
  p_pickup_time time default null
)
returns table (slot text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with params as (
    select
      extract(dow from p_service_date)::int as dow,
      greatest(coalesce(p_duration_minutes, 60), 15) as dur,
      case when p_pickup_time is null then null
           else (extract(epoch from p_pickup_time) / 60)::int end as pickup_min
  ),
  active_workers as (
    select e.id
    from employees e
    where e.active = true
      and not exists (
        select 1
        from employee_days_off edo
        where edo.employee_id = e.id
          and edo.day_off = p_service_date
      )
  ),
  worker_windows as (
    select
      (extract(epoch from ea.starts_at) / 60)::int as start_min,
      (extract(epoch from ea.ends_at) / 60)::int as end_min
    from employee_availability ea
    join active_workers aw on aw.id = ea.employee_id
    cross join params p
    where ea.day_of_week = p.dow
  ),
  bookings as (
    -- Existing bookings are assumed to run the same job length (v1 approximation);
    -- a per-booking stored duration can refine this later without touching callers.
    select
      (extract(epoch from sr.desired_return_time) / 60)::int as ret_min,
      p.dur as dur
    from service_requests sr
    cross join params p
    where sr.service_date = p_service_date
      and sr.desired_return_time is not null
      and sr.status in (
        'accepted','key_received','pickup_vehicle_photo_uploaded',
        'pickup_odometer_photo_uploaded','pickup_fuel_gauge_photo_uploaded',
        'vehicle_picked_up','service_in_progress','fueling_in_progress',
        'fueling_complete','fuel_receipt_uploaded','car_wash_in_progress',
        'car_wash_complete','car_wash_after_fuel_in_progress','wash_receipt_uploaded',
        'wash_receipt_after_fuel_uploaded','fueling_after_wash_in_progress',
        'fuel_receipt_after_wash_uploaded','fuel_and_wash_complete','service_complete',
        'receipts_recorded','returned_location_pending','return_location_recorded',
        'return_photos_needed','dropoff_vehicle_photo_uploaded',
        'dropoff_odometer_photo_uploaded','dropoff_fuel_gauge_photo_uploaded',
        'vehicle_returned','inspection_needed','inspection_recorded',
        'final_payment_processed','awaiting_key_return','keys_returned',
        'return_requested','customer_return_requested','payment_issue',
        'authorization_too_low','pending_customer_payment','request_received'
      )
  ),
  candidates as (
    -- every 30 minutes from 07:00 (420) to 22:00 (1320)
    select g as ret_min
    from generate_series(420, 1320, 30) as g
  )
  select to_char(make_time((c.ret_min / 60), (c.ret_min % 60), 0), 'HH24:MI') as slot
  from candidates c
  cross join params p
  where
    (p.pickup_min is null or (c.ret_min - p.dur) >= p.pickup_min)
    and (
      (
        select count(*)
        from worker_windows ww
        where ww.start_min <= (c.ret_min - p.dur)
          and ww.end_min >= c.ret_min
      )
      -
      (
        select count(*)
        from bookings b
        where b.ret_min > (c.ret_min - p.dur)
          and (b.ret_min - b.dur) < c.ret_min
      )
    ) >= 1
  order by slot;
$$;

grant execute on function public.public_capacity_return_slots(date, int, time) to anon, authenticated;
