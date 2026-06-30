-- Clean request status model.
-- Status is now a high-level workflow state only:
-- new, assigned, en_route, in_service, returning, completed, cancelled.

create or replace function public.canonical_request_status(p_status text)
returns text
language sql
immutable
as $$
  select case lower(coalesce(p_status, 'new'))
    when 'new' then 'new'
    when 'pending' then 'new'
    when 'request_received' then 'new'
    when 'pending_customer_info' then 'new'

    when 'assigned' then 'assigned'
    when 'accepted' then 'assigned'
    when 'key_received' then 'assigned'

    when 'en_route' then 'en_route'
    when 'vehicle_picked_up' then 'en_route'
    when 'pickup_vehicle_photo_uploaded' then 'en_route'
    when 'pickup_odometer_photo_uploaded' then 'en_route'
    when 'pickup_fuel_gauge_photo_uploaded' then 'en_route'

    when 'in_service' then 'in_service'
    when 'in_progress' then 'in_service'
    when 'service_in_progress' then 'in_service'
    when 'fueling_in_progress' then 'in_service'
    when 'car_wash_in_progress' then 'in_service'
    when 'car_wash_after_fuel_in_progress' then 'in_service'
    when 'fueling_after_wash_in_progress' then 'in_service'
    when 'partial_service_complete' then 'in_service'
    when 'fueling_complete' then 'in_service'
    when 'car_wash_complete' then 'in_service'
    when 'fuel_receipt_uploaded' then 'in_service'
    when 'wash_receipt_uploaded' then 'in_service'
    when 'fuel_receipt_after_wash_uploaded' then 'in_service'
    when 'wash_receipt_after_fuel_uploaded' then 'in_service'
    when 'fuel_and_wash_complete' then 'in_service'
    when 'service_complete' then 'in_service'
    when 'receipts_recorded' then 'in_service'
    when 'inspection_needed' then 'in_service'
    when 'inspection_recorded' then 'in_service'
    when 'payment_issue' then 'in_service'
    when 'authorization_too_low' then 'in_service'
    when 'pending_customer_payment' then 'in_service'

    when 'returning' then 'returning'
    when 'returned_location_pending' then 'returning'
    when 'return_location_recorded' then 'returning'
    when 'return_photos_needed' then 'returning'
    when 'dropoff_vehicle_photo_uploaded' then 'returning'
    when 'dropoff_odometer_photo_uploaded' then 'returning'
    when 'dropoff_fuel_gauge_photo_uploaded' then 'returning'
    when 'vehicle_returned' then 'returning'
    when 'final_payment_processed' then 'returning'
    when 'awaiting_key_return' then 'returning'
    when 'return_requested' then 'returning'
    when 'customer_return_requested' then 'returning'

    when 'completed' then 'completed'
    when 'complete' then 'completed'
    when 'keys_returned' then 'completed'
    when 'finalized' then 'completed'

    when 'cancelled' then 'cancelled'
    when 'canceled' then 'cancelled'
    when 'denied' then 'cancelled'
    when 'customer_canceled' then 'cancelled'
    when 'cancelled_pending_key_return' then 'cancelled'
    when 'unable_to_complete' then 'cancelled'
    when 'auto_reversed' then 'cancelled'
    when 'closed_no_charge' then 'cancelled'
    when 'canceled_return_completed' then 'cancelled'
    else 'new'
  end;
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'booking_status_clean') then
    create type public.booking_status_clean as enum (
      'new',
      'assigned',
      'en_route',
      'in_service',
      'returning',
      'completed',
      'cancelled'
    );
  end if;
end $$;

alter table public.service_requests
  alter column status drop default;

alter table public.service_requests
  alter column status type public.booking_status_clean
  using public.canonical_request_status(status::text)::public.booking_status_clean;

drop function if exists public.canonical_booking_status(text);
drop type if exists public.booking_status;
alter type public.booking_status_clean rename to booking_status;

alter table public.service_requests
  alter column status set default 'new'::public.booking_status;

alter table public.service_requests
  add column if not exists assigned_at timestamptz,
  add column if not exists service_started_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz;

alter table public.service_requests
  drop column if exists request_received_at,
  drop column if exists accepted_at,
  drop column if exists key_received_at,
  drop column if exists vehicle_picked_up_at,
  drop column if exists in_progress_at;

create or replace function public.set_booking_stage_timestamp()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'UPDATE' and new.status is distinct from old.status then
    new.updated_at = now();
  end if;

  case new.status::text
    when 'assigned' then
      new.assigned_at = coalesce(new.assigned_at, now());
    when 'in_service' then
      new.service_started_at = coalesce(new.service_started_at, now());
    when 'completed' then
      new.completed_at = coalesce(new.completed_at, now());
    when 'cancelled' then
      new.cancelled_at = coalesce(new.cancelled_at, now());
    else
      null;
  end case;

  return new;
end;
$$;

drop trigger if exists service_requests_stage_timestamp on public.service_requests;
create trigger service_requests_stage_timestamp
before insert or update of status on public.service_requests
for each row
execute function public.set_booking_stage_timestamp();
