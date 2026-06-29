-- Enforce the car-wash return-time cutoff at the data layer.
--
-- The car wash is open 8 AM–7 PM. To guarantee a washed vehicle can be cleaned
-- and returned before close, the latest desired_return_time for any booking
-- that includes a wash is capped at 6:00 PM (1h buffer for the wash + drive
-- back). This mirrors the client-side cap in booking-flow.js and the
-- server-side guard in api/create-authorized-booking.js.
--
-- A single BEFORE INSERT/UPDATE trigger on service_requests enforces this for
-- every write path at once — admin_create_request, customer_complete_booking,
-- and the public Stripe-authorized Node insert — so no RPC can bypass it.
--
-- service_type values that include a wash differ by entry point:
--   public Book Now   → 'wash-only', 'car-wash-fuel'
--   returning / admin → 'car-wash',  'car-wash-fuel'
-- so all three wash variants are checked.

begin;

CREATE OR REPLACE FUNCTION public.enforce_wash_return_cutoff()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- On UPDATE, only re-validate when the relevant columns actually change.
  -- This avoids blocking ordinary status updates on any pre-existing rows.
  IF TG_OP = 'UPDATE'
     AND NEW.service_type IS NOT DISTINCT FROM OLD.service_type
     AND NEW.desired_return_time IS NOT DISTINCT FROM OLD.desired_return_time THEN
    RETURN NEW;
  END IF;

  IF NEW.service_type IN ('car-wash', 'car-wash-fuel', 'wash-only')
     AND NEW.desired_return_time IS NOT NULL
     AND NEW.desired_return_time > TIME '18:00' THEN
    RAISE EXCEPTION 'Car wash bookings must be returned by 6:00 PM.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_wash_return_cutoff ON public.service_requests;
CREATE TRIGGER trg_enforce_wash_return_cutoff
  BEFORE INSERT OR UPDATE OF service_type, desired_return_time
  ON public.service_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_wash_return_cutoff();

commit;
