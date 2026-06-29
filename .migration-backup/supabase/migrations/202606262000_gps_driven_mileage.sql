-- GPS-verified driven mileage + snapped route for completed jobs.
--
-- Populated server-side at job completion (markRequestComplete in
-- api/payments.js → api/_route-mileage.js) from the request_locations
-- breadcrumb trail via the Mapbox Map Matching API.
--
-- This is PROOF-OF-SERVICE / PAYROLL-AUDIT data only. Worker pay is unchanged:
-- it remains the chosen-station detour (gas_station_extra_miles × rate). These
-- columns just record what the worker actually drove, for verification and a
-- route trail. Additive + nullable, so admin_list_requests (RETURNS SETOF
-- service_requests; SELECT *) surfaces them automatically with no RPC change.

alter table public.service_requests
  add column if not exists driven_miles      numeric,
  add column if not exists driven_route      jsonb,
  add column if not exists driven_matched_at timestamptz;

comment on column public.service_requests.driven_miles is
  'GPS-verified miles the worker actually drove for this job (Mapbox Map Matching). Proof/audit only — NOT the pay basis.';
comment on column public.service_requests.driven_route is
  'GeoJSON LineString of the road-snapped route the worker drove (proof-of-service).';
comment on column public.service_requests.driven_matched_at is
  'When driven_miles/driven_route was computed. Non-null means we already ran Map Matching once for this job.';
