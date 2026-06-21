-- ============================================================
-- supabase-production-rls-lockdown.sql
-- ShiftFuel — production RLS lockdown + unified terminal-status list
--
-- Run in the Supabase SQL Editor AFTER all files in RUN_ORDER.md.
-- Safe to re-run (idempotent — DROP IF EXISTS / CREATE OR REPLACE throughout).
--
-- Sections:
--   1. New SECURITY DEFINER list RPCs (admin_list_requests,
--      worker_list_open_requests, worker_list_my_requests,
--      admin_list_applicants) — these let the admin/worker dashboards keep
--      working without anon ever needing a permissive table-wide SELECT
--      policy on service_requests / applicants.
--   2. admin_update_employee — now cascades name/phone/photo to any open
--      service_requests assigned to that employee (previously admin.js
--      did this with a direct anon UPDATE on service_requests, which
--      depended on a permissive policy we are removing in section 4).
--   3. Accepted-or-later slot status list used by public_booked_return_slots,
--      public_cancel_request, and the one_active_request_per_slot index.
--   4. Drop permissive anon mutation/listing policies now fully superseded
--      by validated RPCs.
-- ============================================================


-- ── 1. List RPCs (replace direct anon table reads in admin.js / worker.js) ──

CREATE OR REPLACE FUNCTION public.admin_list_requests(p_token uuid)
RETURNS SETOF service_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT _verify_admin(p_token) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
    SELECT * FROM service_requests ORDER BY created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_requests(uuid) TO anon, authenticated;

-- Returns every request in an active workflow status, regardless of who it's
-- assigned to. worker.js splits this client-side into "mine" vs "available".
CREATE OR REPLACE FUNCTION public.worker_list_open_requests(p_token uuid)
RETURNS SETOF service_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF _verify_worker(p_token) IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
    SELECT * FROM service_requests
    WHERE status IN (
      'pending', 'request_received', 'accepted', 'key_received', 'vehicle_picked_up',
      'service_in_progress', 'fueling_complete', 'fuel_receipt_uploaded',
      'car_wash_complete', 'wash_receipt_uploaded', 'service_complete',
      'receipts_recorded', 'returned_location_pending', 'return_location_recorded',
      'return_photos_needed', 'vehicle_returned', 'inspection_needed',
      'inspection_recorded', 'final_payment_processed', 'awaiting_key_return',
      'keys_returned', 'return_requested', 'customer_return_requested',
      'payment_issue', 'authorization_too_low'
    )
    ORDER BY service_date ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.worker_list_open_requests(uuid) TO anon, authenticated;

-- Returns only the calling worker's own assigned requests (used for the
-- review-tracking list — does not depend on a client-supplied employee id).
CREATE OR REPLACE FUNCTION public.worker_list_my_requests(p_token uuid)
RETURNS SETOF service_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employee_id uuid;
BEGIN
  v_employee_id := _verify_worker(p_token);
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
    SELECT * FROM service_requests WHERE assigned_employee_id = v_employee_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.worker_list_my_requests(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_applicants(p_token uuid)
RETURNS SETOF applicants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT _verify_admin(p_token) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
    SELECT * FROM applicants ORDER BY created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_applicants(uuid) TO anon, authenticated;


-- ── 2. admin_update_employee — cascade name/phone/photo to open requests ────
-- Previously admin.js did this with a direct anon .update() on
-- service_requests after calling this RPC. That direct write depended on a
-- permissive policy being removed in section 4, so the cascade now happens
-- here instead (this function is SECURITY DEFINER and bypasses RLS safely
-- because it already verified the admin token above).

CREATE OR REPLACE FUNCTION public.admin_update_employee(
  p_token       uuid,
  p_employee_id uuid,
  p_data        jsonb
)
RETURNS SETOF employees
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT _verify_admin(p_token) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  -- Sync availability work_location when home_location changes.
  IF p_data ? 'home_location' THEN
    UPDATE employee_availability
    SET work_location = (p_data->>'home_location')
    WHERE employee_id = p_employee_id;
  END IF;

  RETURN QUERY
  UPDATE employees SET
    full_name           = CASE WHEN p_data ? 'full_name'           THEN (p_data->>'full_name')                    ELSE full_name           END,
    phone               = CASE WHEN p_data ? 'phone'               THEN (p_data->>'phone')                        ELSE phone               END,
    email               = CASE WHEN p_data ? 'email'               THEN (p_data->>'email')                        ELSE email               END,
    home_location       = CASE WHEN p_data ? 'home_location'       THEN (p_data->>'home_location')                ELSE home_location       END,
    started_at          = CASE WHEN p_data ? 'started_at'          THEN (p_data->>'started_at')::date             ELSE started_at          END,
    active              = CASE WHEN p_data ? 'active'              THEN (p_data->>'active')::boolean              ELSE active              END,
    photo_url           = CASE WHEN p_data ? 'photo_url'           THEN (p_data->>'photo_url')                    ELSE photo_url           END,
    original_photo_url  = CASE WHEN p_data ? 'original_photo_url'  THEN (p_data->>'original_photo_url')           ELSE original_photo_url  END,
    cropped_photo_url   = CASE WHEN p_data ? 'cropped_photo_url'   THEN (p_data->>'cropped_photo_url')            ELSE cropped_photo_url   END,
    photo_zoom          = CASE WHEN p_data ? 'photo_zoom'          THEN (p_data->>'photo_zoom')::numeric          ELSE photo_zoom          END,
    photo_position_x    = CASE WHEN p_data ? 'photo_position_x'    THEN (p_data->>'photo_position_x')::numeric    ELSE photo_position_x    END,
    photo_position_y    = CASE WHEN p_data ? 'photo_position_y'    THEN (p_data->>'photo_position_y')::numeric    ELSE photo_position_y    END,
    worker_password_hash= CASE WHEN p_data ? 'worker_password_hash' THEN (p_data->>'worker_password_hash')        ELSE worker_password_hash END,
    worker_password_salt= CASE WHEN p_data ? 'worker_password_salt' THEN (p_data->>'worker_password_salt')        ELSE worker_password_salt END,
    password_updated_at = CASE WHEN p_data ? 'password_updated_at' THEN (p_data->>'password_updated_at')::timestamptz ELSE password_updated_at END,
    profile_updated_at  = CASE WHEN p_data ? 'profile_updated_at'  THEN (p_data->>'profile_updated_at')::timestamptz ELSE profile_updated_at  END
  WHERE id = p_employee_id
  RETURNING *;

  -- Cascade name/phone/photo to any open requests assigned to this employee.
  IF p_data ?| array['full_name', 'phone', 'photo_url', 'original_photo_url', 'cropped_photo_url'] THEN
    UPDATE service_requests SET
      assigned_worker_name               = CASE WHEN p_data ? 'full_name'          THEN (p_data->>'full_name')          ELSE assigned_worker_name               END,
      assigned_worker_phone              = CASE WHEN p_data ? 'phone'              THEN (p_data->>'phone')              ELSE assigned_worker_phone              END,
      assigned_worker_photo_url          = CASE WHEN p_data ? 'cropped_photo_url'  THEN (p_data->>'cropped_photo_url')
                                                 WHEN p_data ? 'photo_url'         THEN (p_data->>'photo_url')          ELSE assigned_worker_photo_url          END,
      assigned_worker_original_photo_url = CASE WHEN p_data ? 'original_photo_url' THEN (p_data->>'original_photo_url') ELSE assigned_worker_original_photo_url END,
      updated_at = now()
    WHERE assigned_employee_id = p_employee_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_employee(uuid, uuid, jsonb) TO anon, authenticated;


-- ── 3. Accepted-or-later slot status list ───────────────────────────────────
-- Return slots are reserved only after admin accepts a request. request_received
-- stays visible to admin but does not block the slot until it becomes accepted.

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
  FROM service_requests sr
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

CREATE OR REPLACE FUNCTION public.public_cancel_request(
  p_request_id uuid,
  p_phone text,
  p_email text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF length(trim(coalesce(p_reason, ''))) = 0 THEN
    RAISE EXCEPTION 'Cancellation reason is required.';
  END IF;

  UPDATE service_requests sr
  SET status = 'customer_canceled',
      cancellation_reason = trim(p_reason),
      canceled_at = now(),
      canceled_by = 'customer',
      payment_status = CASE
        WHEN sr.payment_intent_id IS NULL THEN 'canceled'
        ELSE sr.payment_status
      END,
      updated_at = now()
  WHERE sr.id = p_request_id
    AND public.clean_phone(sr.customer_phone) = public.clean_phone(p_phone)
    AND lower(coalesce(sr.customer_email, '')) = lower(coalesce(p_email, ''))
    AND sr.payment_intent_id IS NULL
    AND sr.status IN ('pending', 'request_received', 'accepted');
END;
$$;

GRANT EXECUTE ON FUNCTION public.public_cancel_request(uuid, text, text, text) TO anon, authenticated;

-- Rebuild the unique booking-slot index so only accepted-or-later requests
-- reserve a return-time slot.
DROP INDEX IF EXISTS one_active_request_per_slot;

CREATE UNIQUE INDEX one_active_request_per_slot
ON service_requests (service_date, desired_return_time)
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


-- ── 4. Drop permissive anon mutation/listing policies ───────────────────────
-- All of the writes these policies used to allow now go through validated
-- RPCs (admin_save_availability, admin_save_days_off, admin_update_applicant,
-- worker_save_availability, worker_save_days_off, worker_update_profile,
-- worker_change_password_secure, admin_update_request, worker_claim_request,
-- worker_update_request). All of the reads these policies used to allow now
-- go through the list RPCs added in section 1 plus the existing
-- public_track_request RPC.

-- employees: writes only through admin_*/worker_* RPCs.
DROP POLICY IF EXISTS "Anyone can save employees" ON employees;

-- employee_availability: writes only through admin_save_availability /
-- worker_save_availability. Read access stays open — needed by the public
-- booking page's availability fallback (script.js) and the worker schedule UI.
DROP POLICY IF EXISTS "Anyone can save employee availability" ON employee_availability;

-- employee_days_off: writes only through admin_save_days_off /
-- worker_save_days_off. Read access stays open for the same reason as above.
DROP POLICY IF EXISTS "Anyone can save employee days off" ON employee_days_off;

-- applicants: public INSERT stays (job application form). Reads and updates
-- now go only through admin_list_applicants / admin_update_applicant.
DROP POLICY IF EXISTS "Anyone can read applicants" ON applicants;
DROP POLICY IF EXISTS "Anyone can update applicants" ON applicants;

-- service_requests: the dangerous one — this previously let any anon caller
-- with the public anon key list every customer's name/phone/email/address/
-- payment_intent_id/payment_status by querying the table directly. Reads now
-- go only through admin_list_requests / worker_list_open_requests /
-- worker_list_my_requests / public_track_request. (The matching UPDATE
-- policy was already removed by supabase-request-rpc-fixes.sql; this just
-- removes the SELECT policy that file missed.)
DROP POLICY IF EXISTS "Anyone can read service requests" ON service_requests;
DROP POLICY IF EXISTS "Anyone can update service requests" ON service_requests;

-- Defensive: in case an older copy of these is still present anywhere.
DROP POLICY IF EXISTS "Anyone can save vehicle psi guides" ON vehicle_psi_guides;
