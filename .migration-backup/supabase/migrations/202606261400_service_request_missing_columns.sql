-- Add service_requests columns the booking insert sends but that this database is
-- missing. The API fails open (api/create-authorized-booking.js drops unknown
-- columns and retries), so bookings still succeed — but the dropped columns are
-- silently lost. That matters most for the two fuel-gallon columns:
--   * selected_fuel_gallons      — gallons we expect to pump (top of the chosen
--                                  range). The worker's time pay + the Jobs-tab
--                                  time estimate read this (workerJobGallons).
--   * authorization_fuel_gallons — the card-hold buffer gallons.
-- Without these columns the worker code falls back to estimated_gallons (which is
-- the AUTHORIZATION figure), so time pay is computed on the buffer gallons, not the
-- expected ones. The other three are booking metadata (notes still carry
-- special_instructions as a [special_instructions] tag, so that one isn't lost).
--
-- Idempotent: safe to run more than once.

alter table public.service_requests
  add column if not exists address_validation_status  text,
  add column if not exists booking_source             text,
  add column if not exists special_instructions       text,
  add column if not exists selected_fuel_gallons       numeric,
  add column if not exists authorization_fuel_gallons  numeric;

-- PostgREST caches the table schema; the insert error was "Could not find the 'X'
-- column ... in the schema cache". Tell it to reload so the new columns are visible
-- immediately instead of after the next cache refresh.
notify pgrst, 'reload schema';
