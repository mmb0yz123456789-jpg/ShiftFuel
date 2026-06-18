-- ============================================================
-- supabase-request-rpc-fixes.sql
-- Run AFTER supabase-admin-sessions.sql
--
-- 1. Fix _verify_admin / _verify_worker revoke (PUBLIC pseudo-role)
-- 2. Lock down internal-only SECURITY DEFINER functions
-- 3. Drop permissive UPDATE policies on service_reviews and service_requests
-- 4. Add admin_update_request RPC
-- 5. Add worker_claim_request and worker_update_request RPCs
-- 6. Replace worker_update_profile to also sync service_requests
-- ============================================================


-- ── 1. Revoke internal helpers from PUBLIC ──────────────────────────────────
-- The previous supabase-admin-sessions.sql only revoked from anon/authenticated.
-- PostgreSQL also grants EXECUTE to the PUBLIC pseudo-role by default, which is
-- what the Advisor detects. Revoking from PUBLIC covers everything.

REVOKE EXECUTE ON FUNCTION public._verify_admin(uuid)        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._verify_worker(uuid)       FROM PUBLIC;

-- These are cron/internal-only — no role should call them via the REST API.
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_service_photos() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_expired_photo_rows()       FROM PUBLIC, anon, authenticated;


-- ── 2. Drop permissive write policies ───────────────────────────────────────

-- service_reviews: public_submit_service_review RPC handles all writes.
DROP POLICY IF EXISTS "Anyone can update service reviews" ON public.service_reviews;

-- service_requests: all writes now go through admin_update_request,
-- worker_claim_request, or worker_update_request RPCs.
DROP POLICY IF EXISTS "Anyone can update service requests" ON public.service_requests;


-- ── 3. admin_update_request ─────────────────────────────────────────────────
-- Allows an authenticated admin session to update any field on any
-- service_request row.  updated_at is always set server-side.

CREATE OR REPLACE FUNCTION public.admin_update_request(
  p_token      uuid,
  p_request_id uuid,
  p_data       jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT _verify_admin(p_token) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE service_requests SET
    customer_name                    = CASE WHEN p_data ? 'customer_name'                    THEN (p_data->>'customer_name')                           ELSE customer_name                    END,
    customer_phone                   = CASE WHEN p_data ? 'customer_phone'                   THEN (p_data->>'customer_phone')                          ELSE customer_phone                   END,
    customer_email                   = CASE WHEN p_data ? 'customer_email'                   THEN (p_data->>'customer_email')                          ELSE customer_email                   END,
    address_street                   = CASE WHEN p_data ? 'address_street'                   THEN (p_data->>'address_street')                          ELSE address_street                   END,
    address_apt                      = CASE WHEN p_data ? 'address_apt'                      THEN (p_data->>'address_apt')                             ELSE address_apt                      END,
    address_city                     = CASE WHEN p_data ? 'address_city'                     THEN (p_data->>'address_city')                            ELSE address_city                     END,
    address_state                    = CASE WHEN p_data ? 'address_state'                    THEN (p_data->>'address_state')                           ELSE address_state                    END,
    address_zip                      = CASE WHEN p_data ? 'address_zip'                      THEN (p_data->>'address_zip')                             ELSE address_zip                      END,
    parking_location                 = CASE WHEN p_data ? 'parking_location'                 THEN (p_data->>'parking_location')                        ELSE parking_location                 END,
    parking_spot                     = CASE WHEN p_data ? 'parking_spot'                     THEN (p_data->>'parking_spot')                            ELSE parking_spot                     END,
    key_handoff_details              = CASE WHEN p_data ? 'key_handoff_details'              THEN (p_data->>'key_handoff_details')                     ELSE key_handoff_details              END,
    vehicle_year                     = CASE WHEN p_data ? 'vehicle_year'                     THEN (p_data->>'vehicle_year')                            ELSE vehicle_year                     END,
    vehicle_make                     = CASE WHEN p_data ? 'vehicle_make'                     THEN (p_data->>'vehicle_make')                            ELSE vehicle_make                     END,
    vehicle_model                    = CASE WHEN p_data ? 'vehicle_model'                    THEN (p_data->>'vehicle_model')                           ELSE vehicle_model                    END,
    vehicle_color                    = CASE WHEN p_data ? 'vehicle_color'                    THEN (p_data->>'vehicle_color')                           ELSE vehicle_color                    END,
    license_plate                    = CASE WHEN p_data ? 'license_plate'                    THEN (p_data->>'license_plate')                           ELSE license_plate                    END,
    service_date                     = CASE WHEN p_data ? 'service_date'                     THEN (p_data->>'service_date')::date                      ELSE service_date                     END,
    desired_return_time              = CASE WHEN p_data ? 'desired_return_time'              THEN (p_data->>'desired_return_time')::time               ELSE desired_return_time              END,
    fuel_type                        = CASE WHEN p_data ? 'fuel_type'                        THEN (p_data->>'fuel_type')                               ELSE fuel_type                        END,
    return_parking_location          = CASE WHEN p_data ? 'return_parking_location'          THEN (p_data->>'return_parking_location')                 ELSE return_parking_location          END,
    estimated_total                  = CASE WHEN p_data ? 'estimated_total'                  THEN (p_data->'estimated_total')::numeric                 ELSE estimated_total                  END,
    final_total                      = CASE WHEN p_data ? 'final_total'                      THEN (p_data->'final_total')::numeric                     ELSE final_total                      END,
    notes                            = CASE WHEN p_data ? 'notes'                            THEN (p_data->>'notes')                                   ELSE notes                            END,
    status                           = CASE WHEN p_data ? 'status'                           THEN (p_data->>'status')                                  ELSE status                           END,
    assigned_employee_id             = CASE WHEN p_data ? 'assigned_employee_id'             THEN (p_data->>'assigned_employee_id')::uuid               ELSE assigned_employee_id             END,
    assigned_worker_name             = CASE WHEN p_data ? 'assigned_worker_name'             THEN (p_data->>'assigned_worker_name')                    ELSE assigned_worker_name             END,
    assigned_worker_phone            = CASE WHEN p_data ? 'assigned_worker_phone'            THEN (p_data->>'assigned_worker_phone')                   ELSE assigned_worker_phone            END,
    assigned_worker_photo_url        = CASE WHEN p_data ? 'assigned_worker_photo_url'        THEN (p_data->>'assigned_worker_photo_url')                ELSE assigned_worker_photo_url        END,
    assigned_worker_original_photo_url = CASE WHEN p_data ? 'assigned_worker_original_photo_url' THEN (p_data->>'assigned_worker_original_photo_url') ELSE assigned_worker_original_photo_url END,
    updated_at                       = now()
  WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_request(uuid, uuid, jsonb) TO anon, authenticated;


-- ── 4. worker_claim_request ─────────────────────────────────────────────────
-- Atomically assigns the verified worker to a request that is currently
-- unassigned.  Fails silently if another worker claimed it first.

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


-- ── 5. worker_update_request ────────────────────────────────────────────────
-- Allows a worker to update only rows currently assigned to them.
-- Workers can update operational fields (status, notes, totals, return
-- location) but cannot reassign or alter customer/vehicle identity fields.

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
    return_parking_location = CASE WHEN p_data ? 'return_parking_location' THEN (p_data->>'return_parking_location') ELSE return_parking_location END,
    return_parking_spot     = CASE WHEN p_data ? 'return_parking_spot'     THEN (p_data->>'return_parking_spot')     ELSE return_parking_spot     END,
    return_parking_map_url  = CASE WHEN p_data ? 'return_parking_map_url'  THEN (p_data->>'return_parking_map_url')  ELSE return_parking_map_url  END,
    updated_at              = now()
  WHERE id = p_request_id
    AND assigned_employee_id = v_employee_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.worker_update_request(uuid, uuid, jsonb) TO anon, authenticated;


-- ── 6. worker_update_profile (replace) ──────────────────────────────────────
-- Same employee update as before, plus syncs assigned worker display fields
-- on any service_requests currently assigned to the worker.

CREATE OR REPLACE FUNCTION public.worker_update_profile(
  p_token uuid,
  p_data  jsonb
)
RETURNS SETOF employees
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employee_id uuid;
  v_updated     employees%ROWTYPE;
BEGIN
  v_employee_id := _verify_worker(p_token);
  IF v_employee_id IS NULL THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  UPDATE employees SET
    full_name          = CASE WHEN p_data ? 'full_name'          THEN (p_data->>'full_name')                 ELSE full_name          END,
    phone              = CASE WHEN p_data ? 'phone'              THEN (p_data->>'phone')                     ELSE phone              END,
    home_location      = CASE WHEN p_data ? 'home_location'      THEN (p_data->>'home_location')             ELSE home_location      END,
    photo_url          = CASE WHEN p_data ? 'photo_url'          THEN (p_data->>'photo_url')                 ELSE photo_url          END,
    original_photo_url = CASE WHEN p_data ? 'original_photo_url' THEN (p_data->>'original_photo_url')        ELSE original_photo_url END,
    cropped_photo_url  = CASE WHEN p_data ? 'cropped_photo_url'  THEN (p_data->>'cropped_photo_url')         ELSE cropped_photo_url  END,
    photo_zoom         = CASE WHEN p_data ? 'photo_zoom'         THEN (p_data->>'photo_zoom')::numeric       ELSE photo_zoom         END,
    photo_position_x   = CASE WHEN p_data ? 'photo_position_x'   THEN (p_data->>'photo_position_x')::numeric ELSE photo_position_x   END,
    photo_position_y   = CASE WHEN p_data ? 'photo_position_y'   THEN (p_data->>'photo_position_y')::numeric ELSE photo_position_y   END,
    profile_updated_at = now()
  WHERE id = v_employee_id
  RETURNING * INTO v_updated;

  -- Sync display fields on any open requests assigned to this worker.
  UPDATE service_requests SET
    assigned_worker_name               = v_updated.full_name,
    assigned_worker_phone              = v_updated.phone,
    assigned_worker_photo_url          = COALESCE(v_updated.cropped_photo_url, v_updated.photo_url),
    assigned_worker_original_photo_url = v_updated.original_photo_url,
    updated_at                         = now()
  WHERE assigned_employee_id = v_employee_id;

  RETURN NEXT v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.worker_update_profile(uuid, jsonb) TO anon, authenticated;
