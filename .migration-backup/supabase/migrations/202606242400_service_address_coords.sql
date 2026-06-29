-- Persist the customer's service-address coordinates on the request so the
-- worker route map (and a future customer ETA) have a fixed destination to route
-- to. The booking flow already sends address_lat/address_lon; this just stores
-- them. Nullable + additive: older rows / pre-migration bookings stay null and
-- the map falls back to geocoding the address text.

begin;

alter table public.service_requests
  add column if not exists address_lat numeric,
  add column if not exists address_lon numeric;

commit;
