-- Stage timestamps for the canonical booking lifecycle.
-- Each column records the first time the request reaches that status.

alter table public.service_requests
  add column if not exists request_received_at timestamptz,
  add column if not exists accepted_at timestamptz,
  add column if not exists key_received_at timestamptz,
  add column if not exists vehicle_picked_up_at timestamptz,
  add column if not exists in_progress_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists cancelled_at timestamptz;

update public.service_requests
set request_received_at = coalesce(request_received_at, created_at, now())
where request_received_at is null;

alter table public.service_requests
  alter column request_received_at set default now(),
  alter column request_received_at set not null;

create or replace function public.set_booking_stage_timestamp()
returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'UPDATE' and new.status is distinct from old.status then
    new.updated_at = now();
  end if;

  case new.status::text
    when 'request_received' then
      new.request_received_at = coalesce(new.request_received_at, now());
    when 'accepted' then
      new.accepted_at = coalesce(new.accepted_at, now());
    when 'key_received' then
      new.key_received_at = coalesce(new.key_received_at, now());
    when 'vehicle_picked_up' then
      new.vehicle_picked_up_at = coalesce(new.vehicle_picked_up_at, now());
    when 'in_progress' then
      new.in_progress_at = coalesce(new.in_progress_at, now());
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
