-- Canonical booking status model.
-- Operational sub-steps are recorded in notes/photos/payment fields; the request
-- status itself is constrained to the seven customer-facing states.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'booking_status') then
    create type public.booking_status as enum (
      'request_received',
      'accepted',
      'key_received',
      'vehicle_picked_up',
      'in_progress',
      'completed',
      'cancelled'
    );
  end if;
end $$;

create or replace function public.canonical_booking_status(p_status text)
returns public.booking_status
language sql
immutable
as $$
  select case lower(coalesce(p_status, 'request_received'))
    when 'pending' then 'request_received'::public.booking_status
    when 'request_received' then 'request_received'::public.booking_status
    when 'accepted' then 'accepted'::public.booking_status
    when 'key_received' then 'key_received'::public.booking_status
    when 'vehicle_picked_up' then 'vehicle_picked_up'::public.booking_status
    when 'in_progress' then 'in_progress'::public.booking_status
    when 'service_in_progress' then 'in_progress'::public.booking_status
    when 'fueling_in_progress' then 'in_progress'::public.booking_status
    when 'car_wash_in_progress' then 'in_progress'::public.booking_status
    when 'partial_service_complete' then 'in_progress'::public.booking_status
    when 'fueling_complete' then 'in_progress'::public.booking_status
    when 'fuel_receipt_uploaded' then 'in_progress'::public.booking_status
    when 'car_wash_complete' then 'in_progress'::public.booking_status
    when 'wash_receipt_uploaded' then 'in_progress'::public.booking_status
    when 'service_complete' then 'in_progress'::public.booking_status
    when 'receipts_recorded' then 'in_progress'::public.booking_status
    when 'returned_location_pending' then 'in_progress'::public.booking_status
    when 'return_location_recorded' then 'in_progress'::public.booking_status
    when 'return_photos_needed' then 'in_progress'::public.booking_status
    when 'vehicle_returned' then 'in_progress'::public.booking_status
    when 'inspection_needed' then 'in_progress'::public.booking_status
    when 'inspection_recorded' then 'in_progress'::public.booking_status
    when 'final_payment_processed' then 'in_progress'::public.booking_status
    when 'awaiting_key_return' then 'in_progress'::public.booking_status
    when 'keys_returned' then 'completed'::public.booking_status
    when 'complete' then 'completed'::public.booking_status
    when 'completed' then 'completed'::public.booking_status
    when 'finalized' then 'completed'::public.booking_status
    when 'denied' then 'cancelled'::public.booking_status
    when 'customer_canceled' then 'cancelled'::public.booking_status
    when 'canceled' then 'cancelled'::public.booking_status
    when 'cancelled' then 'cancelled'::public.booking_status
    when 'cancelled_pending_key_return' then 'cancelled'::public.booking_status
    when 'unable_to_complete' then 'cancelled'::public.booking_status
    when 'auto_reversed' then 'cancelled'::public.booking_status
    when 'closed_no_charge' then 'cancelled'::public.booking_status
    when 'canceled_return_completed' then 'cancelled'::public.booking_status
    when 'payment_issue' then 'in_progress'::public.booking_status
    when 'authorization_too_low' then 'in_progress'::public.booking_status
    when 'pending_customer_payment' then 'in_progress'::public.booking_status
    else 'request_received'::public.booking_status
  end;
$$;

alter table public.service_requests
  alter column status drop default;

alter table public.service_requests
  alter column status type public.booking_status
  using public.canonical_booking_status(status::text);

alter table public.service_requests
  alter column status set default 'request_received'::public.booking_status;
