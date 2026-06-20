-- Re-open return-time slots for closed/canceled return requests.
-- Safe to run more than once in the Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.public_booked_return_slots(p_service_date date)
RETURNS TABLE (
  desired_return_time time,
  status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT sr.desired_return_time, sr.status
  FROM public.service_requests sr
  WHERE sr.service_date = p_service_date
    AND sr.desired_return_time IS NOT NULL
    AND sr.status NOT IN (
      'complete',
      'denied',
      'customer_canceled',
      'canceled',
      'unable_to_complete',
      'auto_reversed',
      'closed_no_charge',
      'canceled_return_completed'
    );
$$;

GRANT EXECUTE ON FUNCTION public.public_booked_return_slots(date) TO anon, authenticated;

DROP INDEX IF EXISTS one_active_request_per_slot;

CREATE UNIQUE INDEX one_active_request_per_slot
ON public.service_requests (service_date, desired_return_time)
WHERE desired_return_time IS NOT NULL
  AND status NOT IN (
    'complete',
    'denied',
    'customer_canceled',
    'canceled',
    'unable_to_complete',
    'auto_reversed',
    'closed_no_charge',
    'canceled_return_completed'
  );
