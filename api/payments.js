/**
 * /api/payments.js
 *
 * Single Vercel Serverless Function that handles all payment operations.
 * The caller must include an `action` field in the POST body to select the handler.
 *
 * Actions (all POST):
 *   create_intent            – Create a manual-capture PaymentIntent for booking authorization
 *   create_authorized_booking – Verify an authorized PaymentIntent and create the service_request row server-side
 *   create_customer_final    – Create an automatic-capture PI for customer final payment (no pre-auth)
 *   customer_capture         – Confirm/capture payment on a pending_customer_payment request
 *   customer_cancel          – Cancel a request (customer-authenticated) and void any hold
 *   worker_capture           – Worker completes job; auto-captures the pre-authorized PI
 *   cancel_payment           – Admin/worker: void an authorized (uncaptured) hold
 *   capture_payment          – Admin: manually capture an authorized PI
 *   refund                   – Admin: refund a captured payment
 *   mark_keys_returned       – Admin/worker: record key hand-back and complete the request
 *   customer_request_return  – Customer: request the vehicle be returned after key receipt (no free cancel)
 *   resolve_return_request   – Admin: waive fee / charge return-service amount / continue service for a return request
 */

const Stripe = require('stripe');
const { setCorsHeaders, getSupabaseAdmin, verifyAdminToken, verifyWorkerToken, verifyAnyStaffToken } = require('./_auth');

// ── Shared helpers ────────────────────────────────────────────────────────────

function cleanPhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured');
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

const RETURN_CANCELLATION_FEE = 15;
const RETURN_RECOVERY_RATE = 0.029;
const RETURN_RECOVERY_FIXED = 0.30;

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function receiptTotalsFromNotes(notes) {
  const matches = Array.from(String(notes || '').matchAll(/\[receipt_totals fuel=([0-9.]+) wash=([0-9.]+)\]/g));
  const latest = matches.at(-1);

  return {
    fuel: latest ? Number(latest[1]) || 0 : 0,
    wash: latest ? Number(latest[2]) || 0 : 0,
  };
}

function savedVehiclePlateKey(value) {
  return String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '');
}

function savedVehicleColorKey(value) {
  return String(value || '').trim().toLowerCase();
}

function savedAddressTextKey(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function savedAddressStateKey(value) {
  return String(value || '').trim().toUpperCase();
}

function savedAddressZipKey(value) {
  return String(value || '').replace(/\D/g, '');
}

function returnRequestChargeFromNotes(notes) {
  const receipts = receiptTotalsFromNotes(notes);
  const subtotal = roundMoney(receipts.fuel + receipts.wash + RETURN_CANCELLATION_FEE);
  const total = subtotal > 0
    ? Math.ceil((subtotal + RETURN_RECOVERY_FIXED) / (1 - RETURN_RECOVERY_RATE))
    : 0;
  const recovery = roundMoney(total - subtotal);

  return {
    fuel: roundMoney(receipts.fuel),
    wash: roundMoney(receipts.wash),
    cancellation_fee: RETURN_CANCELLATION_FEE,
    recovery,
    subtotal,
    total,
    amount_cents: total * 100,
  };
}

function hasCustomerReturnRequestAlert(request) {
  return !!request?.return_requested_at
    || request?.status === 'return_requested'
    || request?.status === 'customer_return_requested'
    || String(request?.notes || '').includes('[customer_return_requested]');
}

async function markRequestComplete(db, requestId, paymentIntentId, capturedAmountDollars = null) {
  const updateData = {
    status: 'awaiting_key_return',
    payment_status: 'captured',
    payment_intent_id: paymentIntentId,
    updated_at: new Date().toISOString(),
  };
  if (capturedAmountDollars != null) updateData.captured_amount = capturedAmountDollars;

  const { error } = await db.from('service_requests').update(updateData).eq('id', requestId);

  if (error) {
    console.error('[payments] markComplete DB error for request', requestId, '—', error.message);
    throw new Error('DB_UPDATE_FAILED');
  }

  // Verify the write landed.
  const { data: verified, error: vErr } = await db
    .from('service_requests')
    .select('id, status, payment_status, payment_intent_id')
    .eq('id', requestId)
    .maybeSingle();

  if (vErr || !verified || verified.status !== 'awaiting_key_return' || verified.payment_status !== 'captured') {
    console.error('[payments] post-write verify failed for request', requestId, JSON.stringify(verified), vErr?.message);
    throw new Error('DB_UPDATE_FAILED');
  }
}

// ── Action handlers ───────────────────────────────────────────────────────────

async function handleCreateIntent(body, res) {
  // Booking authorization — manual capture, no DB involvement here.
  const { amount_cents, customer_name, customer_email, service_label } = body;

  const parsedCents = Math.round(Number(amount_cents));
  if (!parsedCents || parsedCents < 50) {
    return res.status(400).json({ error: 'Amount must be at least $0.50' });
  }
  if (parsedCents > 200000) {
    return res.status(400).json({ error: 'Amount exceeds the maximum allowed for this service' });
  }

  try {
    const stripe = getStripe();
    const pi = await stripe.paymentIntents.create({
      amount: parsedCents,
      currency: 'usd',
      capture_method: 'manual',
      description: service_label || 'ShiftFuel service',
      receipt_email: customer_email || undefined,
      metadata: { customer_name: customer_name || '', service_label: service_label || '' },
    });
    console.log('[payments/create_intent] Created', pi.id, 'amount:', parsedCents);
    return res.status(200).json({ client_secret: pi.client_secret, payment_intent_id: pi.id });
  } catch (err) {
    console.error('[payments/create_intent] Stripe error:', err.message);
    return res.status(500).json({ error: 'Could not initialize payment. Please try again.' });
  }
}

// Customer-submitted booking fields only. Anything not in this list is
// silently dropped — protected fields (status, payment_status,
// payment_intent_id, assigned_*, final_total, etc.) are always set
// server-side below, never taken from the request body.
const ALLOWED_BOOKING_FIELDS = [
  'customer_name', 'customer_phone', 'customer_email',
  'vehicle_year', 'vehicle_make', 'vehicle_model', 'vehicle_color', 'license_plate',
  'hospital', 'address_street', 'address_apt', 'address_city', 'address_state', 'address_zip',
  'parking_location', 'parking_spot', 'parking_map_url', 'key_handoff_details',
  'service_type', 'service_label', 'service_date', 'desired_return_time',
  'fuel_type', 'estimated_fuel_range', 'estimated_gallons', 'price_per_gallon', 'estimated_fuel_amount',
  'fuel_convenience_fee', 'wash_package', 'wash_package_label', 'wash_fee', 'wash_convenience_fee',
  'quick_inspection', 'quick_inspection_fee', 'service_fee', 'detailing_available_window',
  'estimated_total', 'notes',
  // Pricing/payment-recovery audit trail (passive record-keeping — the actual
  // charge is independently verified against Stripe below, never trusted
  // from these fields).
  'base_fuel_service_fee', 'base_car_wash_service_fee', 'base_inspection_fee',
  'payment_operating_recovery_amount', 'displayed_fuel_service_fee',
  'displayed_car_wash_service_fee', 'displayed_inspection_fee',
  'net_target_amount', 'gross_total_before_rounding', 'rounded_customer_total',
  'authorized_amount',
];

const ALLOWED_SERVICE_TYPES = ['fuel', 'car-wash', 'car-wash-fuel', 'fuel-only', 'wash-only'];

async function saveReusableBookingSnapshots(db, row) {
  const customerPhone = row.customer_phone || '';
  const customerEmail = row.customer_email || '';
  if (!cleanPhone(customerPhone) || !String(customerEmail || '').trim()) return;

  const addressPayload = {
    customer_phone: customerPhone,
    customer_email: customerEmail,
    customer_name: row.customer_name || null,
    hospital: row.hospital || null,
    address_street: row.address_street || null,
    address_apt: row.address_apt || null,
    address_city: row.address_city || null,
    address_state: row.address_state || null,
    address_zip: row.address_zip || null,
    parking_location: row.parking_location || null,
    parking_spot: row.parking_spot || null,
    parking_map_url: row.parking_map_url || null,
    key_handoff_details: row.key_handoff_details || null,
    service_area_valid: true,
    is_active: true,
    deleted_at: null,
    updated_at: new Date().toISOString(),
  };

  if (addressPayload.address_street || addressPayload.hospital) {
    try {
      // Match by email server-side, then by NORMALIZED phone in JS — an exact
      // .eq() on customer_phone would miss matches whenever the stored phone
      // string has different formatting (spaces/dashes/parens) than this
      // booking's phone, which is exactly when duplicates were being created.
      const { data: existingAddress, error: addressLookupError } = await db
        .from('saved_service_addresses')
        .select('id,customer_phone,address_street,hospital,address_apt,address_city,address_state,address_zip')
        .ilike('customer_email', customerEmail)
        .eq('is_active', true)
        .is('deleted_at', null);

      if (!addressLookupError) {
        const normalizedPhone = cleanPhone(customerPhone);
        const duplicate = (existingAddress || []).filter((address) => cleanPhone(address.customer_phone) === normalizedPhone).find((address) => {
          return savedAddressTextKey(address.address_street || address.hospital) === savedAddressTextKey(addressPayload.address_street || addressPayload.hospital)
            && savedAddressTextKey(address.address_apt) === savedAddressTextKey(addressPayload.address_apt)
            && savedAddressTextKey(address.address_city) === savedAddressTextKey(addressPayload.address_city)
            && savedAddressStateKey(address.address_state) === savedAddressStateKey(addressPayload.address_state)
            && savedAddressZipKey(address.address_zip) === savedAddressZipKey(addressPayload.address_zip);
        });
        if (duplicate?.id) {
          await db.from('saved_service_addresses').update(addressPayload).eq('id', duplicate.id);
        } else {
          await db.from('saved_service_addresses').insert(addressPayload);
        }
      }
    } catch (err) {
      console.warn('[payments/create_authorized_booking] Saved address snapshot skipped:', err.message);
    }
  }

  const vehiclePayload = {
    customer_phone: customerPhone,
    customer_email: customerEmail,
    customer_name: row.customer_name || null,
    vehicle_year: row.vehicle_year || null,
    vehicle_make: row.vehicle_make || null,
    vehicle_model: row.vehicle_model || null,
    vehicle_color: row.vehicle_color || null,
    license_plate: row.license_plate || null,
    fuel_type: row.fuel_type || null,
    is_active: true,
    deleted_at: null,
    updated_at: new Date().toISOString(),
  };

  if (vehiclePayload.vehicle_make || vehiclePayload.vehicle_model || vehiclePayload.license_plate) {
    try {
      // Match by email server-side, then by NORMALIZED phone in JS — see the
      // address lookup above for why an exact .eq() on customer_phone is wrong.
      const { data: existingVehicle, error: vehicleLookupError } = await db
        .from('saved_customer_vehicles')
        .select('id,customer_phone,license_plate,vehicle_color')
        .ilike('customer_email', customerEmail)
        .eq('is_active', true)
        .is('deleted_at', null);

      if (!vehicleLookupError) {
        const normalizedPhone = cleanPhone(customerPhone);
        const duplicate = (existingVehicle || []).filter((vehicle) => cleanPhone(vehicle.customer_phone) === normalizedPhone).find((vehicle) => {
          return savedVehiclePlateKey(vehicle.license_plate) === savedVehiclePlateKey(vehiclePayload.license_plate)
            && savedVehicleColorKey(vehicle.vehicle_color) === savedVehicleColorKey(vehiclePayload.vehicle_color);
        });
        if (duplicate?.id) {
          await db.from('saved_customer_vehicles').update(vehiclePayload).eq('id', duplicate.id);
        } else {
          await db.from('saved_customer_vehicles').insert(vehiclePayload);
        }
      }
    } catch (err) {
      console.warn('[payments/create_authorized_booking] Saved vehicle snapshot skipped:', err.message);
    }
  }
}

async function handleCreateAuthorizedBooking(body, res) {
  const { payment_intent_id, amount_cents, ...rawFields } = body;

  if (!payment_intent_id) {
    return res.status(400).json({ error: 'payment_intent_id is required' });
  }

  const row = {};
  for (const field of ALLOWED_BOOKING_FIELDS) {
    if (rawFields[field] !== undefined) row[field] = rawFields[field];
  }

  if (!row.customer_name || !String(row.customer_name).trim()) {
    return res.status(400).json({ error: 'Customer name is required' });
  }
  if (!row.customer_phone || !String(row.customer_phone).trim()) {
    return res.status(400).json({ error: 'Customer phone is required' });
  }
  if (!row.customer_email || !String(row.customer_email).trim()) {
    return res.status(400).json({ error: 'Customer email is required' });
  }
  if (!ALLOWED_SERVICE_TYPES.includes(row.service_type)) {
    return res.status(400).json({ error: 'Invalid service type' });
  }

  const expectedCents = Math.round(Number(amount_cents));
  if (!expectedCents || expectedCents < 50) {
    return res.status(400).json({ error: 'Amount must be at least $0.50' });
  }

  // ── Verify the PaymentIntent before activating the booking ────────────────
  let intent;
  try {
    const stripe = getStripe();
    intent = await stripe.paymentIntents.retrieve(payment_intent_id);
  } catch (err) {
    console.error('[payments/create_authorized_booking] Stripe retrieve failed:', err.message);
    return res.status(400).json({ error: 'Payment authorization could not be verified. Please try again.' });
  }

  if (!intent) {
    return res.status(400).json({ error: 'Payment authorization could not be verified. Please try again.' });
  }
  if (intent.status === 'canceled' || intent.status === 'requires_payment_method') {
    return res.status(400).json({ error: 'Payment authorization could not be verified. Please try again.' });
  }
  if (intent.status !== 'requires_capture' && intent.status !== 'succeeded') {
    // requires_action (3D Secure not yet completed) or any other unexpected
    // state — the booking must not activate until authorization is final.
    return res.status(400).json({ error: 'Payment authorization could not be verified. Please try again.' });
  }
  if (intent.amount !== expectedCents) {
    console.error('[payments/create_authorized_booking] Amount mismatch:', intent.amount, 'vs expected', expectedCents);
    return res.status(400).json({ error: 'Payment authorization could not be verified. Please try again.' });
  }

  row.status = 'request_received';
  row.payment_status = 'authorized';
  row.payment_intent_id = intent.id;
  row.estimated_total = expectedCents / 100;
  row.final_total = null;
  // authorized_amount is audit-only — always the Stripe-verified amount,
  // never trusted from the client even though it's in ALLOWED_BOOKING_FIELDS.
  row.authorized_amount = expectedCents / 100;

  const db = getSupabaseAdmin();

  // Mirror the frontend's old missing-column resilience: some deployments
  // lag behind on optional columns. Retry once per unsupported column.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { data, error } = await db.from('service_requests').insert(row).select().maybeSingle();

    if (!error) {
      // Best-effort — never let a snapshot-save problem block a booking that
      // already succeeded and was already charged.
      try {
        await saveReusableBookingSnapshots(db, row);
      } catch (snapshotErr) {
        console.warn('[payments/create_authorized_booking] Snapshot save failed:', snapshotErr.message);
      }
      console.log('[payments/create_authorized_booking] Created request', data?.id, 'for PI', intent.id);
      return res.status(200).json({ id: data?.id, status: 'request_received', payment_status: 'authorized' });
    }

    const match = String(error.message || '').match(/'([^']+)' column/);
    const column = match?.[1] || '';
    if (error.code !== 'PGRST204' || !column || !(column in row)) {
      console.error('[payments/create_authorized_booking] DB insert failed:', error.message);
      return res.status(500).json({ error: 'We could not finish saving your booking after payment authorization. Please try again or contact ShiftFuel.' });
    }
    delete row[column];
  }

  return res.status(500).json({ error: 'We could not finish saving your booking after payment authorization. Please try again or contact ShiftFuel.' });
}

async function handleCreateCustomerFinal(body, res) {
  // Creates an automatic-capture PI for customers who don't have a pre-auth on file.
  const { request_id, phone, email } = body;

  if (!request_id || !phone || !email) {
    return res.status(400).json({ error: 'request_id, phone, and email are required' });
  }

  const db = getSupabaseAdmin();
  const { data: request, error: reqErr } = await db
    .from('service_requests')
    .select('id, customer_phone, customer_email, customer_name, status, final_total, service_label, payment_intent_id, payment_status')
    .eq('id', request_id)
    .maybeSingle();

  if (reqErr || !request) return res.status(404).json({ error: 'Request not found' });

  const phoneMatch = cleanPhone(request.customer_phone) === cleanPhone(phone);
  const emailMatch = (request.customer_email || '').toLowerCase() === (email || '').toLowerCase();
  if (!phoneMatch || !emailMatch) {
    return res.status(403).json({ error: 'Your phone and email do not match this request' });
  }
  const awaitingCustomerPayment = ['pending_customer_payment', 'payment_issue', 'authorization_too_low'];
  if (!awaitingCustomerPayment.includes(request.status)) {
    return res.status(400).json({ error: 'This request is not awaiting customer payment' });
  }
  if (request.payment_intent_id && request.payment_status === 'authorized') {
    return res.status(400).json({
      error: 'A payment authorization already exists. Please use the existing payment confirmation.',
      has_pre_auth: true,
    });
  }
  if (request.final_total == null || request.final_total <= 0) {
    return res.status(400).json({ error: 'Final total is not set. Please contact ShiftFuel.' });
  }

  const amountCents = Math.round(request.final_total * 100);
  if (amountCents < 50) return res.status(400).json({ error: 'Amount is too small to process' });

  try {
    const stripe = getStripe();
    const pi = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      capture_method: 'automatic',
      description: request.service_label || 'ShiftFuel service',
      receipt_email: request.customer_email || undefined,
      metadata: {
        request_id: String(request_id),
        customer_name: request.customer_name || '',
        customer_email: request.customer_email || '',
        service_label: request.service_label || '',
        purpose: 'customer_final_payment',
      },
    });
    console.log('[payments/create_customer_final] PI', pi.id, 'amount:', amountCents, 'for request', request_id);
    return res.status(200).json({ client_secret: pi.client_secret, payment_intent_id: pi.id });
  } catch (err) {
    console.error('[payments/create_customer_final] Stripe error:', err.message);
    return res.status(500).json({ error: 'Could not initialize payment. Please try again.' });
  }
}

async function handleCustomerCapture(body, res) {
  const { request_id, phone, email, new_payment_intent_id } = body;

  if (!request_id || !phone || !email) {
    return res.status(400).json({ error: 'request_id, phone, and email are required' });
  }

  const db = getSupabaseAdmin();
  const { data: request, error: reqErr } = await db
    .from('service_requests')
    .select('id, customer_phone, customer_email, customer_name, payment_intent_id, payment_status, status, final_total')
    .eq('id', request_id)
    .maybeSingle();

  if (reqErr || !request) {
    return res.status(404).json({ error: 'Request not found' });
  }

  const phoneMatch = cleanPhone(request.customer_phone) === cleanPhone(phone);
  const emailMatch = (request.customer_email || '').toLowerCase() === (email || '').toLowerCase();
  if (!phoneMatch || !emailMatch) {
    return res.status(403).json({ error: 'Your phone and email do not match this request' });
  }

  const awaitingCustomerPayment = ['pending_customer_payment', 'payment_issue', 'authorization_too_low'];
  if (!awaitingCustomerPayment.includes(request.status)) {
    if (['complete', 'awaiting_key_return'].includes(request.status) && request.payment_status === 'captured') {
      return res.status(200).json({ status: 'already_complete' });
    }
    return res.status(400).json({ error: 'This request is not awaiting customer payment' });
  }

  const stripe = getStripe();

  if (new_payment_intent_id) {
    try {
      const intent = await stripe.paymentIntents.retrieve(new_payment_intent_id);
      if (intent.status !== 'succeeded') {
        return res.status(400).json({ error: 'Payment was not confirmed. Please try again.' });
      }
      if (intent.currency !== 'usd') {
        return res.status(400).json({ error: 'Payment currency mismatch. Please contact ShiftFuel.' });
      }
      if (request.final_total == null) {
        return res.status(400).json({ error: 'Final total is not set. Please contact ShiftFuel.' });
      }
      const expectedCents = Math.round(request.final_total * 100);
      if (intent.amount !== expectedCents) {
        return res.status(400).json({ error: 'Payment amount does not match the final total. Please contact ShiftFuel.' });
      }
      if (intent.metadata?.request_id && String(intent.metadata.request_id) !== String(request_id)) {
        return res.status(400).json({ error: 'Payment reference mismatch. Please contact ShiftFuel.' });
      }
      const { data: existingUse } = await db
        .from('service_requests')
        .select('id')
        .eq('payment_intent_id', new_payment_intent_id)
        .neq('id', request_id)
        .maybeSingle();
      if (existingUse) {
        return res.status(400).json({ error: 'This payment has already been applied to another request. Please contact ShiftFuel.' });
      }
      await markRequestComplete(db, request_id, new_payment_intent_id, request.final_total);
      console.log('[payments/customer_capture] New card payment succeeded for request', request_id);
      return res.status(200).json({ status: 'succeeded' });
    } catch (err) {
      if (err.message === 'DB_UPDATE_FAILED') {
        return res.status(500).json({ error: `Payment succeeded but we could not update the request. Contact ShiftFuel support and reference request ${request_id}.` });
      }
      console.error('[payments/customer_capture] New card payment error:', err.message);
      return res.status(500).json({ error: 'Payment verification failed. Please contact ShiftFuel.' });
    }
  }

  if (!request.payment_intent_id) {
    return res.status(400).json({ error: 'No payment authorization found for this request' });
  }
  if (request.payment_status === 'captured') {
    await markRequestComplete(db, request_id, request.payment_intent_id, request.final_total);
    return res.status(200).json({ status: 'succeeded', already_captured: true });
  }
  if (request.final_total == null || request.final_total <= 0) {
    return res.status(400).json({ error: 'Final total is not set. Please contact ShiftFuel.' });
  }

  const piId = request.payment_intent_id;
  const amountToCaptureInCents = Math.round(request.final_total * 100);

  try {
    const intent = await stripe.paymentIntents.retrieve(piId);
    if (intent.status === 'succeeded') {
      await markRequestComplete(db, request_id, piId, request.final_total);
      return res.status(200).json({ status: 'succeeded', already_captured: true });
    }
    if (intent.status !== 'requires_capture') {
      return res.status(400).json({ error: 'Payment authorization has expired or is no longer valid. Please contact ShiftFuel.' });
    }
    if (intent.amount_capturable < amountToCaptureInCents) {
      return res.status(400).json({ error: 'The authorized amount is less than the final total. Please contact ShiftFuel.' });
    }
    const intentCapture = await stripe.paymentIntents.capture(piId, { amount_to_capture: amountToCaptureInCents });
    await markRequestComplete(db, request_id, piId, intentCapture.amount_captured / 100);
    return res.status(200).json({ status: intentCapture.status, amount_captured: intentCapture.amount_captured });
  } catch (err) {
    if (err.message === 'DB_UPDATE_FAILED') {
      return res.status(500).json({ error: `Payment was captured but we could not update the request. Contact ShiftFuel support and reference request ${request_id}.` });
    }
    if (err.code === 'payment_intent_unexpected_state') {
      try {
        const check = await stripe.paymentIntents.retrieve(piId);
        if (check.status === 'succeeded') {
          await markRequestComplete(db, request_id, piId, request.final_total);
          return res.status(200).json({ status: 'succeeded', already_captured: true });
        }
      } catch (_) {}
    }
    console.error('[payments/customer_capture] Stripe error:', err.message);
    return res.status(500).json({ error: 'Payment capture failed. Please contact ShiftFuel.' });
  }
}
async function handleCustomerCancel(body, res) {
  const { request_id, phone, email, reason } = body;

  if (!request_id || (!phone && !email)) {
    return res.status(400).json({ error: 'request_id and phone or email are required' });
  }
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'A cancellation reason is required' });
  }

  const db = getSupabaseAdmin();
  const { data: request, error: reqErr } = await db
    .from('service_requests')
    .select('id, payment_intent_id, payment_status, status, customer_phone, customer_email')
    .eq('id', request_id)
    .maybeSingle();

  if (reqErr || !request) return res.status(404).json({ error: 'Request not found' });

  const phoneMatch = phone && cleanPhone(phone) && cleanPhone(phone) === cleanPhone(request.customer_phone);
  const emailMatch = email && email.trim().toLowerCase() === (request.customer_email || '').toLowerCase();
  if (!phoneMatch && !emailMatch) {
    return res.status(403).json({ error: 'Contact details do not match this request' });
  }

  const cancelableStatuses = ['pending', 'request_received', 'accepted'];
  if (!cancelableStatuses.includes(request.status)) {
    const serviceStartedStatuses = [
      'key_received', 'vehicle_picked_up', 'service_in_progress', 'fueling_complete',
      'fuel_receipt_uploaded', 'car_wash_complete', 'wash_receipt_uploaded',
      'service_complete', 'receipts_recorded', 'returned_location_pending',
      'return_location_recorded', 'return_photos_needed', 'vehicle_returned',
      'inspection_needed', 'inspection_recorded', 'final_payment_processed',
      'awaiting_key_return', 'keys_returned', 'complete',
    ];
    if (serviceStartedStatuses.includes(request.status)) {
      return res.status(400).json({ error: 'This request cannot be canceled for free. Use the Request vehicle return option instead.' });
    }
    return res.status(400).json({ error: 'This request cannot be canceled from Track. Please contact ShiftFuel.' });
  }

  const timestamp = new Date().toISOString();
  let paymentStatus = request.payment_status || 'canceled';

  if (request.payment_intent_id) {
    try {
      const stripe = getStripe();
      const intent = await stripe.paymentIntents.retrieve(request.payment_intent_id);

      if (intent.status === 'requires_capture') {
        await stripe.paymentIntents.cancel(request.payment_intent_id);
        paymentStatus = 'authorization_released';
        console.log('[payments/customer_cancel] Voided PI', request.payment_intent_id, 'for request', request_id);
      } else if (intent.status === 'canceled') {
        paymentStatus = 'authorization_released';
        console.log('[payments/customer_cancel] PI already canceled', request.payment_intent_id, 'for request', request_id);
      } else if (['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing'].includes(intent.status)) {
        paymentStatus = 'authorization_released';
        console.warn('[payments/customer_cancel] PI had no capturable authorization at cancel time:', intent.status, 'request:', request_id);
      } else if (intent.status === 'succeeded') {
        console.error('[payments/customer_cancel] Refusing free cancel because PI already succeeded:', request.payment_intent_id, 'request:', request_id);
        return res.status(500).json({ error: 'We could not release the authorization automatically. Please contact ShiftFuel.' });
      } else {
        console.error('[payments/customer_cancel] Unsupported PI status while canceling:', intent.status, 'request:', request_id);
        return res.status(500).json({ error: 'We could not release the authorization automatically. Please contact ShiftFuel.' });
      }
    } catch (err) {
      if (err.code === 'payment_intent_unexpected_state') {
        try {
          const intent = await getStripe().paymentIntents.retrieve(request.payment_intent_id);
          if (intent.status === 'canceled') {
            paymentStatus = 'authorization_released';
          } else {
            console.error('[payments/customer_cancel] PI unexpected state while canceling:', intent.status);
            return res.status(500).json({ error: 'We could not release the authorization automatically. Please contact ShiftFuel.' });
          }
        } catch (retrieveErr) {
          console.error('[payments/customer_cancel] Failed to verify PI after unexpected state:', retrieveErr.message);
          return res.status(500).json({ error: 'We could not release the authorization automatically. Please contact ShiftFuel.' });
        }
      } else {
        console.error('[payments/customer_cancel] Failed to void PI:', err.message);
        return res.status(500).json({ error: 'We could not release the authorization automatically. Please contact ShiftFuel.' });
      }
    }
  } else if (!request.payment_intent_id) {
    paymentStatus = 'canceled';
  }

  const updateData = {
    status: 'customer_canceled',
    cancellation_reason: reason.trim(),
    canceled_at: timestamp,
    canceled_by: 'customer',
    payment_status: paymentStatus,
    updated_at: timestamp,
  };
  const minimalUpdateData = {
    status: 'customer_canceled',
    cancellation_reason: reason.trim(),
    payment_status: paymentStatus,
    updated_at: timestamp,
  };

  let { error: updateErr } = await db.from('service_requests').update(updateData).eq('id', request_id);

  if (updateErr) {
    console.error('[payments/customer_cancel] Full DB update failed:', {
      code: updateErr.code,
      message: updateErr.message,
      details: updateErr.details,
      hint: updateErr.hint,
    });

    const missingOptionalColumn = updateErr.code === 'PGRST204'
      || updateErr.code === '42703'
      || /column|schema cache|canceled_at|canceled_by/i.test(String(updateErr.message || ''));

    if (missingOptionalColumn) {
      const fallback = await db.from('service_requests').update(minimalUpdateData).eq('id', request_id);
      updateErr = fallback.error;
    }
  }

  if (updateErr) {
    console.error('[payments/customer_cancel] DB update failed:', {
      code: updateErr.code,
      message: updateErr.message,
      details: updateErr.details,
      hint: updateErr.hint,
    });
    return res.status(500).json({ error: 'Could not cancel the request. Please contact ShiftFuel.' });
  }

  console.log('[payments/customer_cancel] Request', request_id, 'canceled. payment_status:', paymentStatus);
  return res.status(200).json({ success: true, payment_status: paymentStatus });
}

async function handleWorkerCapture(body, res) {
  const { worker_token, request_id } = body;

  if (!worker_token || !request_id) {
    return res.status(400).json({ error: 'worker_token and request_id are required' });
  }

  const employeeId = await verifyWorkerToken(worker_token);
  if (!employeeId) return res.status(401).json({ error: 'Invalid or expired worker session' });

  const db = getSupabaseAdmin();
  const { data: request, error: reqErr } = await db
    .from('service_requests')
    .select('id, payment_intent_id, payment_status, status, final_total')
    .eq('id', request_id)
    .maybeSingle();

  if (reqErr || !request) return res.status(404).json({ error: 'Request not found' });
  if (!request.payment_intent_id) {
    return res.status(400).json({ error: 'No payment authorization found for this request' });
  }
  if (request.payment_status === 'captured') {
    await markRequestComplete(db, request_id, request.payment_intent_id, request.final_total);
    return res.status(200).json({ status: 'succeeded', already_captured: true });
  }
  if (request.final_total == null || request.final_total <= 0) {
    return res.status(400).json({ error: 'Final total is not set. Enter receipt amounts before completing.' });
  }

  const stripe = getStripe();
  const piId = request.payment_intent_id;
  const amountToCaptureInCents = Math.round(request.final_total * 100);

  try {
    const intent = await stripe.paymentIntents.retrieve(piId);
    if (intent.status === 'succeeded') {
      await markRequestComplete(db, request_id, piId, request.final_total);
      return res.status(200).json({ status: 'succeeded', already_captured: true });
    }
    if (intent.status !== 'requires_capture') {
      await db.from('service_requests').update({ payment_status: 'capture_failed', status: 'payment_issue', updated_at: new Date().toISOString() }).eq('id', request_id);
      return res.status(400).json({ capture_failed: true, error: 'Payment authorization has expired or is no longer valid. The customer will need to provide a new payment method.' });
    }
    if (intent.amount_capturable < amountToCaptureInCents) {
      await db.from('service_requests').update({ payment_status: 'capture_failed', status: 'authorization_too_low', updated_at: new Date().toISOString() }).eq('id', request_id);
      return res.status(400).json({ capture_failed: true, error: `The authorized amount ($${(intent.amount_capturable / 100).toFixed(2)}) is less than the final total ($${request.final_total.toFixed(2)}). The customer will need to pay the difference.` });
    }
    const captured = await stripe.paymentIntents.capture(piId, { amount_to_capture: amountToCaptureInCents });
    console.log('[payments/worker_capture] Captured', captured.id, 'for request', request_id);
    await markRequestComplete(db, request_id, piId, captured.amount_captured / 100);
    return res.status(200).json({ status: captured.status, amount_captured: captured.amount_captured });
  } catch (err) {
    if (err.message === 'DB_UPDATE_FAILED') {
      return res.status(500).json({ error: `Payment was captured but we could not update the request. Contact ShiftFuel support and reference request ${request_id}.` });
    }
    if (err.code === 'payment_intent_unexpected_state') {
      try {
        const check = await stripe.paymentIntents.retrieve(piId);
        if (check.status === 'succeeded') {
          await markRequestComplete(db, request_id, piId, request.final_total);
          return res.status(200).json({ status: 'succeeded', already_captured: true });
        }
      } catch (_) {}
    }
    console.error('[payments/worker_capture] Stripe error:', err.message);
    await db.from('service_requests').update({ payment_status: 'capture_failed', status: 'payment_issue', updated_at: new Date().toISOString() }).eq('id', request_id).catch(() => {});
    return res.status(500).json({ capture_failed: true, error: 'Payment capture failed. The customer will be prompted to update their payment method.' });
  }
}

async function handleCancelPayment(body, res) {
  // Admin/worker: void an authorized (uncaptured) hold.
  const { payment_intent_id, request_id, caller_token } = body;

  if (!caller_token) return res.status(401).json({ error: 'Authorization required' });
  const authorized = await verifyAnyStaffToken(caller_token);
  if (!authorized) return res.status(403).json({ error: 'Session expired or invalid. Please log in again.' });
  if (!payment_intent_id || !request_id) {
    return res.status(400).json({ error: 'payment_intent_id and request_id are required' });
  }

  const db = getSupabaseAdmin();
  const { data: request, error: reqErr } = await db
    .from('service_requests')
    .select('id, payment_intent_id, payment_status, status')
    .eq('id', request_id)
    .maybeSingle();

  if (reqErr || !request) return res.status(404).json({ error: 'Request not found' });
  if (request.payment_intent_id !== payment_intent_id) {
    return res.status(403).json({ error: 'Payment intent does not match this request' });
  }
  if (request.payment_status === 'captured') {
    return res.status(400).json({ error: 'Payment has already been captured. Use refund instead.' });
  }

  const alreadyReleased = ['voided', 'authorization_released', 'refunded', 'failed', 'auto_reversed'];
  if (alreadyReleased.includes(request.payment_status)) {
    return res.status(200).json({ status: 'already_released', payment_status: request.payment_status });
  }

  try {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.cancel(payment_intent_id);
    console.log('[payments/cancel_payment] Canceled', intent.id, 'for request', request_id);

    const { error: dbErr } = await db.from('service_requests').update({ payment_status: 'voided', updated_at: new Date().toISOString() }).eq('id', request_id);
    if (dbErr) {
      console.error('[payments/cancel_payment] DB update failed after Stripe cancel:', dbErr.message);
      return res.status(200).json({ status: intent.status, warning: 'Stripe hold released but database update failed. Contact support.' });
    }
    return res.status(200).json({ status: intent.status, payment_status: 'voided' });
  } catch (err) {
    if (err.code === 'payment_intent_unexpected_state') {
      try {
        const stripe = getStripe();
        const check = await stripe.paymentIntents.retrieve(payment_intent_id);
        const finalStatus = check.status === 'succeeded' ? 'captured' : 'voided';
        await db.from('service_requests').update({ payment_status: finalStatus, updated_at: new Date().toISOString() }).eq('id', request_id);
        return res.status(200).json({ status: check.status, payment_status: finalStatus, already_finalized: true });
      } catch (_) {
        return res.status(200).json({ status: 'already_finalized' });
      }
    }
    await db.from('service_requests').update({ payment_status: 'payment_release_failed', updated_at: new Date().toISOString() }).eq('id', request_id).catch(() => {});
    console.error('[payments/cancel_payment] Stripe error:', err.message);
    return res.status(500).json({ error: 'Payment hold release failed. Please cancel the authorization manually in Stripe.', payment_status: 'payment_release_failed' });
  }
}

async function handleCapturePayment(body, res) {
  // Admin manual capture of an authorized PI.
  const { payment_intent_id, request_id, amount_cents, caller_token } = body;

  if (!caller_token) return res.status(401).json({ error: 'Authorization required' });
  const authorized = await verifyAnyStaffToken(caller_token);
  if (!authorized) return res.status(403).json({ error: 'Session expired or invalid. Please log in again.' });
  if (!payment_intent_id || !request_id) {
    return res.status(400).json({ error: 'payment_intent_id and request_id are required' });
  }

  const db = getSupabaseAdmin();
  const { data: request, error: reqErr } = await db
    .from('service_requests')
    .select('id, payment_intent_id, payment_status, status')
    .eq('id', request_id)
    .maybeSingle();

  if (reqErr || !request) return res.status(404).json({ error: 'Request not found' });
  if (request.payment_intent_id !== payment_intent_id) {
    return res.status(403).json({ error: 'Payment intent does not match this request' });
  }
  if (request.payment_status === 'captured') {
    return res.status(200).json({ status: 'succeeded', already_captured: true });
  }
  if (request.payment_status !== 'authorized') {
    return res.status(400).json({ error: 'Payment is not in an authorized state' });
  }

  try {
    const stripe = getStripe();
    const captureParams = {};
    if (amount_cents && amount_cents >= 50) captureParams.amount_to_capture = Math.round(amount_cents);
    const intent = await stripe.paymentIntents.capture(payment_intent_id, captureParams);
    console.log('[payments/capture_payment] Captured', intent.id, 'for request', request_id);

    // Update DB: captured payment moves request to awaiting key return.
    await markRequestComplete(db, request_id, payment_intent_id, intent.amount_captured / 100);

    return res.status(200).json({ status: intent.status, amount_captured: intent.amount_captured });
  } catch (err) {
    if (err.code === 'payment_intent_unexpected_state') {
      return res.status(200).json({ status: 'already_finalized' });
    }
    console.error('[payments/capture_payment] Error:', err.message);
    await db.from('service_requests').update({ payment_status: 'capture_failed', status: 'payment_issue', updated_at: new Date().toISOString() }).eq('id', request_id).catch(() => {});
    return res.status(500).json({ capture_failed: true, error: 'Payment capture failed. The customer will be prompted to update their payment method.' });
  }
}

async function handleRefund(body, res) {
  // Admin-only refund of a captured payment.
  const { payment_intent_id, request_id, amount_cents, caller_token } = body;

  if (!caller_token) return res.status(401).json({ error: 'Authorization required' });
  const isAdmin = await verifyAdminToken(caller_token);
  if (!isAdmin) return res.status(403).json({ error: 'Admin access required for refunds' });
  if (!payment_intent_id || !request_id) {
    return res.status(400).json({ error: 'payment_intent_id and request_id are required' });
  }

  const db = getSupabaseAdmin();
  const { data: request, error: reqErr } = await db
    .from('service_requests')
    .select('id, payment_intent_id, payment_status')
    .eq('id', request_id)
    .maybeSingle();

  if (reqErr || !request) return res.status(404).json({ error: 'Request not found' });
  if (request.payment_intent_id !== payment_intent_id) {
    return res.status(403).json({ error: 'Payment intent does not match this request' });
  }
  if (request.payment_status !== 'captured') {
    return res.status(400).json({ error: 'Only captured payments can be refunded' });
  }

  try {
    const stripe = getStripe();
    const refundParams = { payment_intent: payment_intent_id };
    if (amount_cents && amount_cents >= 50) refundParams.amount = Math.round(amount_cents);
    const refund = await stripe.refunds.create(refundParams);
    console.log('[payments/refund] Refund', refund.id, 'status:', refund.status, 'for request', request_id);
    return res.status(200).json({ status: refund.status, amount_refunded: refund.amount });
  } catch (err) {
    console.error('[payments/refund] Error:', err.message);
    return res.status(500).json({ error: 'Refund failed. Please try again.' });
  }
}

async function handleMarkKeysReturned(body, res) {
  const { request_id, caller_token, key_returned_to_type, key_returned_to_name_or_location, key_returned_by } = body;

  if (!caller_token) return res.status(401).json({ error: 'Authorization required' });
  const authorized = await verifyAnyStaffToken(caller_token);
  if (!authorized) return res.status(403).json({ error: 'Session expired or invalid. Please log in again.' });

  if (!request_id || !key_returned_to_type) {
    return res.status(400).json({ error: 'request_id and key_returned_to_type are required' });
  }
  if (!['customer', 'other'].includes(key_returned_to_type)) {
    return res.status(400).json({ error: 'Invalid key return recipient' });
  }

  const db = getSupabaseAdmin();
  let { data: request, error: reqErr } = await db
    .from('service_requests')
    .select('id, status, customer_name, payment_status, return_requested_at, notes')
    .eq('id', request_id)
    .maybeSingle();

  if (reqErr) {
    console.error('[payments/mark_keys_returned] Request lookup failed:', {
      code: reqErr.code,
      message: reqErr.message,
      details: reqErr.details,
      hint: reqErr.hint,
      request_id,
    });

    const missingOptionalColumn = reqErr.code === 'PGRST204'
      || reqErr.code === '42703'
      || /column|schema cache|return_requested_at/i.test(String(reqErr.message || ''));

    if (missingOptionalColumn) {
      const fallback = await db
        .from('service_requests')
        .select('id, status, customer_name, payment_status, notes')
        .eq('id', request_id)
        .maybeSingle();
      request = fallback.data ? { ...fallback.data, return_requested_at: null } : null;
      reqErr = fallback.error;
    }
  }

  if (reqErr) {
    console.error('[payments/mark_keys_returned] Fallback request lookup failed:', {
      code: reqErr.code,
      message: reqErr.message,
      details: reqErr.details,
      hint: reqErr.hint,
      request_id,
    });
    return res.status(500).json({ error: 'Could not verify this request. Please refresh and try again.' });
  }
  if (!request) return res.status(404).json({ error: 'Request not found. Please refresh the dashboard.' });
  if (request.status !== 'awaiting_key_return') {
    return res.status(400).json({ error: 'Request is not awaiting key return' });
  }

  const returnPaymentResolved = ['cancellation_fee_paid', 'authorization_released', 'voided', 'closed_no_charge'];
  if (hasCustomerReturnRequestAlert(request) && !returnPaymentResolved.includes(request.payment_status)) {
    return res.status(400).json({
      error: 'Resolve the customer return request first. Charge the $15 cancellation/service amount or waive/release the hold before marking keys returned.',
    });
  }

  const returnedToName = key_returned_to_type === 'customer'
    ? (request.customer_name || 'Customer')
    : String(key_returned_to_name_or_location || '').trim();
  if (key_returned_to_type === 'other' && !returnedToName) {
    return res.status(400).json({ error: 'Enter the name or location keys were returned to.' });
  }

  const { error: updateErr } = await db.from('service_requests').update({
    status: 'complete',
    key_returned_to_type,
    key_returned_to_name_or_location: returnedToName,
    key_returned_at: new Date().toISOString(),
    key_returned_by: key_returned_by || null,
    updated_at: new Date().toISOString(),
  }).eq('id', request_id);

  if (updateErr) {
    console.error('[payments/mark_keys_returned] DB error:', updateErr.message);
    return res.status(500).json({ error: 'Could not mark keys as returned. Please try again.' });
  }

  console.log('[payments/mark_keys_returned] Keys returned for request', request_id);
  return res.status(200).json({ status: 'complete' });
}

async function handleCustomerRequestReturn(body, res) {
  const { request_id, phone, email } = body;

  if (!request_id || (!phone && !email)) {
    return res.status(400).json({ error: 'request_id and phone or email are required' });
  }

  const db = getSupabaseAdmin();
  const { data: request, error: reqErr } = await db
    .from('service_requests')
    .select('id, status, customer_phone, customer_email, notes')
    .eq('id', request_id)
    .maybeSingle();

  if (reqErr || !request) return res.status(404).json({ error: 'Request not found' });

  const phoneMatch = phone && cleanPhone(phone) && cleanPhone(phone) === cleanPhone(request.customer_phone);
  const emailMatch = email && email.trim().toLowerCase() === (request.customer_email || '').toLowerCase();
  if (!phoneMatch && !emailMatch) {
    return res.status(403).json({ error: 'Contact details do not match this request' });
  }

  const freeCancelStatuses = ['pending', 'request_received', 'accepted'];
  if (freeCancelStatuses.includes(request.status)) {
    return res.status(400).json({ error: 'This request can still be canceled for free. Use Cancel request instead.' });
  }

  const blockedStatuses = ['complete', 'denied', 'customer_canceled', 'canceled', 'unable_to_complete', 'auto_reversed', 'closed_no_charge', 'canceled_return_completed', 'return_requested', 'customer_return_requested'];
  if (blockedStatuses.includes(request.status)) {
    return res.status(400).json({ error: `A vehicle return cannot be requested at status "${request.status}". Contact ShiftFuel for help.` });
  }

  const timestamp = new Date().toISOString();
  const adminNote = '[customer_return_requested] Customer requested vehicle return from Track.';
  const notes = request.notes ? `${request.notes}\n${adminNote}` : adminNote;
  const fullUpdate = {
    status: 'customer_return_requested',
    pre_return_request_status: request.status,
    return_requested_at: timestamp,
    return_requested_by: 'customer',
    return_request_reason: 'customer_requested_after_key_receipt',
    notes,
    updated_at: timestamp,
  };
  const minimalUpdate = {
    status: 'customer_return_requested',
    notes,
    updated_at: timestamp,
  };

  let { error: updateErr } = await db.from('service_requests').update(fullUpdate).eq('id', request_id);

  if (updateErr) {
    console.error('[payments/customer_request_return] Full DB update failed:', {
      code: updateErr.code,
      message: updateErr.message,
      details: updateErr.details,
      hint: updateErr.hint,
    });

    const missingOptionalColumn = updateErr.code === 'PGRST204'
      || updateErr.code === '42703'
      || /column|schema cache|pre_return_request_status|return_requested_at|return_requested_by|return_request_reason/i.test(String(updateErr.message || ''));

    if (missingOptionalColumn) {
      const fallback = await db.from('service_requests').update(minimalUpdate).eq('id', request_id);
      updateErr = fallback.error;
    }
  }

  if (updateErr) {
    console.error('[payments/customer_request_return] DB update failed:', {
      code: updateErr.code,
      message: updateErr.message,
      details: updateErr.details,
      hint: updateErr.hint,
    });
    return res.status(500).json({ error: 'Could not submit your return request. Please contact ShiftFuel.' });
  }

  console.log('[payments/customer_request_return] Return requested for request', request_id);
  return res.status(200).json({ success: true, status: 'customer_return_requested' });
}

async function handleResolveReturnRequest(body, res) {
  const { request_id, caller_token, decision } = body; // decision: 'waive' | 'charge_fee' | 'continue_service'

  if (!caller_token) return res.status(401).json({ error: 'Authorization required' });
  const isAdmin = await verifyAdminToken(caller_token);
  if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });

  if (!request_id || !decision) {
    return res.status(400).json({ error: 'request_id and decision are required' });
  }
  if (!['waive', 'charge_fee', 'continue_service'].includes(decision)) {
    return res.status(400).json({ error: 'Invalid decision' });
  }

  const db = getSupabaseAdmin();
  const { data: request, error: reqErr } = await db
    .from('service_requests')
    .select('id, status, payment_intent_id, payment_status, pre_return_request_status, return_requested_at, notes')
    .eq('id', request_id)
    .maybeSingle();

  if (reqErr || !request) return res.status(404).json({ error: 'Request not found' });
  if (!hasCustomerReturnRequestAlert(request)) {
    return res.status(400).json({ error: 'Request is not awaiting a return-request decision' });
  }

  const timestamp = new Date().toISOString();

  if (decision === 'continue_service') {
    const { error: updateErr } = await db.from('service_requests').update({
      status: request.pre_return_request_status || 'key_received',
      cancellation_fee_decision_by: 'admin',
      cancellation_fee_decision_at: timestamp,
      updated_at: timestamp,
    }).eq('id', request_id);
    if (updateErr) {
      console.error('[payments/resolve_return_request] DB update failed:', updateErr.message);
      return res.status(500).json({ error: 'Could not update the request. Please try again.' });
    }
    return res.status(200).json({ success: true, status: request.pre_return_request_status || 'key_received' });
  }

  const alreadyFinalized = ['voided', 'authorization_released', 'refunded', 'captured', 'cancellation_fee_paid', 'payment_release_failed'];

  if (decision === 'waive') {
    let paymentStatus = request.payment_status;

    if (request.payment_intent_id && !alreadyFinalized.includes(request.payment_status)) {
      try {
        const stripe = getStripe();
        await stripe.paymentIntents.cancel(request.payment_intent_id);
        paymentStatus = 'authorization_released';
      } catch (err) {
        if (err.code === 'payment_intent_unexpected_state') {
          paymentStatus = 'authorization_released';
        } else {
          console.error('[payments/resolve_return_request] Failed to release hold:', err.message);
          return res.status(500).json({ error: 'Payment hold could not be released automatically. Check Stripe.' });
        }
      }
    }

    const { error: updateErr } = await db.from('service_requests').update({
      status: 'canceled_return_completed',
      payment_status: paymentStatus,
      captured_amount: 0,
      cancellation_fee_applied: false,
      cancellation_fee_waived: true,
      cancellation_fee_decision_by: 'admin',
      cancellation_fee_decision_at: timestamp,
      authorization_released_at: timestamp,
      updated_at: timestamp,
    }).eq('id', request_id);

    if (updateErr) {
      console.error('[payments/resolve_return_request] DB update failed:', updateErr.message);
      return res.status(500).json({ error: 'Could not update the request. Please try again.' });
    }
    return res.status(200).json({ success: true, status: 'canceled_return_completed', payment_status: paymentStatus });
  }

  // decision === 'charge_fee'
  if (!request.payment_intent_id) {
    return res.status(400).json({ error: 'No payment authorization exists to charge the fee against.' });
  }
  if (alreadyFinalized.includes(request.payment_status)) {
    return res.status(400).json({ error: 'Payment was already finalized. Use the refund/review flow instead.' });
  }

  try {
    const stripe = getStripe();
    const charge = returnRequestChargeFromNotes(request.notes);
    const currentIntent = await stripe.paymentIntents.retrieve(request.payment_intent_id);

    if (currentIntent.amount_capturable != null && currentIntent.amount_capturable < charge.amount_cents) {
      return res.status(400).json({
        error: `The authorized amount ($${(currentIntent.amount_capturable / 100).toFixed(2)}) is less than the return charge amount ($${charge.total.toFixed(2)}). Review the hold or waive the fee.`,
      });
    }

    const intent = await stripe.paymentIntents.capture(request.payment_intent_id, { amount_to_capture: charge.amount_cents });
    console.log('[payments/resolve_return_request] Captured return-service amount for request', request_id, charge);

    const chargeNote = `[return_fee_charge ${timestamp}] Fuel receipts $${charge.fuel.toFixed(2)}, car wash receipts $${charge.wash.toFixed(2)}, cancellation/service fee $${charge.cancellation_fee.toFixed(2)}, payment/operating recovery $${charge.recovery.toFixed(2)}, rounded total $${charge.total.toFixed(2)}.`;
    const notes = request.notes ? `${request.notes}\n${chargeNote}` : chargeNote;

    const { error: updateErr } = await db.from('service_requests').update({
      status: 'canceled_return_completed',
      payment_status: 'cancellation_fee_paid',
      captured_amount: charge.total,
      cancellation_fee_applied: true,
      cancellation_fee_amount: RETURN_CANCELLATION_FEE,
      cancellation_fee_waived: false,
      cancellation_fee_decision_by: 'admin',
      cancellation_fee_decision_at: timestamp,
      final_total: charge.total,
      actual_fuel_receipt_amount: charge.fuel || null,
      actual_car_wash_receipt_amount: charge.wash || null,
      payment_operating_recovery_amount: charge.recovery,
      net_target_amount: charge.subtotal,
      rounded_customer_total: charge.total,
      notes,
      updated_at: timestamp,
    }).eq('id', request_id);

    if (updateErr) {
      console.error('[payments/resolve_return_request] DB update failed after charge:', updateErr.message);
      return res.status(200).json({ success: true, warning: 'Fee charged in Stripe but database update failed. Contact support.' });
    }
    return res.status(200).json({ success: true, status: 'canceled_return_completed', amount_captured: intent.amount_captured, charge_breakdown: charge });
  } catch (err) {
    console.error('[payments/resolve_return_request] Fee capture failed:', err.message);
    return res.status(500).json({ error: 'Cancellation fee could not be processed. Please review payment status.' });
  }
}

// ── Main router ───────────────────────────────────────────────────────────────

const HANDLERS = {
  create_intent:             handleCreateIntent,
  create_authorized_booking: handleCreateAuthorizedBooking,
  create_customer_final: handleCreateCustomerFinal,
  customer_capture:      handleCustomerCapture,
  customer_cancel:       handleCustomerCancel,
  worker_capture:        handleWorkerCapture,
  cancel_payment:        handleCancelPayment,
  capture_payment:       handleCapturePayment,
  refund:                handleRefund,
  mark_keys_returned:    handleMarkKeysReturned,
  customer_request_return: handleCustomerRequestReturn,
  resolve_return_request:  handleResolveReturnRequest,
};

module.exports = async (req, res) => {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, ...body } = req.body || {};

  if (!action) {
    return res.status(400).json({ error: 'Missing required field: action' });
  }

  const handler = HANDLERS[action];
  if (!handler) {
    return res.status(400).json({ error: `Unknown action: ${action}` });
  }

  try {
    return await handler(body, res);
  } catch (err) {
    console.error(`[payments/${action}] Unhandled error:`, err.message);
    return res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
  }
};
