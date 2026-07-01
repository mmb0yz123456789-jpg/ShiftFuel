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
language plpgsql
stable
as $$
declare
  v_has_request_received boolean;
  v_label text;
  v_result public.booking_status;
begin
  select exists (
    select 1
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'booking_status'
      and e.enumlabel = 'request_received'
  )
  into v_has_request_received;

  if v_has_request_received then
    v_label := case lower(coalesce(p_status, 'request_received'))
      when 'pending' then 'request_received'
      when 'request_received' then 'request_received'
      when 'accepted' then 'accepted'
      when 'key_received' then 'key_received'
      when 'vehicle_picked_up' then 'vehicle_picked_up'
      when 'keys_returned' then 'completed'
      when 'complete' then 'completed'
      when 'completed' then 'completed'
      when 'finalized' then 'completed'
      when 'denied' then 'cancelled'
      when 'customer_canceled' then 'cancelled'
      when 'canceled' then 'cancelled'
      when 'cancelled' then 'cancelled'
      when 'cancelled_pending_key_return' then 'cancelled'
      when 'unable_to_complete' then 'cancelled'
      when 'auto_reversed' then 'cancelled'
      when 'closed_no_charge' then 'cancelled'
      when 'canceled_return_completed' then 'cancelled'
      else 'in_progress'
    end;
  else
    v_label := case lower(coalesce(p_status, 'new'))
      when 'accepted' then 'assigned'
      when 'key_received' then 'assigned'
      when 'vehicle_picked_up' then 'en_route'
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
      when 'new' then 'new'
      when 'assigned' then 'assigned'
      when 'en_route' then 'en_route'
      when 'returning' then 'returning'
      when 'request_received' then 'new'
      when 'pending' then 'new'
      else 'in_service'
    end;
  end if;

  execute 'select $1::public.booking_status' using v_label into v_result;
  return v_result;
end;
$$;

alter table public.service_requests
  alter column status drop default;

drop trigger if exists service_requests_stage_timestamp on public.service_requests;

drop index if exists public.one_active_request_per_slot;

do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.service_requests'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format(
      'alter table public.service_requests drop constraint if exists %I',
      v_constraint.conname
    );
  end loop;
end $$;

alter table public.service_requests
  alter column status type public.booking_status
  using public.canonical_booking_status(status::text);

do $$
declare
  v_default text;
begin
  select case when exists (
    select 1
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'booking_status'
      and e.enumlabel = 'request_received'
  )
  then 'request_received'
  else 'new'
  end
  into v_default;

  execute format(
    'alter table public.service_requests alter column status set default %L::public.booking_status',
    v_default
  );
end $$;
