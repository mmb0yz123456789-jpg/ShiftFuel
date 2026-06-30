-- ShiftFuel baseline schema for empty Supabase projects.
--
-- The later files in this directory were originally written as patch migrations
-- against an existing database. This file creates the core objects those patches
-- assume exist so DEV can be built from an empty Supabase project.

begin;

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text,
  email text,
  phone text,
  role text not null default 'customer',
  created_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  make text,
  model text,
  year integer,
  color text,
  license_plate text,
  fuel_type text,
  created_at timestamptz not null default now()
);

create table if not exists public.service_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  customer_name text,
  customer_phone text,
  customer_email text,
  hospital text,
  address_street text,
  address_apt text,
  address_city text,
  address_state text,
  address_zip text,
  address_lat double precision,
  address_lon double precision,
  parking_location text,
  parking_spot text,
  parking_map_url text,
  key_handoff_method text,
  key_handoff_details text,
  service_type text,
  service_label text,
  wash_package text,
  wash_package_label text,
  wash_fee numeric(10,2) not null default 0,
  wash_convenience_fee numeric(10,2) not null default 0,
  quick_inspection boolean not null default false,
  quick_inspection_fee numeric(10,2) not null default 0,
  fuel_convenience_fee numeric(10,2) not null default 0,
  fuel_type text,
  status text not null default 'new',
  service_date date,
  desired_return_time time,
  estimated_fuel_range text,
  estimated_gallons integer not null default 0,
  price_per_gallon numeric(8,3),
  estimated_fuel_amount numeric(10,2) not null default 0,
  service_fee numeric(10,2) not null default 0,
  detailing_available_window text,
  estimated_total numeric(10,2),
  final_total numeric(10,2),
  cancellation_reason text,
  notes text,
  assigned_at timestamptz,
  service_started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  payment_intent_id text,
  payment_status text not null default 'not_started',
  auto_reversed_at timestamptz,
  vehicle_year text,
  vehicle_make text,
  vehicle_model text,
  vehicle_color text,
  license_plate text,
  return_parking_location text,
  assigned_employee_id uuid,
  assigned_worker_name text,
  assigned_worker_phone text,
  assigned_worker_photo_url text,
  assigned_worker_original_photo_url text,
  assigned_worker_photo_zoom numeric(4,2) not null default 1,
  base_fuel_service_fee numeric(10,2),
  base_car_wash_service_fee numeric(10,2),
  base_inspection_fee numeric(10,2),
  payment_operating_recovery_amount numeric(10,2),
  displayed_fuel_service_fee numeric(10,2),
  displayed_car_wash_service_fee numeric(10,2),
  displayed_inspection_fee numeric(10,2),
  actual_fuel_receipt_amount numeric(10,2),
  actual_car_wash_receipt_amount numeric(10,2),
  net_target_amount numeric(10,2),
  gross_total_before_rounding numeric(10,2),
  rounded_customer_total numeric(10,2),
  authorized_amount numeric(10,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid references public.service_requests(id) on delete cascade,
  photo_type text,
  image_url text,
  storage_bucket text default 'service-photos',
  storage_path text,
  expires_at timestamptz default (now() + interval '30 days'),
  created_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text,
  full_name text not null,
  phone text,
  email text,
  active boolean not null default true,
  home_location text,
  photo_url text,
  original_photo_url text,
  cropped_photo_url text,
  photo_zoom numeric(4,2) not null default 1,
  photo_position_x numeric(6,2) not null default 0,
  photo_position_y numeric(6,2) not null default 0,
  started_at date,
  worker_password_hash text,
  worker_password_salt text,
  password_updated_at timestamptz,
  profile_updated_at timestamptz,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'service_requests_assigned_employee_fk'
      and conrelid = 'public.service_requests'::regclass
  ) then
    alter table public.service_requests
      add constraint service_requests_assigned_employee_fk
      foreign key (assigned_employee_id) references public.employees(id) on delete set null;
  end if;
end $$;

create table if not exists public.employee_availability (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  work_location text,
  created_at timestamptz not null default now()
);

create table if not exists public.employee_days_off (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  day_off date not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (employee_id, day_off)
);

create table if not exists public.vehicle_psi_guides (
  id uuid primary key default gen_random_uuid(),
  make text not null,
  model text not null,
  front_psi numeric(5,1) not null,
  rear_psi numeric(5,1) not null,
  source text default 'ShiftFuel PSI guide',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (make, model)
);

create table if not exists public.applicants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  availability text,
  notes text,
  resume_url text,
  resume_storage_path text,
  status text not null default 'new',
  created_at timestamptz not null default now()
);

create table if not exists public.quick_inspections (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid references public.service_requests(id) on delete cascade,
  driver_front_psi_before numeric(5,1),
  driver_front_psi_after numeric(5,1),
  driver_rear_psi_before numeric(5,1),
  driver_rear_psi_after numeric(5,1),
  passenger_front_psi_before numeric(5,1),
  passenger_front_psi_after numeric(5,1),
  passenger_rear_psi_before numeric(5,1),
  passenger_rear_psi_after numeric(5,1),
  trouble_code text,
  trouble_code_summary text,
  possible_fixes text,
  created_at timestamptz not null default now()
);

create table if not exists public.service_reviews (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid references public.service_requests(id) on delete cascade,
  rating integer,
  review_text text,
  created_at timestamptz not null default now()
);

create table if not exists public.saved_service_addresses (
  id uuid primary key default gen_random_uuid(),
  customer_phone text,
  customer_email text,
  address_street text,
  address_apt text,
  address_city text,
  address_state text,
  address_zip text,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.saved_customer_vehicles (
  id uuid primary key default gen_random_uuid(),
  customer_phone text,
  customer_email text,
  vehicle_year text,
  vehicle_make text,
  vehicle_model text,
  vehicle_color text,
  license_plate text,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_vehicle_profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid,
  vehicle_year integer,
  vehicle_make text,
  vehicle_model text,
  vehicle_color text,
  license_plate text,
  license_plate_label text,
  customer_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fuel_price_settings (
  id integer primary key default 1 check (id = 1),
  regular_price numeric(8,3) not null default 3.50,
  midgrade_price numeric(8,3) not null default 3.80,
  premium_price numeric(8,3) not null default 4.10,
  diesel_price numeric(8,3) not null default 4.00,
  service_area_label text,
  last_updated_at timestamptz not null default now(),
  updated_by text
);

insert into public.fuel_price_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.admin_config (
  key text primary key,
  value text not null
);

create table if not exists public.admin_lockout (
  id integer primary key default 1 check (id = 1),
  failed_attempts integer not null default 0,
  locked_until timestamptz
);

insert into public.admin_lockout (id) values (1) on conflict (id) do nothing;

create table if not exists public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '8 hours')
);

create table if not exists public.worker_sessions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '8 hours')
);

create index if not exists worker_sessions_employee_idx
  on public.worker_sessions (employee_id, expires_at);

create table if not exists public.request_locations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.service_requests(id) on delete cascade,
  worker_id uuid not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  accuracy double precision,
  heading double precision,
  speed double precision,
  created_at timestamptz not null default now(),
  is_active boolean not null default true
);

create index if not exists request_locations_request_active_idx
  on public.request_locations (request_id, is_active, created_at desc);

create index if not exists request_locations_worker_active_idx
  on public.request_locations (worker_id, is_active, created_at desc);

alter table public.admin_config enable row level security;
alter table public.admin_lockout enable row level security;
alter table public.admin_sessions enable row level security;
alter table public.worker_sessions enable row level security;
alter table public.employees enable row level security;
alter table public.employee_availability enable row level security;
alter table public.employee_days_off enable row level security;
alter table public.vehicle_psi_guides enable row level security;
alter table public.applicants enable row level security;
alter table public.quick_inspections enable row level security;
alter table public.service_reviews enable row level security;
alter table public.request_locations enable row level security;

create or replace view public.employees_public
with (security_barrier = true)
as
select
  id,
  employee_code,
  full_name,
  phone,
  email,
  active,
  home_location,
  photo_url,
  original_photo_url,
  cropped_photo_url,
  photo_zoom,
  photo_position_x,
  photo_position_y,
  started_at,
  created_at
from public.employees;

grant select on public.employees_public to anon, authenticated;

create or replace function public.clean_phone(value text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select regexp_replace(coalesce(value, ''), '\D', '', 'g');
$$;

create or replace function public._verify_admin(p_token uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.admin_sessions
    where id = p_token and expires_at > now()
  );
$$;

create or replace function public._verify_worker(p_token uuid, out o_employee_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select employee_id
  from public.worker_sessions
  where id = p_token and expires_at > now()
  limit 1;
$$;

revoke execute on function public._verify_admin(uuid) from public, anon, authenticated;
revoke execute on function public._verify_worker(uuid) from public, anon, authenticated;

create or replace function public.public_track_request_location(
  p_request_id text,
  p_phone text default null,
  p_email text default null
)
returns table (
  request_id uuid,
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  heading double precision,
  speed double precision,
  created_at timestamptz,
  is_active boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_request public.service_requests%rowtype;
  v_request_uuid uuid;
  v_phone text := public.clean_phone(p_phone);
  v_email text := lower(trim(coalesce(p_email, '')));
begin
  begin
    v_request_uuid := p_request_id::uuid;
  exception when others then
    return;
  end;

  select * into v_request
  from public.service_requests
  where id = v_request_uuid
  limit 1;

  if not found then
    return;
  end if;

  if not (
    (v_phone <> '' and public.clean_phone(v_request.customer_phone) = v_phone)
    or (v_email <> '' and lower(coalesce(v_request.customer_email, '')) = v_email)
  ) then
    return;
  end if;

  return query
  select rl.request_id, rl.latitude, rl.longitude, rl.accuracy, rl.heading, rl.speed, rl.created_at, rl.is_active
  from public.request_locations rl
  where rl.request_id = v_request_uuid
    and rl.is_active = true
    and rl.created_at >= now() - interval '3 minutes'
  order by rl.created_at desc
  limit 1;
end;
$$;

create or replace function public.cleanup_old_request_locations()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  delete from public.request_locations
  where created_at < now() - interval '72 hours';

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

grant execute on function public.public_track_request_location(text, text, text) to anon, authenticated;
grant execute on function public.cleanup_old_request_locations() to authenticated;

commit;
