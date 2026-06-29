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
  v_session_id  UUID;
  v_row         service_requests%ROWTYPE;
  v_hospital    TEXT;
BEGIN
  SELECT id INTO v_session_id
    FROM admin_sessions
   WHERE id = p_token::uuid AND expires_at > NOW();
  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Build hospital / full-address field (NOT NULL column, legacy compatibility)
  v_hospital := NULLIF(TRIM(CONCAT_WS(', ',
    NULLIF(p_data->>'address_street', ''),
    NULLIF(p_data->>'address_city',   ''),
    NULLIF(p_data->>'address_state',  ''),
    NULLIF(p_data->>'address_zip',    '')
  )), '');
  IF v_hospital IS NULL THEN
    v_hospital := COALESCE(NULLIF(p_data->>'address_street', ''), 'Not provided');
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
    parking_spot,
    key_handoff_details,
    service_type,
    service_label,
    service_date,
    desired_return_time,
    fuel_type,
    estimated_gallons,
    price_per_gallon,
    estimated_fuel_amount,
    fuel_convenience_fee,
    wash_package,
    wash_package_label,
    wash_fee,
    wash_convenience_fee,
    quick_inspection,
    quick_inspection_fee,
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
    COALESCE(NULLIF(p_data->>'parking_location', ''), ''),
    COALESCE(NULLIF(p_data->>'parking_spot',      ''), ''),
    NULLIF(p_data->>'key_handoff_details',  ''),
    NULLIF(p_data->>'service_type',         ''),
    NULLIF(p_data->>'service_label',        ''),
    CASE WHEN (p_data->>'service_date') NOT IN ('', 'null') AND p_data->>'service_date' IS NOT NULL
         THEN (p_data->>'service_date')::date ELSE NULL END,
    CASE WHEN (p_data->>'desired_return_time') NOT IN ('', 'null') AND p_data->>'desired_return_time' IS NOT NULL
         THEN (p_data->>'desired_return_time')::time ELSE NULL END,
    NULLIF(p_data->>'fuel_type', ''),
    CASE WHEN (p_data->>'estimated_gallons') NOT IN ('', 'null') AND p_data->>'estimated_gallons' IS NOT NULL
         THEN (p_data->>'estimated_gallons')::int ELSE 0 END,
    CASE WHEN (p_data->>'price_per_gallon') NOT IN ('', 'null') AND p_data->>'price_per_gallon' IS NOT NULL
         THEN (p_data->>'price_per_gallon')::numeric ELSE NULL END,
    CASE WHEN (p_data->>'estimated_fuel_amount') NOT IN ('', 'null') AND p_data->>'estimated_fuel_amount' IS NOT NULL
         THEN (p_data->>'estimated_fuel_amount')::numeric ELSE 0 END,
    CASE WHEN (p_data->>'fuel_convenience_fee') NOT IN ('', 'null') AND p_data->>'fuel_convenience_fee' IS NOT NULL
         THEN (p_data->>'fuel_convenience_fee')::numeric ELSE 0 END,
    NULLIF(p_data->>'wash_package', ''),
    NULLIF(p_data->>'wash_package_label', ''),
    CASE WHEN (p_data->>'wash_fee') NOT IN ('', 'null') AND p_data->>'wash_fee' IS NOT NULL
         THEN (p_data->>'wash_fee')::numeric ELSE 0 END,
    CASE WHEN (p_data->>'wash_convenience_fee') NOT IN ('', 'null') AND p_data->>'wash_convenience_fee' IS NOT NULL
         THEN (p_data->>'wash_convenience_fee')::numeric ELSE 0 END,
    COALESCE((p_data->>'quick_inspection')::boolean, false),
    CASE WHEN (p_data->>'quick_inspection_fee') NOT IN ('', 'null') AND p_data->>'quick_inspection_fee' IS NOT NULL
         THEN (p_data->>'quick_inspection_fee')::numeric ELSE 0 END,
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
  p_desired_return_time TEXT    DEFAULT NULL,
  p_fuel_type           TEXT    DEFAULT NULL,
  p_wash_package        TEXT    DEFAULT NULL,
  p_wash_package_label  TEXT    DEFAULT NULL,
  p_estimated_gallons   INT     DEFAULT NULL,
  p_quick_inspection    BOOLEAN DEFAULT NULL,
  p_quick_inspection_fee NUMERIC DEFAULT NULL,
  p_address_street      TEXT    DEFAULT NULL,
  p_address_apt         TEXT    DEFAULT NULL,
  p_address_city        TEXT    DEFAULT NULL,
  p_address_state       TEXT    DEFAULT NULL,
  p_address_zip         TEXT    DEFAULT NULL,
  p_parking_location    TEXT    DEFAULT NULL,
  p_key_handoff_details TEXT    DEFAULT NULL,
  p_parking_map_url     TEXT    DEFAULT NULL,
  p_wash_fee            NUMERIC DEFAULT NULL,
  p_estimated_total     NUMERIC DEFAULT NULL,
  p_customer_notes      TEXT    DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row      service_requests%ROWTYPE;
  v_hospital TEXT;
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

  -- Rebuild hospital (full address) if street is provided
  IF p_address_street IS NOT NULL AND TRIM(p_address_street) <> '' THEN
    v_hospital := NULLIF(TRIM(CONCAT_WS(', ',
      NULLIF(TRIM(p_address_street), ''),
      NULLIF(TRIM(p_address_city),   ''),
      NULLIF(TRIM(p_address_state),  ''),
      NULLIF(TRIM(p_address_zip),    '')
    )), '');
    IF v_hospital IS NULL THEN v_hospital := TRIM(p_address_street); END IF;
  ELSE
    v_hospital := v_row.hospital;
  END IF;

  UPDATE service_requests SET
    -- Service
    service_type        = COALESCE(NULLIF(p_service_type,  ''), service_type),
    service_label       = COALESCE(NULLIF(p_service_label, ''), service_label),
    service_date        = CASE WHEN p_service_date IS NOT NULL AND p_service_date <> ''
                               THEN p_service_date::date ELSE service_date END,
    desired_return_time = CASE WHEN p_desired_return_time IS NOT NULL AND p_desired_return_time <> ''
                               THEN p_desired_return_time::time ELSE desired_return_time END,
    -- Fuel / wash details
    fuel_type           = COALESCE(NULLIF(p_fuel_type, ''), fuel_type),
    estimated_gallons   = COALESCE(p_estimated_gallons, estimated_gallons),
    wash_package        = CASE WHEN p_wash_package IS NOT NULL THEN NULLIF(p_wash_package, '') ELSE wash_package END,
    wash_package_label  = CASE WHEN p_wash_package_label IS NOT NULL THEN NULLIF(p_wash_package_label, '') ELSE wash_package_label END,
    wash_fee            = COALESCE(p_wash_fee, wash_fee),
    -- Inspection
    quick_inspection    = COALESCE(p_quick_inspection, quick_inspection),
    quick_inspection_fee = COALESCE(p_quick_inspection_fee, quick_inspection_fee),
    -- Pricing
    estimated_total     = COALESCE(p_estimated_total, estimated_total),
    -- Address
    hospital            = v_hospital,
    address_street      = COALESCE(NULLIF(p_address_street, ''), address_street),
    address_apt         = COALESCE(p_address_apt, address_apt),
    address_city        = COALESCE(NULLIF(p_address_city,  ''), address_city),
    address_state       = COALESCE(NULLIF(p_address_state, ''), address_state),
    address_zip         = COALESCE(NULLIF(p_address_zip,   ''), address_zip),
    -- Parking / keys
    parking_location    = COALESCE(NULLIF(p_parking_location,    ''), parking_location),
    key_handoff_details = COALESCE(NULLIF(p_key_handoff_details, ''), key_handoff_details),
    parking_map_url     = CASE WHEN p_parking_map_url IS NOT NULL THEN NULLIF(p_parking_map_url, '') ELSE parking_map_url END,
    -- Vehicle
    vehicle_year        = NULLIF(p_vehicle_year,  ''),
    vehicle_make        = NULLIF(p_vehicle_make,  ''),
    vehicle_model       = NULLIF(p_vehicle_model, ''),
    vehicle_color       = NULLIF(p_vehicle_color, ''),
    license_plate       = NULLIF(p_license_plate, ''),
    -- Notes: append customer note after any existing admin/system notes
    notes               = CASE
                            WHEN p_customer_notes IS NOT NULL AND TRIM(p_customer_notes) <> ''
                            THEN COALESCE(NULLIF(TRIM(notes), '') || E'\n', '') || '[Customer note] ' || TRIM(p_customer_notes)
                            ELSE notes
                          END,
    -- Payment
    payment_intent_id   = NULLIF(p_payment_intent_id, ''),
    payment_status      = CASE WHEN p_payment_intent_id IS NOT NULL AND p_payment_intent_id <> ''
                               THEN 'authorized' ELSE 'not_started' END,
    -- Advance to queue
    status              = 'request_received',
    updated_at          = NOW()
  WHERE id = p_request_id
  RETURNING * INTO v_row;

  RETURN row_to_json(v_row)::jsonb;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Fix public_track_request to return pending_customer_info requests and
-- allow up to 10 results (so a customer with multiple requests sees all of them)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.public_track_request(
  p_request_id uuid DEFAULT NULL,
  p_phone      text DEFAULT '',
  p_email      text DEFAULT ''
)
RETURNS SETOF service_requests
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sr.*
  FROM service_requests sr
  WHERE (
      p_request_id IS NOT NULL
      AND sr.id = p_request_id
      AND (
        public.clean_phone(sr.customer_phone) = public.clean_phone(p_phone)
        OR lower(COALESCE(sr.customer_email, '')) = lower(COALESCE(p_email, ''))
      )
    )
    OR (
      p_request_id IS NULL
      AND public.clean_phone(sr.customer_phone) = public.clean_phone(p_phone)
      AND lower(COALESCE(sr.customer_email, '')) = lower(COALESCE(p_email, ''))
    )
  ORDER BY
    -- pending_customer_info requests float to the top
    CASE WHEN sr.status = 'pending_customer_info' THEN 0 ELSE 1 END,
    sr.created_at DESC
  LIMIT 10;
$$;

GRANT EXECUTE ON FUNCTION public.public_track_request(uuid, text, text) TO anon, authenticated;
