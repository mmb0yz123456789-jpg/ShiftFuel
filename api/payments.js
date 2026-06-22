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
const BOOKING_PRICE_PER_GALLON = 3.799;
const BOOKING_FUEL_SERVICE_FEE = 15;
const BOOKING_CAR_WASH_SERVICE_FEE = 15;
const BOOKING_QUICK_CARE_FEE = 5;
const BOOKING_FUEL_RANGES = {
  '0-5': 10,
  '5-10': 15,
  '10-15': 20,
  '15-20': 30,
  '20-25': 30,
  '25+': 40,
};
const BOOKING_WASH_PACKAGES = {
  'buff-shine': { label: 'Buff & Shine', price: 27 },
  'shine-protect': { label: 'Shine & Protect', price: 20 },
  shine: { label: 'Shine', price: 16 },
  'double-wash': { label: 'Double Wash', price: 12 },
};

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function bookingNeedsFuel(serviceType) {
  return ['fuel', 'fuel-only', 'car-wash-fuel'].includes(serviceType);
}

function bookingNeedsWash(serviceType) {
  return ['wash', 'wash-only', 'car-wash', 'car-wash-fuel'].includes(serviceType);
}

function calculateBookingAuthorization(row) {
  const needsFuel = bookingNeedsFuel(row.service_type);
  const needsWash = bookingNeedsWash(row.service_type);
  const fuelGallons = needsFuel ? BOOKING_FUEL_RANGES[row.estimated_fuel_range] || 0 : 0;
  const pricePerGallon = Number(row.price_per_gallon) > 0 ? Number(row.price_per_gallon) : BOOKING_PRICE_PER_GALLON;
  const fuelEstimate = roundMoney(fuelGallons * pricePerGallon);
  const washPackage = needsWash ? BOOKING_WASH_PACKAGES[row.wash_package] || null : null;
  const washAmount = washPackage ? washPackage.price : 0;
  const fuelBaseFee = needsFuel ? BOOKING_FUEL_SERVICE_FEE : 0;
  const washBaseFee = needsWash ? BOOKING_CAR_WASH_SERVICE_FEE : 0;
  const quickFee = row.quick_inspection ? BOOKING_QUICK_CARE_FEE : 0;
  const netTarget = roundMoney(fuelEstimate + washAmount + fuelBaseFee + washBaseFee + quickFee);

  if ((needsFuel && !fuelGallons) || (needsWash && !washPackage) || !netTarget) {
    return { valid: false, error: 'Service pricing details are incomplete. Please review the booking.' };
  }

  const grossBeforeRounding = (netTarget + RETURN_RECOVERY_FIXED) / (1 - RETURN_RECOVERY_RATE);
  const estimatedTotal = Math.ceil(grossBeforeRounding);
  const recovery = roundMoney(estimatedTotal - netTarget);
  let fuelRecovery = 0;
  let washRecovery = 0;

  if (needsFuel && needsWash) {
    const recoveryCents = Math.round(recovery * 100);
    const fuelBase = fuelEstimate + fuelBaseFee;
    const washBase = washAmount + washBaseFee;
    const totalServiceBase = fuelBase + washBase;
    const fuelCents = totalServiceBase
      ? Math.round(recoveryCents * (fuelBase / totalServiceBase))
      : Math.round(recoveryCents / 2);
    fuelRecovery = fuelCents / 100;
    washRecovery = (recoveryCents - fuelCents) / 100;
  } else if (needsFuel) {
    fuelRecovery = recovery;
  } else if (needsWash) {
    washRecovery = recovery;
  }

  return {
    valid: true,
    amount_cents: Math.round(estimatedTotal * 100),
    fuelGallons,
    fuelEstimate,
    washPackage,
    washAmount,
    fuelBaseFee,
    washBaseFee,
    quickFee,
    fuelFee: roundMoney(fuelBaseFee + fuelRecovery),
    washFee: roundMoney(washBaseFee + washRecovery),
    recovery,
    netTarget,
    grossBeforeRounding,
    estimatedTotal,
  };
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
  const hasReceipts = receipts.fuel > 0 || receipts.wash > 0;
  const subtotal = roundMoney(receipts.fuel + receipts.wash + RETURN_CANCELLATION_FEE);
  const total = hasReceipts
    ? Math.ceil((subtotal + RETURN_RECOVERY_FIXED) / (1 - RETURN_RECOVERY_RATE))
    : RETURN_CANCELLATION_FEE;
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
  const timestamp = new Date().toISOString();
  const updateData = {
    status: 'complete',
    payment_status: 'captured',
    payment_intent_id: paymentIntentId,
    completed_at: timestamp,
    updated_at: timestamp,
  };
  if (capturedAmountDollars != null) updateData.captured_amount = capturedAmountDollars;

  let { error } = await db.from('service_requests').update(updateData).eq('id', requestId);

  if (error && (updateData.captured_amount != null || updateData.completed_at != null)) {
    const missingOptionalColumn = error.code === 'PGRST204'
      || error.code === '42703'
      || /column|schema cache|captured_amount|completed_at/i.test(String(error.message || ''));

    if (missingOptionalColumn) {
      console.warn('[payments] optional completion column unavailable during markComplete; retrying core update:', error.message);
      delete updateData.captured_amount;
      delete updateData.completed_at;
      ({ error } = await db.from('service_requests').update(updateData).eq('id', requestId));
    }
  }

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

  if (vErr || !verified || verified.status !== 'complete' || verified.payment_status !== 'captured') {
    console.error('[payments] post-write verify failed for request', requestId, JSON.stringify(verified), vErr?.message);
    throw new Error('DB_UPDATE_FAILED');
  }
}

// ── Action handlers ───────────────────────────────────────────────────────────

async function tryIncrementAuthorization(stripe, paymentIntentId, targetAmountCents) {
  if (typeof stripe.paymentIntents.incrementAuthorization !== 'function') {
    return { intent: null, error: new Error('Stripe incremental authorization is not available in this SDK version.') };
  }

  try {
    const intent = await stripe.paymentIntents.incrementAuthorization(paymentIntentId, {
      amount: targetAmountCents,
    });
    console.log('[payments] Incremented authorization', paymentIntentId, 'to', targetAmountCents);
    return { intent, error: null };
  } catch (error) {
    console.warn('[payments] Incremental authorization failed for', paymentIntentId, '-', error.message);
    return { intent: null, error };
  }
}

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
    const paymentIntentParams = {
      amount: parsedCents,
      currency: 'usd',
      capture_method: 'manual',
      description: service_label || 'ShiftFuel service',
      receipt_email: customer_email || undefined,
      metadata: { customer_name: customer_name || '', service_label: service_label || '' },
      payment_method_options: {
        card: {
          request_incremental_authorization_support: 'if_available',
        },
      },
    };
    let pi;
    try {
      pi = await stripe.paymentIntents.create(paymentIntentParams);
    } catch (createErr) {
      const incrementalParamRejected = createErr.code === 'parameter_unknown'
        || /request_incremental_authorization_support|payment_method_options/i.test(String(createErr.message || ''));
      if (!incrementalParamRejected) throw createErr;
      console.warn('[payments/create_intent] Incremental authorization option rejected; retrying without it:', createErr.message);
      delete paymentIntentParams.payment_method_options;
      pi = await stripe.paymentIntents.create(paymentIntentParams);
    }
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
  'customer_id',
  'vehicle_year', 'vehicle_make', 'vehicle_model', 'vehicle_color', 'license_plate',
  'vehicle_id',
  'hospital', 'address_street', 'address_apt', 'address_city', 'address_state', 'address_zip',
  'address_validation_status',
  'parking_location', 'parking_spot', 'parking_map_url', 'key_handoff_details',
  'special_instructions',
  'service_type', 'service_label', 'service_date', 'desired_return_time',
  'fuel_type', 'estimated_fuel_range', 'estimated_gallons', 'price_per_gallon', 'estimated_fuel_amount',
  'fuel_convenience_fee', 'wash_package', 'wash_package_label', 'wash_fee', 'wash_convenience_fee',
  'quick_inspection', 'quick_inspection_fee', 'service_fee', 'detailing_available_window',
  'estimated_total', 'notes', 'booking_source',
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

async function attachLegacyUserAndVehicle(db, row) {
  if (row.user_id && row.vehicle_id) return true;

  const { data: user, error: userErr } = await db
    .from('users')
    .insert({
      name: row.customer_name || 'Customer',
      email: row.customer_email || null,
      phone: row.customer_phone || '',
      role: 'customer',
    })
    .select('id')
    .maybeSingle();

  if (userErr || !user?.id) {
    console.error('[payments/create_authorized_booking] Legacy user fallback failed:', userErr?.message);
    return false;
  }

  row.user_id = user.id;

  const { data: vehicle, error: vehicleErr } = await db
    .from('vehicles')
    .insert({
      user_id: user.id,
      make: row.vehicle_make || 'Unknown',
      model: row.vehicle_model || 'Unknown',
      year: Number(row.vehicle_year) || new Date().getFullYear(),
      color: row.vehicle_color || 'Unknown',
      license_plate: row.license_plate || 'Unknown',
      fuel_type: row.fuel_type || 'Regular',
    })
    .select('id')
    .maybeSingle();

  if (vehicleErr || !vehicle?.id) {
    console.error('[payments/create_authorized_booking] Legacy vehicle fallback failed:', vehicleErr?.message);
    return false;
  }

  row.vehicle_id = vehicle.id;
  return true;
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

  const serverPricing = calculateBookingAuthorization(row);
  if (!serverPricing.valid) {
    return res.status(400).json({ error: serverPricing.error });
  }
  if (serverPricing.amount_cents !== expectedCents) {
    console.error('[payments/create_authorized_booking] Server total mismatch:', serverPricing.amount_cents, 'vs client', expectedCents, {
      service_type: row.service_type,
      estimated_fuel_range: row.estimated_fuel_range,
      wash_package: row.wash_package,
      quick_inspection: row.quick_inspection,
    });
    return res.status(400).json({ error: 'Payment total changed. Please review the payment authorization and try again.' });
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
  if (intent.capture_method && intent.capture_method !== 'manual') {
    return res.status(400).json({ error: 'Payment authorization could not be verified. Please try again.' });
  }
  if (intent.status !== 'requires_capture') {
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
  row.estimated_total = serverPricing.estimatedTotal;
  row.final_total = null;
  // authorized_amount is audit-only — always the Stripe-verified amount,
  // never trusted from the client even though it's in ALLOWED_BOOKING_FIELDS.
  row.authorized_amount = serverPricing.estimatedTotal;
  row.estimated_gallons = serverPricing.fuelGallons;
  row.estimated_fuel_amount = serverPricing.fuelEstimate;
  row.fuel_convenience_fee = serverPricing.fuelFee;
  row.wash_fee = serverPricing.washAmount;
  row.wash_package_label = serverPricing.washPackage?.label || row.wash_package_label || '';
  row.wash_convenience_fee = serverPricing.washFee;
  row.quick_inspection_fee = serverPricing.quickFee;
  row.service_fee = roundMoney(serverPricing.fuelFee + serverPricing.washFee);
  row.base_fuel_service_fee = serverPricing.fuelBaseFee;
  row.base_car_wash_service_fee = serverPricing.washBaseFee;
  row.base_inspection_fee = serverPricing.quickFee;
  row.payment_operating_recovery_amount = serverPricing.recovery;
  row.displayed_fuel_service_fee = serverPricing.fuelFee;
  row.displayed_car_wash_service_fee = serverPricing.washFee;
  row.displayed_inspection_fee = serverPricing.quickFee;
  row.net_target_amount = serverPricing.netTarget;
  row.gross_total_before_rounding = serverPricing.grossBeforeRounding;
  row.rounded_customer_total = serverPricing.estimatedTotal;
  row.parking_spot = row.parking_spot || row.parking_location || 'See parking location';
  row.key_handoff_method = row.key_handoff_method || row.key_handoff_details || 'See key handoff details';

  const db = getSupabaseAdmin();

  // Mirror the frontend's old missing-column resilience: some deployments
  // lag behind on optional columns. Retry once per unsupported column.
  const maxInsertAttempts = Object.keys(row).length + 5;
  for (let attempt = 0; attempt < maxInsertAttempts; attempt += 1) {
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

    const message = String(error.message || '');
    if (/null value in column "(user_id|vehicle_id)"/i.test(message)) {
      const attached = await attachLegacyUserAndVehicle(db, row);
      if (attached) {
        console.warn('[payments/create_authorized_booking] Attached legacy user/vehicle rows and retrying insert');
        continue;
      }
    }

    const column = message.match(/Could not find the '([^']+)' column/i)?.[1]
      || message.match(/'([^']+)' column/i)?.[1]
      || message.match(/column "([^"]+)"/i)?.[1]
      || '';
    const missingOptionalColumn = (
      error.code === 'PGRST204'
      || error.code === '42703'
      || /schema cache|column/i.test(message)
    ) && column && Object.prototype.hasOwnProperty.call(row, column);

    if (!missingOptionalColumn) {
      console.error('[payments/create_authorized_booking] DB insert failed:', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      return res.status(500).json({ error: 'We could not finish saving your booking after payment authorization. Please try again or contact ShiftFuel.' });
    }

    console.warn('[payments/create_authorized_booking] Dropping unsupported optional column and retrying:', column);
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
  if (!awaitingCustomerPayment.includes(request.status) && request.payment_status !== 'capture_failed') {
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
  if (!awaitingCustomerPayment.includes(request.status) && request.payment_status !== 'capture_failed') {
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
    let intent = await stripe.paymentIntents.retrieve(piId);
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
const CANCELLATION_BASE_FEE = 15;

// Status -> cancellation outcome. Keep in sync with the confirmation-modal
// copy in track.js — the customer must see the same fee story they're charged.
function cancellationOutcomeForStatus(status) {
  const noFeeStatuses = ['pending', 'request_received', 'accepted'];
  const flatFeeStatuses = ['key_received'];
  const feePlusCostsStatuses = [
    'vehicle_picked_up', 'fueling_in_progress', 'car_wash_in_progress',
    'service_in_progress', 'partial_service_complete',
    // Existing pickup/fueling/wash sub-statuses also mean service has started.
    'pickup_vehicle_photo_uploaded', 'pickup_odometer_photo_uploaded', 'pickup_fuel_gauge_photo_uploaded',
    'fueling_complete', 'fuel_receipt_uploaded', 'car_wash_complete', 'wash_receipt_uploaded',
    'car_wash_after_fuel_in_progress', 'fueling_after_wash_in_progress',
    'wash_receipt_after_fuel_uploaded', 'fuel_receipt_after_wash_uploaded',
    'service_complete', 'receipts_recorded',
  ];
  const blockedMessages = {
    vehicle_returned: 'This request can no longer be cancelled because the vehicle has already been returned.',
    returned_location_pending: 'This request can no longer be cancelled because the vehicle has already been returned.',
    return_location_recorded: 'This request can no longer be cancelled because the vehicle has already been returned.',
    return_photos_needed: 'This request can no longer be cancelled because the vehicle has already been returned.',
    dropoff_vehicle_photo_uploaded: 'This request can no longer be cancelled because the vehicle has already been returned.',
    dropoff_odometer_photo_uploaded: 'This request can no longer be cancelled because the vehicle has already been returned.',
    inspection_needed: 'This request can no longer be cancelled because the vehicle has already been returned.',
    inspection_recorded: 'This request can no longer be cancelled because the vehicle has already been returned.',
    awaiting_key_return: 'This request can no longer be cancelled because the vehicle has already been returned.',
    keys_returned: 'This request can no longer be cancelled because the vehicle has already been returned.',
    final_payment_processed: 'This request can no longer be cancelled because the vehicle has already been returned.',
    complete: 'This request is already complete.',
    denied: 'This request has already been denied.',
    cancelled: 'This request has already been cancelled.',
    cancelled_pending_key_return: 'This request has already been cancelled.',
    customer_canceled: 'This request has already been cancelled.',
    canceled: 'This request has already been cancelled.',
    canceled_return_completed: 'This request has already been cancelled.',
    customer_return_requested: 'This request has already been cancelled.',
    return_requested: 'This request has already been cancelled.',
  };

  if (blockedMessages[status]) {
    return { cancelable: false, message: blockedMessages[status] };
  }
  if (noFeeStatuses.includes(status)) {
    return { cancelable: true, tier: 'none', requiresKeyReturn: false, newStatus: 'cancelled' };
  }
  if (flatFeeStatuses.includes(status)) {
    return { cancelable: true, tier: 'flat_fee', requiresKeyReturn: true, newStatus: 'cancelled_pending_key_return' };
  }
  if (feePlusCostsStatuses.includes(status)) {
    return { cancelable: true, tier: 'fee_plus_costs', requiresKeyReturn: true, newStatus: 'cancelled_pending_key_return' };
  }
  return { cancelable: false, message: 'This request cannot be cancelled from Track right now. Please contact ShiftFuel.' };
}

// Single shared place the Stripe-fee-covering markup is computed for
// cancellations — never hard-code this math per call site.
function cancellationChargeForTier(tier, receiptTotals) {
  if (tier === 'none') {
    return { feeAmount: 0, stripeFee: 0, receiptTotal: 0, totalCharged: 0 };
  }
  if (tier === 'flat_fee') {
    return { feeAmount: CANCELLATION_BASE_FEE, stripeFee: 0, receiptTotal: 0, totalCharged: CANCELLATION_BASE_FEE };
  }
  const receiptTotal = roundMoney((receiptTotals.fuel || 0) + (receiptTotals.wash || 0));
  const subtotal = roundMoney(CANCELLATION_BASE_FEE + receiptTotal);
  const totalCharged = Math.ceil((subtotal + RETURN_RECOVERY_FIXED) / (1 - RETURN_RECOVERY_RATE));
  const stripeFee = roundMoney(totalCharged - subtotal);
  return { feeAmount: CANCELLATION_BASE_FEE, stripeFee, receiptTotal, totalCharged };
}

async function handleCustomerCancel(body, res) {
  const { request_id, phone, email, reason } = body;

  if (!request_id || (!phone && !email)) {
    return res.status(400).json({ error: 'request_id and phone or email are required' });
  }

  const db = getSupabaseAdmin();
  const { data: request, error: reqErr } = await db
    .from('service_requests')
    .select('id, payment_intent_id, payment_status, status, customer_phone, customer_email, notes, assigned_employee_id')
    .eq('id', request_id)
    .maybeSingle();

  if (reqErr || !request) return res.status(404).json({ error: 'Request not found' });

  const phoneMatch = phone && cleanPhone(phone) && cleanPhone(phone) === cleanPhone(request.customer_phone);
  const emailMatch = email && email.trim().toLowerCase() === (request.customer_email || '').toLowerCase();
  if (!phoneMatch && !emailMatch) {
    return res.status(403).json({ error: 'Contact details do not match this request' });
  }

  const outcome = cancellationOutcomeForStatus(request.status);
  if (!outcome.cancelable) {
    return res.status(400).json({ error: outcome.message });
  }

  const timestamp = new Date().toISOString();
  const receiptTotals = receiptTotalsFromNotes(request.notes);
  const charge = cancellationChargeForTier(outcome.tier, receiptTotals);
  let paymentStatus = request.payment_status || 'canceled';

  try {
    if (charge.totalCharged <= 0) {
      // No-fee tier: void the authorization entirely, nothing is captured.
      if (request.payment_intent_id) {
        const stripe = getStripe();
        const intent = await stripe.paymentIntents.retrieve(request.payment_intent_id);
        if (intent.status === 'requires_capture') {
          await stripe.paymentIntents.cancel(request.payment_intent_id);
          paymentStatus = 'authorization_released';
        } else if (intent.status === 'canceled') {
          paymentStatus = 'authorization_released';
        } else if (['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing'].includes(intent.status)) {
          paymentStatus = 'authorization_released';
        } else {
          console.error('[payments/customer_cancel] Cannot void PI in status', intent.status, 'for request', request_id);
          return res.status(500).json({ error: 'We could not release the authorization automatically. Please contact ShiftFuel.' });
        }
      } else {
        paymentStatus = 'canceled';
      }
    } else {
      // Fee tier: capture only the cancellation charge amount, never the full
      // original authorization unless receipts/completed costs justify it.
      if (!request.payment_intent_id) {
        return res.status(400).json({ error: 'No payment authorization exists to charge the cancellation fee against.' });
      }
      const stripe = getStripe();
      const amountToCaptureInCents = Math.round(charge.totalCharged * 100);
      let intent = await stripe.paymentIntents.retrieve(request.payment_intent_id);

      if (intent.status === 'succeeded') {
        return res.status(400).json({ error: 'This request has already been charged. Please contact ShiftFuel.' });
      }
      if (intent.status !== 'requires_capture') {
        return res.status(500).json({ error: 'Your payment authorization is no longer valid. Please contact ShiftFuel.' });
      }
      if (intent.amount_capturable < amountToCaptureInCents) {
        const increment = await tryIncrementAuthorization(stripe, request.payment_intent_id, amountToCaptureInCents);
        if (increment.intent) intent = increment.intent;
      }
      if (intent.amount_capturable < amountToCaptureInCents) {
        return res.status(400).json({ error: 'We could not process the cancellation fee automatically. Please contact ShiftFuel.' });
      }

      const captured = await stripe.paymentIntents.capture(request.payment_intent_id, { amount_to_capture: amountToCaptureInCents });
      paymentStatus = 'cancellation_fee_paid';
      console.log('[payments/customer_cancel] Captured cancellation charge', captured.amount_captured, 'for request', request_id);
    }
  } catch (err) {
    if (err.code === 'payment_intent_unexpected_state') {
      try {
        const intent = await getStripe().paymentIntents.retrieve(request.payment_intent_id);
        if (intent.status === 'canceled' && charge.totalCharged <= 0) {
          paymentStatus = 'authorization_released';
        } else {
          console.error('[payments/customer_cancel] PI unexpected state:', intent.status);
          return res.status(500).json({ error: 'We could not process this cancellation automatically. Please contact ShiftFuel.' });
        }
      } catch (retrieveErr) {
        console.error('[payments/customer_cancel] Failed to verify PI after unexpected state:', retrieveErr.message);
        return res.status(500).json({ error: 'We could not process this cancellation automatically. Please contact ShiftFuel.' });
      }
    } else {
      console.error('[payments/customer_cancel] Stripe error:', err.message);
      return res.status(500).json({ error: 'We could not process this cancellation automatically. Please contact ShiftFuel.' });
    }
  }

  const trimmedReason = reason && reason.trim() ? reason.trim() : null;
  const updateData = {
    status: outcome.newStatus,
    cancellation_reason: trimmedReason,
    canceled_at: timestamp,
    canceled_by: 'customer',
    cancellation_requested_at: timestamp,
    cancelled_at: outcome.newStatus === 'cancelled' ? timestamp : null,
    cancellation_fee_amount: charge.feeAmount,
    cancellation_stripe_fee_amount: charge.stripeFee,
    cancellation_receipt_total: charge.receiptTotal,
    cancellation_total_charged: charge.totalCharged,
    cancellation_status: outcome.newStatus,
    cancellation_requires_key_return: outcome.requiresKeyReturn,
    cancellation_worker_notified_at: request.assigned_employee_id ? timestamp : null,
    payment_status: paymentStatus,
    updated_at: timestamp,
  };
  const minimalUpdateData = {
    status: outcome.newStatus,
    cancellation_reason: trimmedReason,
    canceled_at: timestamp,
    canceled_by: 'customer',
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
      || /column|schema cache/i.test(String(updateErr.message || ''));

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
    return res.status(500).json({ error: `Your cancellation was processed but we could not update the request. Contact ShiftFuel and reference request ${request_id}.` });
  }

  console.log('[payments/customer_cancel] Request', request_id, 'status ->', outcome.newStatus, 'payment_status:', paymentStatus);
  return res.status(200).json({
    success: true,
    status: outcome.newStatus,
    payment_status: paymentStatus,
    charge: { fee_amount: charge.feeAmount, stripe_fee: charge.stripeFee, receipt_total: charge.receiptTotal, total_charged: charge.totalCharged },
  });
}

async function handleWorkerConfirmCancellationReturn(body, res) {
  const { worker_token, request_id } = body;

  if (!worker_token || !request_id) {
    return res.status(400).json({ error: 'worker_token and request_id are required' });
  }

  const employeeId = await verifyWorkerToken(worker_token);
  if (!employeeId) return res.status(401).json({ error: 'Invalid or expired worker session' });

  const db = getSupabaseAdmin();
  const { data: request, error: reqErr } = await db
    .from('service_requests')
    .select('id, status')
    .eq('id', request_id)
    .maybeSingle();

  if (reqErr || !request) return res.status(404).json({ error: 'Request not found' });
  if (request.status !== 'cancelled_pending_key_return') {
    return res.status(400).json({ error: 'This request is not awaiting a key/vehicle return.' });
  }

  const timestamp = new Date().toISOString();
  const { error: updateErr } = await db.from('service_requests').update({
    status: 'cancelled',
    cancelled_at: timestamp,
    cancellation_key_returned_at: timestamp,
    cancellation_status: 'cancelled',
    updated_at: timestamp,
  }).eq('id', request_id);

  if (updateErr) {
    console.error('[payments/worker_confirm_cancellation_return] DB update failed:', updateErr.message);
    return res.status(500).json({ error: 'Could not update the request. Please try again.' });
  }

  return res.status(200).json({ success: true, status: 'cancelled' });
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
    let intent = await stripe.paymentIntents.retrieve(piId);
    if (intent.status === 'succeeded') {
      await markRequestComplete(db, request_id, piId, request.final_total);
      return res.status(200).json({ status: 'succeeded', already_captured: true });
    }
    if (intent.status !== 'requires_capture') {
      await db.from('service_requests').update({ payment_status: 'capture_failed', status: 'payment_issue', updated_at: new Date().toISOString() }).eq('id', request_id);
      return res.status(400).json({ capture_failed: true, error: 'Payment authorization has expired or is no longer valid. The customer will need to provide a new payment method.' });
    }
    if (intent.amount_capturable < amountToCaptureInCents) {
      const increment = await tryIncrementAuthorization(stripe, piId, amountToCaptureInCents);
      if (increment.intent) {
        intent = increment.intent;
      }
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

async function handleCancelAuthorization(body, res) {
  // Customer-side pre-booking cancel: void a manual-capture authorization before
  // the service_request row is created.
  const { payment_intent_id, client_secret } = body;

  if (!payment_intent_id || !client_secret) {
    return res.status(400).json({ error: 'payment_intent_id and client_secret are required' });
  }

  try {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(payment_intent_id);
    if (intent.client_secret !== client_secret) {
      return res.status(403).json({ error: 'Payment authorization could not be verified' });
    }

    if (intent.status === 'canceled') {
      return res.status(200).json({ status: 'already_canceled' });
    }
    if (intent.status === 'requires_capture') {
      const canceled = await stripe.paymentIntents.cancel(payment_intent_id);
      console.log('[payments/cancel_authorization] Canceled pre-booking authorization', payment_intent_id);
      return res.status(200).json({ status: canceled.status });
    }
    if (['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing'].includes(intent.status)) {
      const canceled = await stripe.paymentIntents.cancel(payment_intent_id);
      console.log('[payments/cancel_authorization] Canceled incomplete pre-booking authorization', payment_intent_id);
      return res.status(200).json({ status: canceled.status });
    }

    return res.status(400).json({ error: 'This payment authorization can no longer be canceled automatically.' });
  } catch (err) {
    console.error('[payments/cancel_authorization] Stripe error:', err.message);
    return res.status(500).json({ error: 'Payment authorization could not be canceled. Please contact ShiftFuel.' });
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
  if (!['authorized', 'capture_failed'].includes(request.payment_status)) {
    return res.status(400).json({ error: 'Payment is not in an authorized state' });
  }

  try {
    const stripe = getStripe();
    const captureParams = {};
    if (amount_cents && amount_cents >= 50) {
      const targetAmountCents = Math.round(amount_cents);
      captureParams.amount_to_capture = targetAmountCents;
      let currentIntent = await stripe.paymentIntents.retrieve(payment_intent_id);
      if (currentIntent.status !== 'requires_capture') {
        return res.status(400).json({ error: 'Payment authorization has expired or is no longer valid.' });
      }
      if (currentIntent.amount_capturable < targetAmountCents) {
        const increment = await tryIncrementAuthorization(stripe, payment_intent_id, targetAmountCents);
        if (increment.intent) currentIntent = increment.intent;
      }
      if (currentIntent.amount_capturable < targetAmountCents) {
        return res.status(400).json({
          capture_failed: true,
          error: `The authorized amount ($${(currentIntent.amount_capturable / 100).toFixed(2)}) is less than the final total ($${(targetAmountCents / 100).toFixed(2)}). The customer will need to pay the difference.`,
        });
      }
    }
    const intent = await stripe.paymentIntents.capture(payment_intent_id, captureParams);
    console.log('[payments/capture_payment] Captured', intent.id, 'for request', request_id);

    // Update DB: normal final capture completes the request.
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
    const { error: dbErr } = await db.from('service_requests').update({
      payment_status: 'refunded',
      updated_at: new Date().toISOString(),
    }).eq('id', request_id);
    if (dbErr) {
      console.error('[payments/refund] DB update failed after Stripe refund:', dbErr.message);
      return res.status(200).json({
        status: refund.status,
        amount_refunded: refund.amount,
        warning: 'Stripe refund was created but database payment status was not updated. Contact support.',
      });
    }
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
    .select('id, status, customer_name, payment_intent_id, payment_status, captured_amount, return_requested_at, notes')
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
      || /column|schema cache|return_requested_at|captured_amount/i.test(String(reqErr.message || ''));

    if (missingOptionalColumn) {
      const fallback = await db
        .from('service_requests')
        .select('id, status, customer_name, payment_intent_id, payment_status, notes')
        .eq('id', request_id)
        .maybeSingle();
      request = fallback.data ? { ...fallback.data, captured_amount: null, return_requested_at: null } : null;
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

  const returnedToName = key_returned_to_type === 'customer'
    ? (request.customer_name || 'Customer')
    : String(key_returned_to_name_or_location || '').trim();
  if (key_returned_to_type === 'other' && !returnedToName) {
    return res.status(400).json({ error: 'Enter the name or location keys were returned to.' });
  }

  async function closeReturnRequestAfterCharge({ charge, capturedAmount, note }) {
    const timestamp = new Date().toISOString();
    const notes = note ? (request.notes ? `${request.notes}\n${note}` : note) : request.notes;
    const fullUpdate = {
      status: 'canceled_return_completed',
      payment_status: 'cancellation_fee_paid',
      captured_amount: capturedAmount,
      cancellation_fee_applied: true,
      cancellation_fee_amount: RETURN_CANCELLATION_FEE,
      cancellation_fee_waived: false,
      cancellation_fee_decision_by: key_returned_by || 'staff',
      cancellation_fee_decision_at: timestamp,
      final_total: charge.total,
      actual_fuel_receipt_amount: charge.fuel || null,
      actual_car_wash_receipt_amount: charge.wash || null,
      payment_operating_recovery_amount: charge.recovery,
      net_target_amount: charge.subtotal,
      rounded_customer_total: charge.total,
      key_returned_to_type,
      key_returned_to_name_or_location: returnedToName,
      key_returned_at: timestamp,
      key_returned_by: key_returned_by || null,
      notes,
      updated_at: timestamp,
    };
    const keyReturnUpdate = {
      status: 'canceled_return_completed',
      payment_status: 'cancellation_fee_paid',
      final_total: charge.total,
      key_returned_to_type,
      key_returned_to_name_or_location: returnedToName,
      key_returned_at: timestamp,
      key_returned_by: key_returned_by || null,
      notes,
      updated_at: timestamp,
    };
    const minimalUpdate = {
      status: 'canceled_return_completed',
      payment_status: 'cancellation_fee_paid',
      final_total: charge.total,
      notes,
      updated_at: timestamp,
    };

    let result = await db.from('service_requests').update(fullUpdate).eq('id', request_id);
    const missingOptionalColumn = (error) => error && (
      error.code === 'PGRST204'
      || error.code === '42703'
      || /column|schema cache|captured_amount|cancellation_fee|actual_fuel|actual_car_wash|payment_operating|net_target|rounded_customer/i.test(String(error.message || ''))
    );

    if (missingOptionalColumn(result.error)) {
      console.warn('[payments/mark_keys_returned] Full return closeout update hit missing optional column; retrying with key-return fields:', result.error.message);
      result = await db.from('service_requests').update(keyReturnUpdate).eq('id', request_id);
    }

    if (missingOptionalColumn(result.error) || /key_returned/i.test(String(result.error?.message || ''))) {
      console.warn('[payments/mark_keys_returned] Key-return closeout update hit missing optional column; retrying minimal close:', result.error?.message);
      result = await db.from('service_requests').update(minimalUpdate).eq('id', request_id);
    }

    return result;
  }

  const returnPaymentResolved = ['cancellation_fee_paid', 'authorization_released', 'voided', 'closed_no_charge'];
  if (hasCustomerReturnRequestAlert(request) && !returnPaymentResolved.includes(request.payment_status)) {
    if (!request.payment_intent_id) {
      return res.status(400).json({ error: 'No payment authorization exists to charge the cancellation/service amount.' });
    }

    try {
      const stripe = getStripe();
      const charge = returnRequestChargeFromNotes(request.notes);
      const currentIntent = await stripe.paymentIntents.retrieve(request.payment_intent_id);

      if (currentIntent.status !== 'requires_capture') {
        if (currentIntent.status === 'succeeded') {
          const capturedAmount = currentIntent.amount_received ? currentIntent.amount_received / 100 : charge.total;
          const timestamp = new Date().toISOString();
          const note = `[return_fee_charge_reconciled ${timestamp}] Stripe payment was already captured before key-return closeout. Keys returned by ${key_returned_by || 'staff'}. Captured amount $${capturedAmount.toFixed(2)}.`;
          const { error: reconciledUpdateErr } = await closeReturnRequestAfterCharge({ charge, capturedAmount, note });
          if (reconciledUpdateErr) {
            console.error('[payments/mark_keys_returned] DB reconcile failed after existing Stripe capture:', reconciledUpdateErr.message);
            return res.status(500).json({ error: 'Payment was already processed, but the request could not be closed. Contact an admin.' });
          }
          return res.status(200).json({ status: 'canceled_return_completed', amount_captured: Math.round(capturedAmount * 100), reconciled: true });
        }

        return res.status(400).json({ error: 'The payment authorization is not available for capture. Please contact an admin.' });
      }
      if (currentIntent.amount_capturable != null && currentIntent.amount_capturable < charge.amount_cents) {
        return res.status(400).json({
          error: `The authorized amount ($${(currentIntent.amount_capturable / 100).toFixed(2)}) is less than the return charge amount ($${charge.total.toFixed(2)}). Contact an admin.`,
        });
      }

      const intent = await stripe.paymentIntents.capture(request.payment_intent_id, { amount_to_capture: charge.amount_cents });
      const timestamp = new Date().toISOString();
      const chargeNote = `[return_fee_charge ${timestamp}] Keys returned by ${key_returned_by || 'staff'}. Fuel receipts $${charge.fuel.toFixed(2)}, car wash receipts $${charge.wash.toFixed(2)}, cancellation/service fee $${charge.cancellation_fee.toFixed(2)}, payment/operating recovery $${charge.recovery.toFixed(2)}, rounded total $${charge.total.toFixed(2)}.`;
      const { error: returnUpdateErr } = await closeReturnRequestAfterCharge({ charge, capturedAmount: charge.total, note: chargeNote });

      if (returnUpdateErr) {
        console.error('[payments/mark_keys_returned] DB update failed after return charge:', returnUpdateErr.message);
        return res.status(200).json({ success: true, warning: 'Return amount charged in Stripe but database update failed. Contact support.' });
      }

      console.log('[payments/mark_keys_returned] Captured return amount and closed request', request_id, charge);
      return res.status(200).json({ status: 'canceled_return_completed', amount_captured: intent.amount_captured, charge_breakdown: charge });
    } catch (err) {
      console.error('[payments/mark_keys_returned] Return charge failed:', err.message);
      return res.status(500).json({ error: 'Cancellation/service amount could not be processed. Please contact an admin.' });
    }
  }

  if (hasCustomerReturnRequestAlert(request) && request.payment_status === 'cancellation_fee_paid') {
    const charge = returnRequestChargeFromNotes(request.notes);
    const note = `[return_keys_recorded ${new Date().toISOString()}] Keys returned by ${key_returned_by || 'staff'} after return charge was already processed.`;
    const { error: resolvedUpdateErr } = await closeReturnRequestAfterCharge({
      charge,
      capturedAmount: request.captured_amount || charge.total,
      note,
    });
    if (resolvedUpdateErr) {
      console.error('[payments/mark_keys_returned] DB close failed after resolved return payment:', resolvedUpdateErr.message);
      return res.status(500).json({ error: 'Could not close the returned request. Please try again.' });
    }
    return res.status(200).json({ status: 'canceled_return_completed', already_charged: true });
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
  worker_confirm_cancellation_return: handleWorkerConfirmCancellationReturn,
  worker_capture:        handleWorkerCapture,
  cancel_authorization:  handleCancelAuthorization,
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
