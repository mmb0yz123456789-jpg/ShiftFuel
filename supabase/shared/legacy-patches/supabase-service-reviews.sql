-- Run this in the Supabase SQL editor to store completed-service reviews.

create table if not exists service_reviews (
  id uuid primary key default gen_random_uuid(),
  service_request_id uuid not null references service_requests(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  comments text,
  customer_name text,
  customer_phone text,
  customer_email text,
  submitted_at timestamptz not null default now(),
  unique (service_request_id)
);

create index if not exists service_reviews_submitted_at_idx
on service_reviews (submitted_at desc);

alter table service_reviews enable row level security;

drop policy if exists "Anyone can submit service reviews" on service_reviews;
create policy "Anyone can submit service reviews"
on service_reviews
for insert
to anon, authenticated
with check (
  rating between 1 and 5
  and service_request_id is not null
);

drop policy if exists "Anyone can read service reviews" on service_reviews;
create policy "Anyone can read service reviews"
on service_reviews
for select
to anon, authenticated
using (true);
