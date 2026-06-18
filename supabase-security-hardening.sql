-- ShiftFuel security hardening layer.
-- Run this after supabase-schema.sql, supabase-operational-upgrades.sql, and
-- supabase-service-reviews.sql.
--
-- This file adds public RPC functions that verify phone/email/request details
-- before exposing customer tracking data. After the frontend is using these
-- functions, use the policy section near the bottom to remove broad anonymous
-- table access.

create or replace function public.clean_phone(value text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(value, ''), '\D', '', 'g');
$$;

create or replace function public.public_booked_return_slots(p_service_date date)
returns table (
  desired_return_time time,
  status text
)
language sql
security definer
set search_path = public
as $$
  select sr.desired_return_time, sr.status
  from service_requests sr
  where sr.service_date = p_service_date
    and sr.status not in ('denied', 'customer_canceled', 'unable_to_complete', 'complete', 'auto_reversed');
$$;

grant execute on function public.public_booked_return_slots(date) to anon, authenticated;

create or replace function public.public_worker_availability_slots(
  p_service_date date,
  p_hospital text default ''
)
returns table (
  slot text
)
language sql
security definer
set search_path = public
as $$
  with active_workers as (
    select e.id
    from employees e
    where e.active = true
      and (coalesce(p_hospital, '') = '' or e.home_location is null or e.home_location = p_hospital)
      and not exists (
        select 1
        from employee_days_off edo
        where edo.employee_id = e.id
          and edo.day_off = p_service_date
      )
  ),
  worker_windows as (
    select ea.starts_at, ea.ends_at
    from employee_availability ea
    join active_workers aw on aw.id = ea.employee_id
    where ea.day_of_week = extract(dow from p_service_date)::int
      and (coalesce(p_hospital, '') = '' or ea.work_location is null or ea.work_location = p_hospital)
  ),
  slots as (
    select generate_series(
      p_service_date::timestamp,
      p_service_date::timestamp + interval '23 hours 30 minutes',
      interval '30 minutes'
    )::time as slot_time
  )
  select to_char(s.slot_time, 'HH24:MI') as slot
  from slots s
  where exists (
    select 1
    from worker_windows ww
    where s.slot_time >= ww.starts_at
      and s.slot_time <= ww.ends_at
  )
  order by slot;
$$;

grant execute on function public.public_worker_availability_slots(date, text) to anon, authenticated;

create or replace function public.public_returning_customer_lookup(
  p_phone text,
  p_email text
)
returns table (
  id uuid,
  customer_name text,
  customer_phone text,
  customer_email text,
  vehicle_year text,
  vehicle_make text,
  vehicle_model text,
  vehicle_color text,
  license_plate text,
  hospital text,
  parking_location text,
  parking_spot text,
  parking_map_url text,
  key_handoff_method text,
  key_handoff_details text,
  service_type text,
  service_label text,
  fuel_type text,
  wash_package text,
  wash_package_label text,
  service_date date,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select distinct on (
    lower(coalesce(sr.license_plate, '')),
    sr.vehicle_year,
    lower(coalesce(sr.vehicle_make, '')),
    lower(coalesce(sr.vehicle_model, ''))
  )
    sr.id,
    sr.customer_name,
    sr.customer_phone,
    sr.customer_email,
    sr.vehicle_year,
    sr.vehicle_make,
    sr.vehicle_model,
    sr.vehicle_color,
    sr.license_plate,
    sr.hospital,
    sr.parking_location,
    sr.parking_spot,
    sr.parking_map_url,
    sr.key_handoff_method,
    sr.key_handoff_details,
    sr.service_type,
    sr.service_label,
    sr.fuel_type,
    sr.wash_package,
    sr.wash_package_label,
    sr.service_date,
    sr.created_at
  from service_requests sr
  where public.clean_phone(sr.customer_phone) = public.clean_phone(p_phone)
    and lower(coalesce(sr.customer_email, '')) = lower(coalesce(p_email, ''))
    and public.clean_phone(p_phone) <> ''
    and coalesce(p_email, '') <> ''
  order by
    lower(coalesce(sr.license_plate, '')),
    sr.vehicle_year,
    lower(coalesce(sr.vehicle_make, '')),
    lower(coalesce(sr.vehicle_model, '')),
    sr.created_at desc
  limit 5;
$$;

grant execute on function public.public_returning_customer_lookup(text, text) to anon, authenticated;

create or replace function public.public_track_request(
  p_request_id uuid default null,
  p_phone text default '',
  p_email text default ''
)
returns setof service_requests
language sql
security definer
set search_path = public
as $$
  select sr.*
  from service_requests sr
  where (
      p_request_id is not null
      and sr.id = p_request_id
      and (
        public.clean_phone(sr.customer_phone) = public.clean_phone(p_phone)
        or lower(coalesce(sr.customer_email, '')) = lower(coalesce(p_email, ''))
      )
    )
    or (
      p_request_id is null
      and public.clean_phone(sr.customer_phone) = public.clean_phone(p_phone)
      and lower(coalesce(sr.customer_email, '')) = lower(coalesce(p_email, ''))
    )
  order by sr.created_at desc
  limit 1;
$$;

grant execute on function public.public_track_request(uuid, text, text) to anon, authenticated;

create or replace function public.public_request_photos(
  p_request_id uuid,
  p_phone text,
  p_email text
)
returns setof photos
language sql
security definer
set search_path = public
as $$
  select p.*
  from photos p
  join service_requests sr on sr.id = p.service_request_id
  where sr.id = p_request_id
    and public.clean_phone(sr.customer_phone) = public.clean_phone(p_phone)
    and lower(coalesce(sr.customer_email, '')) = lower(coalesce(p_email, ''))
  order by p.created_at asc;
$$;

grant execute on function public.public_request_photos(uuid, text, text) to anon, authenticated;

create or replace function public.public_review_for_request(
  p_request_id uuid,
  p_phone text,
  p_email text
)
returns table (
  id uuid,
  rating integer,
  submitted_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select r.id, r.rating, r.submitted_at
  from service_reviews r
  join service_requests sr on sr.id = r.service_request_id
  where sr.id = p_request_id
    and public.clean_phone(sr.customer_phone) = public.clean_phone(p_phone)
    and lower(coalesce(sr.customer_email, '')) = lower(coalesce(p_email, ''))
  limit 1;
$$;

grant execute on function public.public_review_for_request(uuid, text, text) to anon, authenticated;

create or replace function public.public_submit_service_review(
  p_request_id uuid,
  p_phone text,
  p_email text,
  p_rating integer,
  p_comments text default ''
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  matched service_requests%rowtype;
begin
  if p_rating < 1 or p_rating > 5 then
    raise exception 'Rating must be 1 through 5.';
  end if;

  if p_rating <= 3 and length(trim(coalesce(p_comments, ''))) = 0 then
    raise exception 'Comments are required for ratings of 3 or below.';
  end if;

  select *
  into matched
  from service_requests sr
  where sr.id = p_request_id
    and public.clean_phone(sr.customer_phone) = public.clean_phone(p_phone)
    and lower(coalesce(sr.customer_email, '')) = lower(coalesce(p_email, ''))
    and sr.status = 'complete'
  limit 1;

  if not found then
    raise exception 'Request could not be verified for review.';
  end if;

  insert into service_reviews (
    service_request_id,
    rating,
    comments,
    customer_name,
    customer_phone,
    customer_email
  )
  values (
    matched.id,
    p_rating,
    nullif(trim(coalesce(p_comments, '')), ''),
    matched.customer_name,
    matched.customer_phone,
    matched.customer_email
  )
  on conflict (service_request_id)
  do update set
    rating = excluded.rating,
    comments = excluded.comments,
    submitted_at = now();

  update service_requests
  set review_completed_at = now(),
      updated_at = now()
  where id = matched.id;
end;
$$;

grant execute on function public.public_submit_service_review(uuid, text, text, integer, text) to anon, authenticated;

create or replace function public.public_cancel_request(
  p_request_id uuid,
  p_phone text,
  p_email text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Cancellation reason is required.';
  end if;

  update service_requests sr
  set status = 'customer_canceled',
      cancellation_reason = trim(p_reason),
      updated_at = now()
  where sr.id = p_request_id
    and public.clean_phone(sr.customer_phone) = public.clean_phone(p_phone)
    and lower(coalesce(sr.customer_email, '')) = lower(coalesce(p_email, ''))
    and sr.status not in ('complete', 'denied', 'customer_canceled', 'unable_to_complete');

  if not found then
    raise exception 'Request could not be verified for cancellation.';
  end if;
end;
$$;

grant execute on function public.public_cancel_request(uuid, text, text, text) to anon, authenticated;

-- Policy hardening phase.
-- IMPORTANT: Only uncomment/run this block after the frontend has been deployed
-- with RPC calls above. Admin and worker pages still need a Supabase Auth or
-- server-side API migration before their direct table access can be removed.
--
-- alter table service_requests enable row level security;
-- alter table photos enable row level security;
-- alter table payments enable row level security;
--
-- drop policy if exists "Anyone can read employees" on employees;
-- drop policy if exists "Anyone can save employees" on employees;
-- drop policy if exists "Anyone can save employee availability" on employee_availability;
-- drop policy if exists "Anyone can save employee days off" on employee_days_off;
-- drop policy if exists "Anyone can save vehicle psi guides" on vehicle_psi_guides;
-- drop policy if exists "Anyone can read applicants" on applicants;
-- drop policy if exists "Anyone can update applicants" on applicants;
-- drop policy if exists "Anyone can read service reviews" on service_reviews;
--
-- create policy "Public can create service requests"
-- on service_requests
-- for insert
-- to anon, authenticated
-- with check (true);
--
-- create policy "Public can insert applicants"
-- on applicants
-- for insert
-- to anon, authenticated
-- with check (true);
--
-- create policy "Public can read active employee availability only"
-- on employee_availability
-- for select
-- to anon, authenticated
-- using (true);
--
-- create policy "Public can read employee days off only"
-- on employee_days_off
-- for select
-- to anon, authenticated
-- using (true);
--
-- create policy "Public can read vehicle psi guides"
-- on vehicle_psi_guides
-- for select
-- to anon, authenticated
-- using (true);
