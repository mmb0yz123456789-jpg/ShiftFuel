-- ─────────────────────────────────────────────────────────────────────────────
-- Worker dashboard visibility/fallback cleanup.
--
-- 1. worker_list_open_requests was missing 'fueling_in_progress',
--    'car_wash_in_progress', 'partial_service_complete',
--    'cancelled_pending_key_return', and 'pending_customer_payment' from its
--    server-side status whitelist (added to the client-side list later but
--    never backported here) — jobs sitting in any of those statuses were
--    silently dropped from the worker's job list even though the client
--    expected to show them. This restores parity with the client list.
-- 2. worker_claim_request did not check employees.active — a worker
--    deactivated mid-shift (session token not yet expired) could still claim
--    new jobs. Added an explicit active check.
-- ─────────────────────────────────────────────────────────────────────────────

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
      'service_in_progress', 'fueling_in_progress', 'car_wash_in_progress',
      'partial_service_complete', 'fueling_complete', 'fuel_receipt_uploaded',
      'car_wash_complete', 'wash_receipt_uploaded', 'service_complete',
      'receipts_recorded', 'returned_location_pending', 'return_location_recorded',
      'return_photos_needed', 'vehicle_returned', 'inspection_needed',
      'inspection_recorded', 'final_payment_processed', 'awaiting_key_return',
      'keys_returned', 'return_requested', 'customer_return_requested',
      'cancelled_pending_key_return', 'payment_issue', 'authorization_too_low',
      'pending_customer_payment'
    )
    ORDER BY service_date ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.worker_list_open_requests(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.worker_claim_request(
  p_token      uuid,
  p_request_id uuid,
  p_data       jsonb
)
RETURNS void
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

  IF NOT EXISTS (SELECT 1 FROM employees WHERE id = v_employee_id AND active = true) THEN
    RAISE EXCEPTION 'Your worker account is not active. Contact an admin.';
  END IF;

  UPDATE service_requests SET
    assigned_employee_id               = v_employee_id,
    assigned_worker_name               = CASE WHEN p_data ? 'assigned_worker_name'               THEN (p_data->>'assigned_worker_name')               ELSE assigned_worker_name               END,
    assigned_worker_phone              = CASE WHEN p_data ? 'assigned_worker_phone'              THEN (p_data->>'assigned_worker_phone')              ELSE assigned_worker_phone              END,
    assigned_worker_photo_url          = CASE WHEN p_data ? 'assigned_worker_photo_url'          THEN (p_data->>'assigned_worker_photo_url')          ELSE assigned_worker_photo_url          END,
    assigned_worker_original_photo_url = CASE WHEN p_data ? 'assigned_worker_original_photo_url' THEN (p_data->>'assigned_worker_original_photo_url') ELSE assigned_worker_original_photo_url END,
    status                             = CASE WHEN p_data ? 'status'                             THEN (p_data->>'status')                             ELSE status                             END,
    updated_at                         = now()
  WHERE id = p_request_id
    AND assigned_employee_id IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.worker_claim_request(uuid, uuid, jsonb) TO anon, authenticated;
