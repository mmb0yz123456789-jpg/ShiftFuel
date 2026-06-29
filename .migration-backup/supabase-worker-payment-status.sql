-- ============================================================
-- supabase-worker-payment-status.sql
-- Adds payment_status to worker_update_request so the worker
-- can mark payment as captured when completing a job.
-- Run in Supabase SQL Editor.
-- ============================================================

CREATE OR REPLACE FUNCTION public.worker_update_request(
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

  UPDATE service_requests SET
    status                  = CASE WHEN p_data ? 'status'                  THEN (p_data->>'status')                  ELSE status                  END,
    notes                   = CASE WHEN p_data ? 'notes'                   THEN (p_data->>'notes')                   ELSE notes                   END,
    final_total             = CASE WHEN p_data ? 'final_total'             THEN (p_data->'final_total')::numeric     ELSE final_total             END,
    payment_status          = CASE WHEN p_data ? 'payment_status'          THEN (p_data->>'payment_status')          ELSE payment_status          END,
    return_parking_location = CASE WHEN p_data ? 'return_parking_location' THEN (p_data->>'return_parking_location') ELSE return_parking_location END,
    return_parking_spot     = CASE WHEN p_data ? 'return_parking_spot'     THEN (p_data->>'return_parking_spot')     ELSE return_parking_spot     END,
    return_parking_map_url  = CASE WHEN p_data ? 'return_parking_map_url'  THEN (p_data->>'return_parking_map_url')  ELSE return_parking_map_url  END,
    updated_at              = now()
  WHERE id = p_request_id
    AND assigned_employee_id = v_employee_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.worker_update_request(uuid, uuid, jsonb) TO anon, authenticated;
