create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text not null,
  role text not null default 'customer' check (role in ('customer', 'admin')),
  created_at timestamptz not null default now()
);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  make text not null,
  model text not null,
  year integer not null,
  color text not null,
  license_plate text not null,
  fuel_type text not null,
  created_at timestamptz not null default now()
);

create type booking_status as enum (
  'request_received',
  'accepted',
  'key_received',
  'vehicle_picked_up',
  'in_progress',
  'completed',
  'cancelled'
);

create table service_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  hospital text not null,
  parking_location text not null,
  parking_spot text not null,
  parking_map_url text,
  key_handoff_method text not null,
  key_handoff_details text,
  service_type text not null,
  service_label text,
  wash_package text,
  wash_package_label text,
  wash_fee numeric(10, 2) not null default 0,
  wash_convenience_fee numeric(10, 2) not null default 15,
  quick_inspection boolean not null default false,
  quick_inspection_fee numeric(10, 2) not null default 0,
  fuel_convenience_fee numeric(10, 2) not null default 0,
  fuel_type text,
  status booking_status not null default 'request_received',
  service_date date not null,
  desired_return_time time not null,
  estimated_fuel_range text,
  estimated_gallons integer not null default 0,
  price_per_gallon numeric(8, 3),
  estimated_fuel_amount numeric(10, 2) not null default 0,
  service_fee numeric(10, 2) not null,
  detailing_available_window text,
  estimated_total numeric(10, 2) not null,
  final_total numeric(10, 2),
  cancellation_reason text,
  notes text,
  request_received_at timestamptz not null default now(),
  accepted_at timestamptz,
  key_received_at timestamptz,
  vehicle_picked_up_at timestamptz,
  in_progress_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function set_booking_stage_timestamp()
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

create trigger service_requests_stage_timestamp
before insert or update of status on service_requests
for each row
execute function set_booking_stage_timestamp();

create table photos (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references service_requests(id) on delete cascade,
  photo_type text not null,
  image_url text not null,
  created_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references service_requests(id) on delete cascade,
  stripe_payment_id text,
  estimated_amount numeric(10, 2) not null,
  final_amount numeric(10, 2),
  payment_status text not null default 'not_started',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
