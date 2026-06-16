-- Run this in the Supabase SQL editor after the existing schema is installed.
-- Some statements, especially pg_cron and storage.objects cleanup, may require
-- project-owner permissions and enabled extensions.

alter table photos
  add column if not exists storage_bucket text default 'service-photos',
  add column if not exists storage_path text,
  add column if not exists expires_at timestamptz default (now() + interval '30 days');

create index if not exists photos_expires_at_idx on photos (expires_at);

-- Prevent two active requests from taking the same service date and return slot.
create unique index if not exists one_active_request_per_slot
on service_requests (service_date, desired_return_time)
where status not in ('denied', 'customer_canceled', 'unable_to_complete', 'complete');

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text,
  full_name text not null,
  phone text,
  email text,
  active boolean not null default true,
  home_location text,
  photo_url text,
  started_at date,
  profile_updated_at timestamptz,
  created_at timestamptz not null default now()
);

alter table employees
  add column if not exists employee_code text,
  add column if not exists photo_url text,
  add column if not exists started_at date,
  add column if not exists profile_updated_at timestamptz;

update employees
set employee_code = 'EMP-' || upper(substr(replace(id::text, '-', ''), 1, 6))
where employee_code is null;

create unique index if not exists employees_employee_code_unique
on employees (employee_code)
where employee_code is not null;

alter table service_requests
  add column if not exists assigned_employee_id uuid references employees(id),
  add column if not exists assigned_worker_name text,
  add column if not exists assigned_worker_phone text,
  add column if not exists assigned_worker_photo_url text;

insert into employees (employee_code, full_name, active, home_location)
select 'EMP-MARK01', 'Mark Urban', true, 'ChristianaCare - 4755 Ogletown Stanton Rd, Newark, DE 19718'
where not exists (
  select 1 from employees where full_name = 'Mark Urban'
);

insert into employees (employee_code, full_name, active, home_location)
select 'EMP-TEST01', 'Test Worker', true, 'ChristianaCare - 4755 Ogletown Stanton Rd, Newark, DE 19718'
where not exists (
  select 1 from employees where full_name = 'Test Worker'
);

create table if not exists employee_availability (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  work_location text,
  created_at timestamptz not null default now()
);

create table if not exists employee_days_off (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  day_off date not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (employee_id, day_off)
);

alter table employees enable row level security;
alter table employee_availability enable row level security;
alter table employee_days_off enable row level security;

drop policy if exists "Anyone can read employees" on employees;
create policy "Anyone can read employees"
on employees
for select
to anon, authenticated
using (active = true);

drop policy if exists "Anyone can save employees" on employees;
create policy "Anyone can save employees"
on employees
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Anyone can read employee availability" on employee_availability;
create policy "Anyone can read employee availability"
on employee_availability
for select
to anon, authenticated
using (true);

drop policy if exists "Anyone can save employee availability" on employee_availability;
create policy "Anyone can save employee availability"
on employee_availability
for all
to anon, authenticated
using (true)
with check (true);

drop policy if exists "Anyone can read employee days off" on employee_days_off;
create policy "Anyone can read employee days off"
on employee_days_off
for select
to anon, authenticated
using (true);

drop policy if exists "Anyone can save employee days off" on employee_days_off;
create policy "Anyone can save employee days off"
on employee_days_off
for all
to anon, authenticated
using (true)
with check (true);

create table if not exists quick_inspections (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references service_requests(id) on delete cascade,
  driver_front_psi_before numeric(5, 1),
  driver_front_psi_after numeric(5, 1),
  driver_rear_psi_before numeric(5, 1),
  driver_rear_psi_after numeric(5, 1),
  passenger_front_psi_before numeric(5, 1),
  passenger_front_psi_after numeric(5, 1),
  passenger_rear_psi_before numeric(5, 1),
  passenger_rear_psi_after numeric(5, 1),
  trouble_code text,
  trouble_code_summary text,
  possible_fixes text,
  created_at timestamptz not null default now()
);

create table if not exists applicants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  availability text,
  notes text,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

alter table applicants enable row level security;

drop policy if exists "Anyone can submit applicants" on applicants;
create policy "Anyone can submit applicants"
on applicants
for insert
to anon, authenticated
with check (true);

drop policy if exists "Anyone can read applicants" on applicants;
create policy "Anyone can read applicants"
on applicants
for select
to anon, authenticated
using (true);

drop policy if exists "Anyone can update applicants" on applicants;
create policy "Anyone can update applicants"
on applicants
for update
to anon, authenticated
using (true)
with check (true);

-- Optional metadata for returning-customer login/autofill when Supabase Auth is enabled.
create table if not exists customer_vehicle_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null,
  vehicle_year integer,
  vehicle_make text,
  vehicle_model text,
  vehicle_color text,
  license_plate text not null,
  license_plate_label text,
  customer_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Photo retention:
-- 1. Delete expired rows from public.photos.
-- 2. Delete matching files from storage.objects.
-- Supabase Storage cleanup needs elevated permissions. If pg_cron is enabled,
-- schedule this daily from the SQL editor or move the same logic into an Edge
-- Function that uses the service-role key.
create or replace function cleanup_expired_service_photos()
returns void
language plpgsql
security definer
as $$
begin
  delete from storage.objects
  where bucket_id = 'service-photos'
    and name in (
      select storage_path
      from public.photos
      where expires_at < now()
        and storage_path is not null
    );

  delete from public.photos
  where expires_at < now();
end;
$$;

-- Uncomment after enabling pg_cron in Supabase:
-- select cron.schedule(
--   'cleanup-expired-service-photos',
--   '30 3 * * *',
--   $$select cleanup_expired_service_photos();$$
-- );
