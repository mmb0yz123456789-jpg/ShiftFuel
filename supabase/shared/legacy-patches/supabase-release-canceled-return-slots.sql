-- Reserve return-time slots only after a request is accepted.
-- request_received bookings do not block the slot until admin accepts them.
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
    AND sr.status IN (
      'accepted',
      'key_received',
      'pickup_vehicle_photo_uploaded',
      'pickup_odometer_photo_uploaded',
      'pickup_fuel_gauge_photo_uploaded',
      'vehicle_picked_up',
      'service_in_progress',
      'fueling_in_progress',
      'fueling_complete',
      'fuel_receipt_uploaded',
      'car_wash_in_progress',
      'car_wash_complete',
      'car_wash_after_fuel_in_progress',
      'wash_receipt_uploaded',
      'wash_receipt_after_fuel_uploaded',
      'fueling_after_wash_in_progress',
      'fuel_receipt_after_wash_uploaded',
      'fuel_and_wash_complete',
      'service_complete',
      'receipts_recorded',
      'returned_location_pending',
      'return_location_recorded',
      'return_photos_needed',
      'dropoff_vehicle_photo_uploaded',
      'dropoff_odometer_photo_uploaded',
      'dropoff_fuel_gauge_photo_uploaded',
      'vehicle_returned',
      'inspection_needed',
      'inspection_recorded',
      'final_payment_processed',
      'awaiting_key_return',
      'keys_returned',
      'return_requested',
      'customer_return_requested',
      'payment_issue',
      'authorization_too_low',
      'pending_customer_payment'
    );
$$;

GRANT EXECUTE ON FUNCTION public.public_booked_return_slots(date) TO anon, authenticated;

DROP INDEX IF EXISTS one_active_request_per_slot;

CREATE UNIQUE INDEX one_active_request_per_slot
ON public.service_requests (service_date, desired_return_time)
WHERE desired_return_time IS NOT NULL
  AND status IN (
    'accepted',
    'key_received',
    'pickup_vehicle_photo_uploaded',
    'pickup_odometer_photo_uploaded',
    'pickup_fuel_gauge_photo_uploaded',
    'vehicle_picked_up',
    'service_in_progress',
    'fueling_in_progress',
    'fueling_complete',
    'fuel_receipt_uploaded',
    'car_wash_in_progress',
    'car_wash_complete',
    'car_wash_after_fuel_in_progress',
    'wash_receipt_uploaded',
    'wash_receipt_after_fuel_uploaded',
    'fueling_after_wash_in_progress',
    'fuel_receipt_after_wash_uploaded',
    'fuel_and_wash_complete',
    'service_complete',
    'receipts_recorded',
    'returned_location_pending',
    'return_location_recorded',
    'return_photos_needed',
    'dropoff_vehicle_photo_uploaded',
    'dropoff_odometer_photo_uploaded',
    'dropoff_fuel_gauge_photo_uploaded',
    'vehicle_returned',
    'inspection_needed',
    'inspection_recorded',
    'final_payment_processed',
    'awaiting_key_return',
    'keys_returned',
    'return_requested',
    'customer_return_requested',
    'payment_issue',
    'authorization_too_low',
    'pending_customer_payment'
  );
