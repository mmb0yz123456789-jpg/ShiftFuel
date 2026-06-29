-- Capture an optional desired pickup / drop-off time on a service request: the
-- earliest the customer's keys/vehicle are available. It acts as an earliest-
-- start constraint for capacity scheduling (a job's duration block can't begin
-- before it). NULL means the customer is flexible — no early bound, the whole
-- day up to the desired return time is fair game.
--
-- Reads come back automatically through the existing request RPCs (they return
-- the full service_requests row), and the authorized-booking API functions
-- whitelist the column for insert. No RPC changes needed.

alter table public.service_requests
  add column if not exists desired_pickup_time time;

comment on column public.service_requests.desired_pickup_time is
  'Optional earliest pickup/drop-off time (keys/vehicle available). NULL = flexible. Used as an earliest-start bound for capacity scheduling.';
