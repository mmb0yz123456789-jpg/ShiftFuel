-- Release a return-time slot as soon as the job is finished, even when that
-- happens before the customer's desired return time.
--
-- The capacity/booking gates treated a request as occupying its return slot all
-- the way through `keys_returned` (the returning flow's terminal "done" state) and
-- the long tail of post-return statuses. So a job the worker had fully finished —
-- car back, keys handed over — kept its return slot locked until the desired
-- return time passed, even though the worker was free again.
--
-- Fix: a finished job no longer consumes capacity. Terminal statuses are released:
--   * book-now flow already ends at `complete` (never in these lists), so it was
--     already freed; this brings the *returning* flow in line by also releasing
--     `keys_returned` (and `complete`/`completed`/`finalized` defensively).
-- `awaiting_key_return` is deliberately kept as occupying: the worker has confirmed
-- totals but the keys are not back yet, so they are not free for the next job.
--
-- Three objects must agree or they contradict each other:
--   1. public_capacity_return_slots  — duration/capacity-aware bookable slots
--   2. public_booked_return_slots    — which slots are already reserved
--   3. one_active_request_per_slot   — unique index preventing double-booking
-- Safe to run more than once.

-- 1. Capacity-aware bookable return slots ------------------------------------
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
    -- Existing bookings are assumed to run the same job length (v1 approximation).
    -- Finished jobs (keys_returned/complete/completed/finalized) are excluded so a
    -- worker who wrapped up early frees the block for the rest of the day.
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
        'final_payment_processed','awaiting_key_return',
        'return_requested','customer_return_requested','payment_issue',
        'authorization_too_low','pending_customer_payment','request_received'
      )
  ),
  candidates as (
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

-- 2. Which return slots are already reserved ---------------------------------
create or replace function public.public_booked_return_slots(p_service_date date)
returns table (
  desired_return_time time,
  status text
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select sr.desired_return_time, sr.status
  from public.service_requests sr
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
      'final_payment_processed','awaiting_key_return',
      'return_requested','customer_return_requested','payment_issue',
      'authorization_too_low','pending_customer_payment'
    );
$$;

grant execute on function public.public_booked_return_slots(date) to anon, authenticated;

-- 3. Unique index that prevents double-booking a live slot --------------------
drop index if exists one_active_request_per_slot;

create unique index one_active_request_per_slot
on public.service_requests (service_date, desired_return_time)
where desired_return_time is not null
  and status in (
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
    'final_payment_processed','awaiting_key_return',
    'return_requested','customer_return_requested','payment_issue',
    'authorization_too_low','pending_customer_payment'
  );
