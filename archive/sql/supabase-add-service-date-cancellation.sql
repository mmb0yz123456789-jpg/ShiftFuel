alter table service_requests
  add column if not exists service_date date;

update service_requests
set service_date = current_date
where service_date is null;

alter table service_requests
  alter column service_date set not null;

alter table service_requests
  add column if not exists cancellation_reason text;
