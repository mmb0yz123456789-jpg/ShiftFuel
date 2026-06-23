-- ============================================================
-- supabase-auto-reverse.sql
-- Adds auto-reversal tracking to service_requests.
-- Run in Supabase SQL Editor.
-- ============================================================

-- Add auto_reversed_at timestamp column
ALTER TABLE public.service_requests
  ADD COLUMN IF NOT EXISTS auto_reversed_at timestamptz;

-- Extend admin_update_request to support auto_reversed_at
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
    customer_name                      = CASE WHEN p_data ? 'customer_name'                      THEN (p_data->>'customer_name')                           ELSE customer_name                      END,
    customer_phone                     = CASE WHEN p_data ? 'customer_phone'                     THEN (p_data->>'customer_phone')                          ELSE customer_phone                     END,
    customer_email                     = CASE WHEN p_data ? 'customer_email'                     THEN (p_data->>'customer_email')                          ELSE customer_email                     END,
    address_street                     = CASE WHEN p_data ? 'address_street'                     THEN (p_data->>'address_street')                          ELSE address_street                     END,
    address_apt                        = CASE WHEN p_data ? 'address_apt'                        THEN (p_data->>'address_apt')                             ELSE address_apt                        END,
    address_city                       = CASE WHEN p_data ? 'address_city'                       THEN (p_data->>'address_city')                            ELSE address_city                       END,
    address_state                      = CASE WHEN p_data ? 'address_state'                      THEN (p_data->>'address_state')                           ELSE address_state                      END,
    address_zip                        = CASE WHEN p_data ? 'address_zip'                        THEN (p_data->>'address_zip')                             ELSE address_zip                        END,
    parking_location                   = CASE WHEN p_data ? 'parking_location'                   THEN (p_data->>'parking_location')                        ELSE parking_location                   END,
    parking_spot                       = CASE WHEN p_data ? 'parking_spot'                       THEN (p_data->>'parking_spot')                            ELSE parking_spot                       END,
    key_handoff_details                = CASE WHEN p_data ? 'key_handoff_details'                THEN (p_data->>'key_handoff_details')                     ELSE key_handoff_details                END,
    vehicle_year                       = CASE WHEN p_data ? 'vehicle_year'                       THEN (p_data->>'vehicle_year')                            ELSE vehicle_year                       END,
    vehicle_make                       = CASE WHEN p_data ? 'vehicle_make'                       THEN (p_data->>'vehicle_make')                            ELSE vehicle_make                       END,
    vehicle_model                      = CASE WHEN p_data ? 'vehicle_model'                      THEN (p_data->>'vehicle_model')                           ELSE vehicle_model                      END,
    vehicle_color                      = CASE WHEN p_data ? 'vehicle_color'                      THEN (p_data->>'vehicle_color')                           ELSE vehicle_color                      END,
    license_plate                      = CASE WHEN p_data ? 'license_plate'                      THEN (p_data->>'license_plate')                           ELSE license_plate                      END,
    service_date                       = CASE WHEN p_data ? 'service_date'                       THEN (p_data->>'service_date')::date                      ELSE service_date                       END,
    desired_return_time                = CASE WHEN p_data ? 'desired_return_time'                THEN (p_data->>'desired_return_time')                     ELSE desired_return_time                END,
    fuel_type                          = CASE WHEN p_data ? 'fuel_type'                          THEN (p_data->>'fuel_type')                               ELSE fuel_type                          END,
    return_parking_location            = CASE WHEN p_data ? 'return_parking_location'            THEN (p_data->>'return_parking_location')                 ELSE return_parking_location            END,
    estimated_total                    = CASE WHEN p_data ? 'estimated_total'                    THEN (p_data->'estimated_total')::numeric                 ELSE estimated_total                    END,
    final_total                        = CASE WHEN p_data ? 'final_total'                        THEN (p_data->'final_total')::numeric                     ELSE final_total                        END,
    notes                              = CASE WHEN p_data ? 'notes'                              THEN (p_data->>'notes')                                   ELSE notes                              END,
    status                             = CASE WHEN p_data ? 'status'                             THEN (p_data->>'status')                                  ELSE status                             END,
    assigned_employee_id               = CASE WHEN p_data ? 'assigned_employee_id'               THEN (p_data->>'assigned_employee_id')::uuid               ELSE assigned_employee_id               END,
    assigned_worker_name               = CASE WHEN p_data ? 'assigned_worker_name'               THEN (p_data->>'assigned_worker_name')                    ELSE assigned_worker_name               END,
    assigned_worker_phone              = CASE WHEN p_data ? 'assigned_worker_phone'              THEN (p_data->>'assigned_worker_phone')                   ELSE assigned_worker_phone              END,
    assigned_worker_photo_url          = CASE WHEN p_data ? 'assigned_worker_photo_url'          THEN (p_data->>'assigned_worker_photo_url')                ELSE assigned_worker_photo_url          END,
    assigned_worker_original_photo_url = CASE WHEN p_data ? 'assigned_worker_original_photo_url' THEN (p_data->>'assigned_worker_original_photo_url')      ELSE assigned_worker_original_photo_url END,
    payment_intent_id                  = CASE WHEN p_data ? 'payment_intent_id'                  THEN (p_data->>'payment_intent_id')                       ELSE payment_intent_id                  END,
    payment_status                     = CASE WHEN p_data ? 'payment_status'                     THEN (p_data->>'payment_status')                          ELSE payment_status                     END,
    auto_reversed_at                   = CASE WHEN p_data ? 'auto_reversed_at'                   THEN (p_data->>'auto_reversed_at')::timestamptz           ELSE auto_reversed_at                   END,
    updated_at                         = now()
  WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_request(uuid, uuid, jsonb) TO anon, authenticated;
