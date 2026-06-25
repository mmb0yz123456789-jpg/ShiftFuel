-- "Customer choice" gas station: persist the station the customer picked plus
-- the distance surcharge ($0.75 per extra round-trip mile beyond the closest
-- station) so workers know where to fuel up and admins can see the upsell.
--
-- All columns are optional/nullable: bookings without a station selection (or
-- on deploys before this migration runs) simply leave them null, and the
-- booking insert's column-retry logic drops them gracefully until applied.

begin;

alter table public.service_requests
  add column if not exists gas_station_name text,
  add column if not exists gas_station_address text,
  add column if not exists gas_station_lat numeric,
  add column if not exists gas_station_lon numeric,
  add column if not exists gas_station_surcharge numeric not null default 0,
  add column if not exists gas_station_extra_miles numeric not null default 0;

commit;
