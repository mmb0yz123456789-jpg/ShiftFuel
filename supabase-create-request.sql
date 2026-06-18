-- ─────────────────────────────────────────────────────────────────────────────
-- Admin: create a service request without collecting payment at creation time
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION admin_create_request(
  p_token TEXT,
  p_data  JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_employee_id UUID;
  v_row         service_requests%ROWTYPE;
  v_hospital    TEXT;
BEGIN
  SELECT employee_id INTO v_employee_id
    FROM admin_sessions
   WHERE token = p_token AND expires_at > NOW();
  IF v_employee_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Build hospital / full-address field for legacy compatibility
  v_hospital := NULLIF(TRIM(CONCAT_WS(', ',
    NULLIF(p_data->>'address_street', ''),
    NULLIF(p_data->>'address_city',   ''),
    NULLIF(p_data->>'address_state',  ''),
    NULLIF(p_data->>'address_zip',    '')
  )), '');
  IF v_hospital IS NULL THEN
    v_hospital := NULLIF(p_data->>'address_street', '');
  END IF;

  INSERT INTO service_requests (
    customer_name,
    customer_phone,
    customer_email,
    hospital,
    address_street,
    address_apt,
    address_city,
    address_state,
    address_zip,
    parking_location,
    key_handoff_details,
    service_type,
    service_label,
    service_date,
    desired_return_time,
    vehicle_year,
    vehicle_make,
    vehicle_model,
    vehicle_color,
    license_plate,
    estimated_total,
    notes,
    status,
    payment_status
  ) VALUES (
    NULLIF(p_data->>'customer_name',        ''),
    NULLIF(p_data->>'customer_phone',       ''),
    NULLIF(p_data->>'customer_email',       ''),
    v_hospital,
    NULLIF(p_data->>'address_street',       ''),
    NULLIF(p_data->>'address_apt',          ''),
    NULLIF(p_data->>'address_city',         ''),
    NULLIF(p_data->>'address_state',        ''),
    NULLIF(p_data->>'address_zip',          ''),
    NULLIF(p_data->>'parking_location',     ''),
    NULLIF(p_data->>'key_handoff_details',  ''),
    NULLIF(p_data->>'service_type',         ''),
    NULLIF(p_data->>'service_label',        ''),
    CASE WHEN (p_data->>'service_date') NOT IN ('', 'null') AND p_data->>'service_date' IS NOT NULL
         THEN (p_data->>'service_date')::date ELSE NULL END,
    CASE WHEN (p_data->>'desired_return_time') NOT IN ('', 'null') AND p_data->>'desired_return_time' IS NOT NULL
         THEN (p_data->>'desired_return_time')::time ELSE NULL END,
    NULLIF(p_data->>'vehicle_year',         ''),
    NULLIF(p_data->>'vehicle_make',         ''),
    NULLIF(p_data->>'vehicle_model',        ''),
    NULLIF(p_data->>'vehicle_color',        ''),
    NULLIF(p_data->>'license_plate',        ''),
    CASE WHEN (p_data->>'estimated_total') NOT IN ('', 'null') AND p_data->>'estimated_total' IS NOT NULL
         THEN (p_data->>'estimated_total')::numeric ELSE NULL END,
    NULLIF(p_data->>'notes',               ''),
    'pending_customer_info',
    'not_started'
  )
  RETURNING * INTO v_row;

  RETURN row_to_json(v_row)::jsonb;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Customer: complete an admin-created booking by adding vehicle + payment info
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION customer_complete_booking(
  p_request_id          UUID,
  p_phone               TEXT,
  p_email               TEXT,
  p_vehicle_year        TEXT,
  p_vehicle_make        TEXT,
  p_vehicle_model       TEXT,
  p_vehicle_color       TEXT,
  p_license_plate       TEXT,
  p_payment_intent_id   TEXT    DEFAULT NULL,
  p_service_type        TEXT    DEFAULT NULL,
  p_service_label       TEXT    DEFAULT NULL,
  p_service_date        TEXT    DEFAULT NULL,
  p_desired_return_time TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row service_requests%ROWTYPE;
BEGIN
  -- Verify ownership: phone AND email must both match
  SELECT * INTO v_row
    FROM service_requests
   WHERE id = p_request_id
     AND status = 'pending_customer_info'
     AND regexp_replace(customer_phone, '[^0-9]', '', 'g')
           = regexp_replace(p_phone, '[^0-9]', '', 'g')
     AND lower(customer_email) = lower(p_email);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or contact details do not match';
  END IF;

  UPDATE service_requests SET
    service_type      = COALESCE(NULLIF(p_service_type,  ''), service_type),
    service_label     = COALESCE(NULLIF(p_service_label, ''), service_label),
    service_date      = CASE
                          WHEN p_service_date IS NOT NULL AND p_service_date <> ''
                          THEN p_service_date::date
                          ELSE service_date
                        END,
    desired_return_time = CASE
                          WHEN p_desired_return_time IS NOT NULL AND p_desired_return_time <> ''
                          THEN p_desired_return_time::time
                          ELSE desired_return_time
                        END,
    vehicle_year      = NULLIF(p_vehicle_year,  ''),
    vehicle_make      = NULLIF(p_vehicle_make,  ''),
    vehicle_model     = NULLIF(p_vehicle_model, ''),
    vehicle_color     = NULLIF(p_vehicle_color, ''),
    license_plate     = NULLIF(p_license_plate, ''),
    payment_intent_id = NULLIF(p_payment_intent_id, ''),
    payment_status    = CASE
                          WHEN p_payment_intent_id IS NOT NULL AND p_payment_intent_id <> ''
                          THEN 'authorized'
                          ELSE 'not_started'
                        END,
    status            = 'request_received',
    updated_at        = NOW()
  WHERE id = p_request_id
  RETURNING * INTO v_row;

  RETURN row_to_json(v_row)::jsonb;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- NOTE: if public_track_request RPC filters by status, make sure it includes
-- 'pending_customer_info' so admin-created requests appear on the Track page.
-- Example clause to add: OR status = 'pending_customer_info'
-- ─────────────────────────────────────────────────────────────────────────────
