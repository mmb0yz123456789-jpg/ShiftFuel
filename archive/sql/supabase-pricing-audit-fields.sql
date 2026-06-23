-- ============================================================
-- supabase-pricing-audit-fields.sql
-- ShiftFuel — internal pricing/payment-recovery audit trail
--
-- Run in the Supabase SQL Editor after supabase-production-rls-lockdown.sql.
-- Safe to re-run (idempotent).
--
-- The customer-facing total (estimated_total / final_total) and the
-- already-displayed fuel_convenience_fee / wash_convenience_fee columns
-- already store the correct grossed-up numbers. These new columns let
-- admin see the breakdown behind those numbers — base fee vs. payment/
-- operating recovery vs. rounding — without exposing any of it to the
-- customer. `captured_amount` already exists (added by
-- supabase-cancellation-return.sql); `estimated_fuel_amount` already
-- exists (added by supabase-schema.sql).
-- ============================================================

alter table service_requests
  add column if not exists base_fuel_service_fee numeric,
  add column if not exists base_car_wash_service_fee numeric,
  add column if not exists base_inspection_fee numeric,
  add column if not exists payment_operating_recovery_amount numeric,
  add column if not exists displayed_fuel_service_fee numeric,
  add column if not exists displayed_car_wash_service_fee numeric,
  add column if not exists displayed_inspection_fee numeric,
  add column if not exists actual_fuel_receipt_amount numeric,
  add column if not exists actual_car_wash_receipt_amount numeric,
  add column if not exists net_target_amount numeric,
  add column if not exists gross_total_before_rounding numeric,
  add column if not exists rounded_customer_total numeric,
  add column if not exists authorized_amount numeric;


-- ── Extend admin_update_request / worker_update_request to accept these ────
-- (CREATE OR REPLACE — re-declares the full function, identical to the
-- current version plus the new CASE WHEN branches below.)

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
    base_fuel_service_fee              = CASE WHEN p_data ? 'base_fuel_service_fee'              THEN (p_data->'base_fuel_service_fee')::numeric            ELSE base_fuel_service_fee              END,
    base_car_wash_service_fee          = CASE WHEN p_data ? 'base_car_wash_service_fee'          THEN (p_data->'base_car_wash_service_fee')::numeric        ELSE base_car_wash_service_fee          END,
    base_inspection_fee                = CASE WHEN p_data ? 'base_inspection_fee'                THEN (p_data->'base_inspection_fee')::numeric              ELSE base_inspection_fee                END,
    payment_operating_recovery_amount  = CASE WHEN p_data ? 'payment_operating_recovery_amount'  THEN (p_data->'payment_operating_recovery_amount')::numeric ELSE payment_operating_recovery_amount  END,
    displayed_fuel_service_fee         = CASE WHEN p_data ? 'displayed_fuel_service_fee'         THEN (p_data->'displayed_fuel_service_fee')::numeric       ELSE displayed_fuel_service_fee         END,
    displayed_car_wash_service_fee     = CASE WHEN p_data ? 'displayed_car_wash_service_fee'     THEN (p_data->'displayed_car_wash_service_fee')::numeric   ELSE displayed_car_wash_service_fee     END,
    displayed_inspection_fee           = CASE WHEN p_data ? 'displayed_inspection_fee'           THEN (p_data->'displayed_inspection_fee')::numeric         ELSE displayed_inspection_fee           END,
    actual_fuel_receipt_amount         = CASE WHEN p_data ? 'actual_fuel_receipt_amount'         THEN (p_data->'actual_fuel_receipt_amount')::numeric       ELSE actual_fuel_receipt_amount         END,
    actual_car_wash_receipt_amount     = CASE WHEN p_data ? 'actual_car_wash_receipt_amount'     THEN (p_data->'actual_car_wash_receipt_amount')::numeric   ELSE actual_car_wash_receipt_amount     END,
    net_target_amount                  = CASE WHEN p_data ? 'net_target_amount'                  THEN (p_data->'net_target_amount')::numeric                ELSE net_target_amount                  END,
    gross_total_before_rounding        = CASE WHEN p_data ? 'gross_total_before_rounding'        THEN (p_data->'gross_total_before_rounding')::numeric      ELSE gross_total_before_rounding        END,
    rounded_customer_total             = CASE WHEN p_data ? 'rounded_customer_total'             THEN (p_data->'rounded_customer_total')::numeric           ELSE rounded_customer_total             END,
    authorized_amount                  = CASE WHEN p_data ? 'authorized_amount'                  THEN (p_data->'authorized_amount')::numeric                ELSE authorized_amount                  END,
    updated_at                         = now()
  WHERE id = p_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_request(uuid, uuid, jsonb) TO anon, authenticated;


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
    status                             = CASE WHEN p_data ? 'status'                             THEN (p_data->>'status')                  ELSE status                             END,
    notes                              = CASE WHEN p_data ? 'notes'                              THEN (p_data->>'notes')                   ELSE notes                              END,
    final_total                        = CASE WHEN p_data ? 'final_total'                        THEN (p_data->'final_total')::numeric     ELSE final_total                        END,
    payment_status                     = CASE WHEN p_data ? 'payment_status'                     THEN (p_data->>'payment_status')          ELSE payment_status                     END,
    return_parking_location            = CASE WHEN p_data ? 'return_parking_location'            THEN (p_data->>'return_parking_location') ELSE return_parking_location            END,
    return_parking_spot                = CASE WHEN p_data ? 'return_parking_spot'                THEN (p_data->>'return_parking_spot')     ELSE return_parking_spot                END,
    return_parking_map_url             = CASE WHEN p_data ? 'return_parking_map_url'             THEN (p_data->>'return_parking_map_url')  ELSE return_parking_map_url             END,
    base_fuel_service_fee              = CASE WHEN p_data ? 'base_fuel_service_fee'              THEN (p_data->'base_fuel_service_fee')::numeric            ELSE base_fuel_service_fee              END,
    base_car_wash_service_fee          = CASE WHEN p_data ? 'base_car_wash_service_fee'          THEN (p_data->'base_car_wash_service_fee')::numeric        ELSE base_car_wash_service_fee          END,
    base_inspection_fee                = CASE WHEN p_data ? 'base_inspection_fee'                THEN (p_data->'base_inspection_fee')::numeric              ELSE base_inspection_fee                END,
    payment_operating_recovery_amount  = CASE WHEN p_data ? 'payment_operating_recovery_amount'  THEN (p_data->'payment_operating_recovery_amount')::numeric ELSE payment_operating_recovery_amount  END,
    displayed_fuel_service_fee         = CASE WHEN p_data ? 'displayed_fuel_service_fee'         THEN (p_data->'displayed_fuel_service_fee')::numeric       ELSE displayed_fuel_service_fee         END,
    displayed_car_wash_service_fee     = CASE WHEN p_data ? 'displayed_car_wash_service_fee'     THEN (p_data->'displayed_car_wash_service_fee')::numeric   ELSE displayed_car_wash_service_fee     END,
    displayed_inspection_fee           = CASE WHEN p_data ? 'displayed_inspection_fee'           THEN (p_data->'displayed_inspection_fee')::numeric         ELSE displayed_inspection_fee           END,
    actual_fuel_receipt_amount         = CASE WHEN p_data ? 'actual_fuel_receipt_amount'         THEN (p_data->'actual_fuel_receipt_amount')::numeric       ELSE actual_fuel_receipt_amount         END,
    actual_car_wash_receipt_amount     = CASE WHEN p_data ? 'actual_car_wash_receipt_amount'     THEN (p_data->'actual_car_wash_receipt_amount')::numeric   ELSE actual_car_wash_receipt_amount     END,
    net_target_amount                  = CASE WHEN p_data ? 'net_target_amount'                  THEN (p_data->'net_target_amount')::numeric                ELSE net_target_amount                  END,
    gross_total_before_rounding        = CASE WHEN p_data ? 'gross_total_before_rounding'        THEN (p_data->'gross_total_before_rounding')::numeric      ELSE gross_total_before_rounding        END,
    rounded_customer_total             = CASE WHEN p_data ? 'rounded_customer_total'             THEN (p_data->'rounded_customer_total')::numeric           ELSE rounded_customer_total             END,
    updated_at                         = now()
  WHERE id = p_request_id
    AND assigned_employee_id = v_employee_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.worker_update_request(uuid, uuid, jsonb) TO anon, authenticated;
