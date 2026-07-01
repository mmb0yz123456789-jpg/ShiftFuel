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

const { setCorsHeaders, getSupabaseAdmin, verifyAdminToken, verifyWorkerToken, verifyAnyStaffToken } = require('./_auth');
const {
  getStripe,
  cleanPhone,
  roundMoney,
  savedVehiclePlateKey,
  savedVehicleColorKey,
  savedAddressTextKey,
  savedAddressStateKey,
  savedAddressZipKey,
} = require('./_utils');
const { notifyRequest } = require('./_push');
const { placeScheduledHold } = require('./_scheduled-auth');
const { verifyServiceArea } = require('./_service-area');
const { computeSurchargeForChosen, PER_MILE_RATE } = require('./_gas-stations');
const { computeWashDistanceCharge } = require('./_wash-distance');
const { enforceRateLimit } = require('./_rate-limit');
const { amountsFromRow, validatePromoForCustomer, recordPromoRedemption } = require('./_promos');
const { recordDrivenMileage, drivenMilesSoFar } = require('./_route-mileage');

// Per-IP caps on the actions that reach Mapbox before Stripe verification.
const PAYMENTS_RATE_LIMITS = {
  create_authorized_booking: { limit: 20, windowSeconds: 60 },
  create_scheduled_booking:  { limit: 20, windowSeconds: 60 },
  create_intent:             { limit: 30, windowSeconds: 60 },
  create_setup_intent:       { limit: 30, windowSeconds: 60 },
  admin_login:               { limit: 7,  windowSeconds: 900 },
};

// Actions that should fire a push once the handler has updated the DB. The event
// is self-validating against the request's real status, so a failed action that
// didn't change anything won't send a false alert.
const PUSH_AFTER_ACTION = {
  customer_request_return: 'cancelled', // → assigned worker
  customer_cancel:         'cancelled', // → assigned worker
  worker_capture:          'completed', // → customer
  mark_keys_returned:      'completed', // → customer
};

// ── Shared helpers ────────────────────────────────────────────────────────────

const RETURN_CANCELLATION_FEE = 15;
const RETURN_RECOVERY_RATE = 0.029;
const RETURN_RECOVERY_FIXED = 0.30;
const BOOKING_PRICE_PER_GALLON = 3.799;
const BOOKING_FUEL_SERVICE_FEE = 15;
const BOOKING_CAR_WASH_SERVICE_FEE = 15;
const BOOKING_QUICK_CARE_FEE = 5;
const BOOKING_SELECTED_GALLONS = {
  '0-5': 5,
  '5-10': 10,
  '10-15': 15,
  '15-20': 20,
  '20-25': 25,
  '25+': 40,
};
const BOOKING_FUEL_AUTHORIZATION_GALLONS = {
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

function bookingNeedsFuel(serviceType) {
  return ['fuel', 'fuel-only', 'car-wash-fuel'].includes(serviceType);
}

function bookingNeedsWash(serviceType) {
  return ['wash', 'wash-only', 'car-wash', 'car-wash-fuel'].includes(serviceType);
}

function calculateBookingAuthorization(row, opts = {}) {
  const needsFuel = bookingNeedsFuel(row.service_type);
  const needsWash = bookingNeedsWash(row.service_type);
  const fuelGallons = needsFuel ? BOOKING_FUEL_AUTHORIZATION_GALLONS[row.estimated_fuel_range] || 0 : 0;
  const pricePerGallon = Number(row.price_per_gallon) > 0 ? Number(row.price_per_gallon) : BOOKING_PRICE_PER_GALLON;
  const fuelEstimate = roundMoney(fuelGallons * pricePerGallon);
  // All fees/prices come from the DB settings (so an admin change in the Services
  // tab reflects here too); fall back to the constants if the read failed. These
  // MUST match what the client read or the price-match check rejects the booking.
  const s = opts.settings || {};
  const num = (v, d) => (v != null && Number.isFinite(Number(v)) ? Number(v) : d);
  const washBase = needsWash ? (BOOKING_WASH_PACKAGES[row.wash_package] || null) : null;
  const washPackage = washBase ? { label: washBase.label, price: num(s.washPrices && s.washPrices[row.wash_package], washBase.price) } : null;
  const washAmount = washPackage ? washPackage.price : 0;
  let fuelBaseFee = needsFuel ? num(s.fuelServiceFee, BOOKING_FUEL_SERVICE_FEE) : 0;
  let washBaseFee = needsWash ? num(s.washServiceFee, BOOKING_CAR_WASH_SERVICE_FEE) : 0;
  const quickFee = row.quick_inspection ? num(s.quickInspectionFee, BOOKING_QUICK_CARE_FEE) : 0;
  // Fuel + Wash bundle: when both services are booked and the bundled fuel + wash
  // fees beat the two full fees, the customer pays the bundled fees instead. MUST
  // mirror booking-flow.js calculateTotals or the price-match rejects the booking
  // ("Payment total changed").
  const bundleFuelFee = num(s.bundleFuelFee, 0);
  const bundleWashFee = num(s.bundleWashFee, 0);
  const bundleSum = bundleFuelFee + bundleWashFee;
  const bundleFullFee = fuelBaseFee + washBaseFee;
  if (needsFuel && needsWash && bundleSum > 0 && bundleSum < bundleFullFee) {
    fuelBaseFee = roundMoney(bundleFuelFee);
    washBaseFee = roundMoney(bundleWashFee);
  }
  // "Customer choice" gas-station distance surcharge — server-authoritative,
  // never trusted from the client. Folded into the net so it grosses up like
  // every other line item.
  const stationSurcharge = roundMoney(opts.stationSurcharge || 0);
  // "Customer choice" car-wash distance charge — server-authoritative, computed
  // from the fixed wash facility (see _wash-distance). Folded into the net like
  // the gas surcharge so it grosses up the same way.
  const washSurcharge = needsWash ? roundMoney(opts.washSurcharge || 0) : 0;
  // Service-time cost — same DB rates / gallon map / rounding as the client.
  const timeRate = num(s.timeRatePerMin, 0);
  const selectedGallons = needsFuel ? (BOOKING_SELECTED_GALLONS[row.estimated_fuel_range] || 0) : 0;
  const fuelTimeCost = roundMoney((needsFuel ? (num(s.fuelTimeBaseMin, 3) + num(s.fuelTimePerGalMin, 0.5) * selectedGallons) : 0) * timeRate);
  const washTimeCost = roundMoney((needsWash ? num(s.washTimeMin, 20) : 0) * timeRate);
  const timeCost = roundMoney(fuelTimeCost + washTimeCost);
  const netTarget = roundMoney(fuelEstimate + washAmount + fuelBaseFee + washBaseFee + quickFee + stationSurcharge + washSurcharge + timeCost);

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
    fuelFee: roundMoney(fuelBaseFee + fuelRecovery + fuelTimeCost),
    washFee: roundMoney(washBaseFee + washRecovery + washTimeCost),
    recovery,
    netTarget,
    grossBeforeRounding,
    estimatedTotal,
    timeCost,
  };
}

// All pricing settings from the DB, so the server price matches the client (which
// reads the same row) and any Services-tab change reflects everywhere. Falls back to
// the booking constants if the read fails or columns aren't there yet.
async function getServerPricingSettings(db) {
  const fallback = {
    fuelServiceFee: BOOKING_FUEL_SERVICE_FEE,
    washServiceFee: BOOKING_CAR_WASH_SERVICE_FEE,
    quickInspectionFee: BOOKING_QUICK_CARE_FEE,
    washPrices: {
      'buff-shine': BOOKING_WASH_PACKAGES['buff-shine'].price,
      'shine-protect': BOOKING_WASH_PACKAGES['shine-protect'].price,
      shine: BOOKING_WASH_PACKAGES.shine.price,
      'double-wash': BOOKING_WASH_PACKAGES['double-wash'].price,
    },
    timeRatePerMin: 0, fuelTimeBaseMin: 3, fuelTimePerGalMin: 0.5, washTimeMin: 20,
    bundleFuelFee: 0, bundleWashFee: 0, mileageRatePerMile: 0.725,
  };
  try {
    const { data } = await db.from('service_pricing_settings')
      .select('fuel_service_fee,wash_service_fee,quick_inspection_fee,wash_buff_shine_price,wash_shine_protect_price,wash_shine_price,wash_double_wash_price,time_rate_per_min,fuel_time_base_min,fuel_time_per_gallon_min,wash_time_min,bundle_fuel_service_fee,bundle_wash_service_fee,wash_detour_rate')
      .eq('id', 1).maybeSingle();
    if (!data) return fallback;
    const n = (v, d) => (v != null && Number.isFinite(Number(v)) ? Number(v) : d);
    return {
      fuelServiceFee: n(data.fuel_service_fee, BOOKING_FUEL_SERVICE_FEE),
      washServiceFee: n(data.wash_service_fee, BOOKING_CAR_WASH_SERVICE_FEE),
      quickInspectionFee: n(data.quick_inspection_fee, BOOKING_QUICK_CARE_FEE),
      washPrices: {
        'buff-shine': n(data.wash_buff_shine_price, fallback.washPrices['buff-shine']),
        'shine-protect': n(data.wash_shine_protect_price, fallback.washPrices['shine-protect']),
        shine: n(data.wash_shine_price, fallback.washPrices.shine),
        'double-wash': n(data.wash_double_wash_price, fallback.washPrices['double-wash']),
      },
      timeRatePerMin: n(data.time_rate_per_min, 0),
      fuelTimeBaseMin: n(data.fuel_time_base_min, 3),
      fuelTimePerGalMin: n(data.fuel_time_per_gallon_min, 0.5),
      washTimeMin: n(data.wash_time_min, 20),
      bundleFuelFee: n(data.bundle_fuel_service_fee, 0),
      bundleWashFee: n(data.bundle_wash_service_fee, 0),
      mileageRatePerMile: n(data.wash_detour_rate, 0.725),
    };
  } catch (_) {
    return fallback;
  }
}

function receiptTotalsFromNotes(notes) {
  const matches = Array.from(String(notes || '').matchAll(/\[receipt_totals fuel=([0-9.]+) wash=([0-9.]+)\]/g));
  const latest = matches.at(-1);

  return {
    fuel: latest ? Number(latest[1]) || 0 : 0,
    wash: latest ? Number(latest[2]) || 0 : 0,
  };
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

  // Best-effort: stamp GPS-verified driven mileage + route for payroll/proof.
  // Idempotent (one Map Matching call per job) and fully swallowed — mileage
  // proof must never affect completion or payment capture.
  try {
    await recordDrivenMileage({ supabaseAdmin: db, requestId });
  } catch (_) { /* proof only — ignore */ }
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

// ── Pending-authorization tracking ──────────────────────────────────────────
// Best-effort bookkeeping of holds that exist in Stripe but have no booking yet.
// Every helper swallows its own errors: tracking must NEVER break the payment
// flow it is observing.
async function recordPendingAuthorization(fields) {
  try {
    const db = getSupabaseAdmin();
    await db.from('pending_authorizations').upsert({
      payment_intent_id: fields.payment_intent_id,
      client_secret:     fields.client_secret || null,
      amount_cents:      Math.round(Number(fields.amount_cents) || 0),
      customer_name:     fields.customer_name || null,
      customer_email:    fields.customer_email || null,
      service_label:     fields.service_label || null,
      status:            'pending',
      reason:            null,
      resolved_at:       null,
    }, { onConflict: 'payment_intent_id' });
  } catch (err) {
    console.warn('[pending_auth] record failed:', err.message);
  }
}

async function resolvePendingAuthorization(paymentIntentId, status, reason) {
  if (!paymentIntentId) return;
  try {
    const db = getSupabaseAdmin();
    await db.from('pending_authorizations')
      .update({ status, reason: reason || null, resolved_at: new Date().toISOString() })
      .eq('payment_intent_id', paymentIntentId);
  } catch (err) {
    console.warn('[pending_auth] resolve failed:', err.message);
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
    // Do NOT request card "flexible payments" features (e.g.
    // request_incremental_authorization). This account isn't enabled for them, and
    // even `'if_available'` poisons the PaymentIntent so the client-side confirm
    // fails with "not eligible for the requested card features" (the create itself
    // succeeds, so a server retry never sees it). Plain manual-capture holds work;
    // the optional top-up at capture (tryIncrementAuthorization) already degrades
    // gracefully when incremental auth isn't available.
    const paymentIntentParams = {
      amount: parsedCents,
      currency: 'usd',
      capture_method: 'manual',
      description: service_label || 'ShiftFuel service',
      receipt_email: customer_email || undefined,
      metadata: { customer_name: customer_name || '', service_label: service_label || '' },
    };
    const pi = await stripe.paymentIntents.create(paymentIntentParams);
    console.log('[payments/create_intent] Created', pi.id, 'amount:', parsedCents);
    await recordPendingAuthorization({
      payment_intent_id: pi.id,
      client_secret: pi.client_secret,
      amount_cents: parsedCents,
      customer_name,
      customer_email,
      service_label,
    });
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
  'address_lat', 'address_lon',
  'address_validation_status',
  // Chosen gas station (descriptive fields are safe to persist from the client;
  // the surcharge itself is recomputed server-side, never trusted here).
  'gas_station_name', 'gas_station_address', 'gas_station_lat', 'gas_station_lon',
  'parking_location', 'parking_spot', 'parking_map_url', 'key_handoff_details',
  'special_instructions',
  'service_type', 'service_label', 'service_date', 'desired_return_time', 'desired_pickup_time',
  'fuel_type', 'estimated_fuel_range', 'estimated_gallons', 'selected_fuel_gallons', 'authorization_fuel_gallons', 'price_per_gallon', 'estimated_fuel_amount',
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

  await Promise.all([saveAddressSnapshot(db, row, customerPhone, customerEmail), saveVehicleSnapshot(db, row, customerPhone, customerEmail)]);
}

async function saveAddressSnapshot(db, row, customerPhone, customerEmail) {
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
}

async function saveVehicleSnapshot(db, row, customerPhone, customerEmail) {
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

// Stamp the server-computed pricing onto a booking row. Shared by the
// immediate-hold (create_authorized_booking) and save-card (create_scheduled_booking)
// paths so the two can never drift apart.
function assignServerPricingFields(row, serverPricing) {
  row.estimated_total = serverPricing.estimatedTotal;
  row.final_total = null;
  // authorized_amount is audit-only — always the server-computed amount, never
  // trusted from the client even though it's in ALLOWED_BOOKING_FIELDS.
  row.authorized_amount = serverPricing.estimatedTotal;
  row.estimated_gallons = serverPricing.fuelGallons;
  row.authorization_fuel_gallons = serverPricing.fuelGallons;
  row.selected_fuel_gallons = BOOKING_SELECTED_GALLONS?.[row.estimated_fuel_range] || row.selected_fuel_gallons || serverPricing.fuelGallons;
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
  // Freeze the server-computed time charge into the notes so completion captures it
  // (worker.js frozenTimeCharge). Strip any client-sent tag and write ours, so the
  // captured amount can never exceed/undershoot what was authorized here.
  row.notes = String(row.notes || '').replace(/\s*\[time_charge [\d.]+\]/g, '').trim();
  if (Number(serverPricing.timeCost) > 0) {
    row.notes = [row.notes, `[time_charge ${Number(serverPricing.timeCost).toFixed(2)}]`].filter(Boolean).join(' ');
  }
  row.parking_spot = row.parking_spot || row.parking_location || 'See parking location';
  row.key_handoff_method = row.key_handoff_method || row.key_handoff_details || 'See key handoff details';
}

// Resolve the authoritative gas-station distance surcharge for a booking. The
// chosen station's coords come from the client; we recompute the dollar amount
// server-side from real driving distances so it can't be understated. If Mapbox
// is unreachable at booking time we fall back to the client's quoted figure but
// clamp it to a sane ceiling so the fallback can't be abused.
async function resolveStationSurcharge(body) {
  const chosenLat = Number(body.gas_station_lat);
  const chosenLon = Number(body.gas_station_lon);
  const hasChosen = Number.isFinite(chosenLat) && Number.isFinite(chosenLon) && (chosenLat !== 0 || chosenLon !== 0);
  if (!hasChosen) return { surcharge: 0, extra_round_trip_miles: 0 };

  try {
    const result = await computeSurchargeForChosen({
      serviceLat: Number(body.address_lat),
      serviceLon: Number(body.address_lon),
      chosenLat,
      chosenLon,
    });
    return { surcharge: roundMoney(result.surcharge), extra_round_trip_miles: roundMoney(result.extra_round_trip_miles || 0) };
  } catch (err) {
    const clientSurcharge = roundMoney(body.gas_station_surcharge || 0);
    const clamped = Math.min(clientSurcharge, PER_MILE_RATE * 200); // ≤ $150
    console.warn('[payments] station surcharge recompute failed; using clamped client value:', clamped, err.message);
    return { surcharge: roundMoney(clamped), extra_round_trip_miles: 0 };
  }
}

// Authoritative car-wash distance charge for a booking. Recomputed server-side
// from the fixed wash facility (shared with the customer's quote) so it can't be
// faked. On a Mapbox/geocode outage, fall back to the client's quoted value,
// clamped, so a transient failure can't block an otherwise-valid booking.
async function resolveWashSurcharge(body, row) {
  if (!bookingNeedsWash(row.service_type)) return { surcharge: 0 };
  try {
    const result = await computeWashDistanceCharge({
      serviceLat: Number(body.address_lat),
      serviceLon: Number(body.address_lon),
      gasLat: Number(body.gas_station_lat),
      gasLon: Number(body.gas_station_lon),
      needsFuel: bookingNeedsFuel(row.service_type),
    });
    return { surcharge: roundMoney(result.surcharge) };
  } catch (err) {
    const clientValue = roundMoney(body.wash_distance_surcharge || 0);
    const clamped = Math.min(clientValue, PER_MILE_RATE * 200); // ≤ $150 ceiling
    console.warn('[payments] wash surcharge recompute failed; using clamped client value:', clamped, err.message);
    return { surcharge: roundMoney(clamped) };
  }
}

// Booking-duration estimate, mirroring the client's estimateBookingMinutes (and
// worker.js workerEstimatedMinutes): drive to site + find car + round-trip
// station/wash legs (from the [station_miles]/[wash_miles] note stamps) + quick
// care. Used only to size the capacity re-check block.
function estimateJobMinutes(row) {
  const notes = String(row.notes || '');
  const st = String(row.service_type || '');
  const stationOne = /fuel/.test(st) ? Number((notes.match(/\[station_miles (\d+(?:\.\d+)?)\]/) || [])[1] || 0) : 0;
  const washOne = /wash/.test(st) ? Number((notes.match(/\[wash_miles (\d+(?:\.\d+)?)\]/) || [])[1] || 0) : 0;
  const driveLegs = ((stationOne * 2 + washOne * 2) / 30) * 60; // legs at ~30 mph
  const quick = row.quick_inspection ? 10 : 0;
  return Math.round(10 + 5 + driveLegs + quick);
}

// Capacity race guard. Re-checks the chosen return time against the SAME RPC the
// booking client used to offer it. Returns { ok:false } ONLY when the RPC
// successfully returns a non-empty slot list that no longer contains the chosen
// time (a real capacity change since the customer picked it). Fails OPEN on every
// uncertainty — missing fields, missing/erroring RPC, empty list, any exception —
// so this guard can never break a booking, only catch a genuine overbook race.
async function capacityStillAvailable(db, row) {
  try {
    const date = row.service_date;
    const ret = String(row.desired_return_time || '').slice(0, 5);
    if (!date || !ret) return { ok: true };
    const { data, error } = await db.rpc('public_capacity_return_slots', {
      p_service_date: date,
      p_duration_minutes: estimateJobMinutes(row),
      p_pickup_time: row.desired_pickup_time || null,
    });
    if (error || !Array.isArray(data) || data.length === 0) return { ok: true };
    const open = new Set(data.map((r) => String(r.slot || '').slice(0, 5)).filter(Boolean));
    if (open.has(ret)) return { ok: true };
    return { ok: false, message: 'That return time was just taken while you were booking. Please go back and choose another time.' };
  } catch (e) {
    return { ok: true };
  }
}

// Insert a service_requests row, retrying once per optional column that a given
// deployment hasn't migrated yet. Returns the inserted row, or throws an Error
// whose .userMessage is safe to surface to the client. Shared by both booking paths.
async function insertBookingWithColumnRetry(db, row, logTag) {
  // Last-moment capacity re-check (fail-open) so two customers can't both grab
  // the final unit of a slot between offer and submit.
  const cap = await capacityStillAvailable(db, row);
  if (!cap.ok) {
    throw Object.assign(new Error('CAPACITY_TAKEN'), { userMessage: cap.message });
  }
  const maxInsertAttempts = Object.keys(row).length + 5;
  for (let attempt = 0; attempt < maxInsertAttempts; attempt += 1) {
    const { data, error } = await db.from('service_requests').insert(row).select().maybeSingle();
    if (!error) return data;

    const message = String(error.message || '');
    // Returning customers can submit a vehicle_id/customer_id from the saved
    // snapshot tables that don't reference a real vehicles/users row → FK
    // violation. Treat that like a missing value: drop the bad ids and create
    // fresh legacy rows, then retry.
    const fkViolation = error.code === '23503' || /foreign key constraint/i.test(message);
    const fkOnUserOrVehicle = fkViolation && /(user_id|vehicle_id)/i.test(message);
    if (/null value in column "(user_id|vehicle_id)"/i.test(message) || fkOnUserOrVehicle) {
      if (fkOnUserOrVehicle) { delete row.user_id; delete row.vehicle_id; }
      const attached = await attachLegacyUserAndVehicle(db, row);
      if (attached) {
        console.warn(`[payments/${logTag}] Attached legacy user/vehicle rows and retrying insert`);
        continue;
      }
    }
    // A stale customer_id from the returning-customer snapshot can also fail its
    // FK. It's optional metadata — drop it and retry.
    if (fkViolation && /customer_id/i.test(message) && Object.prototype.hasOwnProperty.call(row, 'customer_id')) {
      console.warn(`[payments/${logTag}] Dropping invalid customer_id and retrying`);
      delete row.customer_id;
      continue;
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
      console.error(`[payments/${logTag}] DB insert failed:`, {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      });
      throw Object.assign(new Error('DB_INSERT_FAILED'), { userMessage: 'We could not finish saving your booking. Please try again or contact ShiftFuel.' });
    }

    console.warn(`[payments/${logTag}] Dropping unsupported optional column and retrying:`, column);
    delete row[column];
  }
  throw Object.assign(new Error('DB_INSERT_RETRIES_EXHAUSTED'), { userMessage: 'We could not finish saving your booking. Please try again or contact ShiftFuel.' });
}

// Validate a promo (if the booking carries one) against the server-recomputed
// service fees. Returns { error } to reject, or { discountCents, promoContext }
// (discountCents 0 / promoContext null when there's no code).
async function resolveBookingPromo(db, body, row, serverPricing) {
  if (!body.promo_code) return { discountCents: 0, promoContext: null };
  const amounts = amountsFromRow(row);
  amounts.total = Number(body.promo_order_total) || (serverPricing.amount_cents / 100);
  const result = await validatePromoForCustomer({
    db,
    code: body.promo_code,
    phone: row.customer_phone,
    email: row.customer_email,
    amounts,
    isAccount: !!row.customer_id,
    customerId: row.customer_id || '',
    serviceType: row.service_type || '',
  });
  if (!result.ok) {
    return { error: `Promo code ${String(body.promo_code).toUpperCase()}: ${result.reason} Please re-check your total before booking.` };
  }
  return { discountCents: Math.round(result.discount * 100), promoContext: result };
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
  // Blank pickup time = flexible; never send "" to the `time` column.
  if (!row.desired_pickup_time) delete row.desired_pickup_time;

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

  // Server-side service-area guard (defense-in-depth — the browser validator can
  // be bypassed). Fail-open only when coordinates can't be resolved at all, so a
  // transient geocode outage never blocks an otherwise-valid booking.
  const areaVerdict = await verifyServiceArea({
    lat: body.address_lat, lon: body.address_lon,
    street: row.address_street, city: row.address_city, state: row.address_state, zip: row.address_zip,
  });
  if (areaVerdict.checked && !areaVerdict.inArea) {
    console.warn('[payments/create_authorized_booking] Rejected out-of-area booking:', areaVerdict.distanceMiles, 'mi via', areaVerdict.method);
    return res.status(400).json({ error: 'We currently do not serve this area.' });
  }

  const expectedCents = Math.round(Number(amount_cents));
  if (!expectedCents || expectedCents < 50) {
    return res.status(400).json({ error: 'Amount must be at least $0.50' });
  }

  const station = await resolveStationSurcharge(body);
  const washCharge = await resolveWashSurcharge(body, row);
  const settings = await getServerPricingSettings(getSupabaseAdmin());
  const serverPricing = calculateBookingAuthorization(row, { stationSurcharge: station.surcharge, washSurcharge: washCharge.surcharge, settings });
  if (!serverPricing.valid) {
    return res.status(400).json({ error: serverPricing.error });
  }
  const db = getSupabaseAdmin();
  const promoResolve = await resolveBookingPromo(db, body, row, serverPricing);
  if (promoResolve.error) return res.status(409).json({ error: promoResolve.error });
  // The hold may equal the full total (promo applied AFTER authorizing) or the
  // discounted total (promo applied before) — accept either. The discount is
  // re-applied authoritatively at final capture, so a higher hold just means the
  // extra is released when we capture the (lower) discounted final.
  if (serverPricing.amount_cents !== expectedCents
      && serverPricing.amount_cents - promoResolve.discountCents !== expectedCents) {
    console.error('[payments/create_authorized_booking] Server total mismatch:', serverPricing.amount_cents, 'vs client', expectedCents, {
      service_type: row.service_type,
      estimated_fuel_range: row.estimated_fuel_range,
      wash_package: row.wash_package,
      quick_inspection: row.quick_inspection,
      station_surcharge: station.surcharge,
      promo_discount_cents: promoResolve.discountCents,
    });
    return res.status(400).json({ error: 'Payment total changed. Please review the payment authorization and try again.' });
  }
  row.gas_station_surcharge = station.surcharge;
  row.gas_station_extra_miles = station.extra_round_trip_miles;

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
  assignServerPricingFields(row, serverPricing);
  if (promoResolve.promoContext) {
    row.promo_code = promoResolve.promoContext.promo.code;
    row.promo_discount = promoResolve.promoContext.discount;
  }

  let data;
  try {
    data = await insertBookingWithColumnRetry(db, row, 'create_authorized_booking');
  } catch (err) {
    return res.status(500).json({ error: err.userMessage || 'We could not finish saving your booking after payment authorization. Please try again or contact ShiftFuel.' });
  }

  console.log('[payments/create_authorized_booking] Created request', data?.id, 'for PI', intent.id);
  if (promoResolve.promoContext && data?.id) {
    await recordPromoRedemption({ db, promo: promoResolve.promoContext.promo, requestId: data.id, phone: row.customer_phone, email: row.customer_email, discount: promoResolve.promoContext.discount });
  }
  // Resolve the tracked hold to 'booked' so it drops off the admin "Incomplete
  // authorizations" card. Best-effort and self-swallowing.
  resolvePendingAuthorization(intent.id, 'booked', null).catch(() => {});
  // Best-effort snapshot save; never delay the confirmation the customer waits on.
  saveReusableBookingSnapshots(db, row).catch((snapshotErr) => {
    console.warn('[payments/create_authorized_booking] Snapshot save failed:', snapshotErr.message);
  });
  return res.status(200).json({ id: data?.id, status: 'request_received', payment_status: 'authorized' });
}

// ── Save-card flow for advance bookings ─────────────────────────────────────
// A manual-capture hold expires in ~7 days, so for bookings more than a few days
// out we save the card now (no money moved) and let the daily cron place the real
// hold ~2 days before the service date. See 202606241500_scheduled_card_auth.sql.

// Step 1: create (or reuse) a Stripe Customer keyed by email and a SetupIntent so
// the browser can confirm + save the card off_session. No hold, no booking yet.
async function handleCreateSetupIntent(body, res) {
  const { customer_name, customer_email, customer_phone, service_label } = body;
  const email = String(customer_email || '').trim();
  if (!email) return res.status(400).json({ error: 'Email is required to save a card.' });

  try {
    const stripe = getStripe();

    let customer = null;
    try {
      const existing = await stripe.customers.list({ email, limit: 1 });
      customer = existing.data && existing.data[0];
    } catch (lookupErr) {
      console.warn('[payments/create_setup_intent] customer lookup failed:', lookupErr.message);
    }
    if (!customer) {
      customer = await stripe.customers.create({
        email,
        name: customer_name || undefined,
        phone: customer_phone || undefined,
        metadata: { service_label: service_label || '' },
      });
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      usage: 'off_session',
      payment_method_types: ['card'],
      metadata: { customer_name: customer_name || '', service_label: service_label || '' },
    });

    console.log('[payments/create_setup_intent] Created', setupIntent.id, 'for customer', customer.id);
    return res.status(200).json({ client_secret: setupIntent.client_secret, customer_id: customer.id });
  } catch (err) {
    console.error('[payments/create_setup_intent] Stripe error:', err.message);
    return res.status(500).json({ error: 'Could not initialize card setup. Please try again.' });
  }
}

// Step 2: after the browser confirms the SetupIntent, verify it, attach the saved
// payment method to the customer, and create the request in 'payment_scheduled'
// state with NO hold. The Stripe IDs go in the service-role-only side table.
async function handleCreateScheduledBooking(body, res) {
  // Note: the app's customer_id (a UUID) stays in rawFields → the booking row.
  // The Stripe customer comes from the SetupIntent below, never from the client.
  const { setup_intent_id, amount_cents, ...rawFields } = body;

  if (!setup_intent_id) return res.status(400).json({ error: 'setup_intent_id is required' });

  const row = {};
  for (const field of ALLOWED_BOOKING_FIELDS) {
    if (rawFields[field] !== undefined) row[field] = rawFields[field];
  }
  // Blank pickup time = flexible; never send "" to the `time` column.
  if (!row.desired_pickup_time) delete row.desired_pickup_time;

  if (!row.customer_name || !String(row.customer_name).trim()) return res.status(400).json({ error: 'Customer name is required' });
  if (!row.customer_phone || !String(row.customer_phone).trim()) return res.status(400).json({ error: 'Customer phone is required' });
  if (!row.customer_email || !String(row.customer_email).trim()) return res.status(400).json({ error: 'Customer email is required' });
  if (!ALLOWED_SERVICE_TYPES.includes(row.service_type)) return res.status(400).json({ error: 'Invalid service type' });
  if (!row.service_date || !String(row.service_date).trim()) return res.status(400).json({ error: 'Service date is required' });

  // Server-side service-area guard (see immediate-booking path for rationale).
  const areaVerdict = await verifyServiceArea({
    lat: body.address_lat, lon: body.address_lon,
    street: row.address_street, city: row.address_city, state: row.address_state, zip: row.address_zip,
  });
  if (areaVerdict.checked && !areaVerdict.inArea) {
    console.warn('[payments/create_scheduled_booking] Rejected out-of-area booking:', areaVerdict.distanceMiles, 'mi via', areaVerdict.method);
    return res.status(400).json({ error: 'We currently do not serve this area.' });
  }

  const expectedCents = Math.round(Number(amount_cents));
  if (!expectedCents || expectedCents < 50) return res.status(400).json({ error: 'Amount must be at least $0.50' });

  const station = await resolveStationSurcharge(body);
  const washCharge = await resolveWashSurcharge(body, row);
  const settings = await getServerPricingSettings(getSupabaseAdmin());
  const serverPricing = calculateBookingAuthorization(row, { stationSurcharge: station.surcharge, washSurcharge: washCharge.surcharge, settings });
  if (!serverPricing.valid) return res.status(400).json({ error: serverPricing.error });
  const db = getSupabaseAdmin();
  const promoResolve = await resolveBookingPromo(db, body, row, serverPricing);
  if (promoResolve.error) return res.status(409).json({ error: promoResolve.error });
  // Accept a hold equal to the full OR the discounted total (see immediate path).
  if (serverPricing.amount_cents !== expectedCents
      && serverPricing.amount_cents - promoResolve.discountCents !== expectedCents) {
    console.error('[payments/create_scheduled_booking] Server total mismatch:', serverPricing.amount_cents, 'vs client', expectedCents, { station_surcharge: station.surcharge, promo_discount_cents: promoResolve.discountCents });
    return res.status(400).json({ error: 'Payment total changed. Please review the booking and try again.' });
  }
  row.gas_station_surcharge = station.surcharge;
  row.gas_station_extra_miles = station.extra_round_trip_miles;

  // Verify the SetupIntent succeeded and pull the saved payment method.
  let setupIntent;
  try {
    const stripe = getStripe();
    setupIntent = await stripe.setupIntents.retrieve(setup_intent_id);
  } catch (err) {
    console.error('[payments/create_scheduled_booking] SetupIntent retrieve failed:', err.message);
    return res.status(400).json({ error: 'Your card could not be saved. Please try again.' });
  }
  if (!setupIntent || setupIntent.status !== 'succeeded' || !setupIntent.payment_method) {
    return res.status(400).json({ error: 'Your card could not be saved. Please try again.' });
  }

  const stripeCustomerId = (typeof setupIntent.customer === 'string' ? setupIntent.customer : setupIntent.customer?.id) || null;
  const stripePaymentMethodId = typeof setupIntent.payment_method === 'string' ? setupIntent.payment_method : setupIntent.payment_method.id;
  if (!stripeCustomerId || !stripePaymentMethodId) {
    return res.status(400).json({ error: 'Your card could not be saved. Please try again.' });
  }

  // Attach the PM to the customer and make it the default so the cron can charge
  // it off_session later. Best-effort: if it's already attached, ignore.
  try {
    const stripe = getStripe();
    try {
      await stripe.paymentMethods.attach(stripePaymentMethodId, { customer: stripeCustomerId });
    } catch (attachErr) {
      if (attachErr.code !== 'payment_method_already_attached' && !/already.*attached/i.test(String(attachErr.message || ''))) {
        throw attachErr;
      }
    }
    await stripe.customers.update(stripeCustomerId, {
      invoice_settings: { default_payment_method: stripePaymentMethodId },
    });
  } catch (err) {
    console.warn('[payments/create_scheduled_booking] PM attach/default skipped:', err.message);
  }

  row.status = 'request_received';
  row.payment_status = 'payment_scheduled';
  assignServerPricingFields(row, serverPricing);
  if (promoResolve.promoContext) {
    row.promo_code = promoResolve.promoContext.promo.code;
    row.promo_discount = promoResolve.promoContext.discount;
  }

  let data;
  try {
    data = await insertBookingWithColumnRetry(db, row, 'create_scheduled_booking');
  } catch (err) {
    return res.status(500).json({ error: err.userMessage || 'We could not finish saving your booking. Please try again or contact ShiftFuel.' });
  }
  if (promoResolve.promoContext && data?.id) {
    await recordPromoRedemption({ db, promo: promoResolve.promoContext.promo, requestId: data.id, phone: row.customer_phone, email: row.customer_email, discount: promoResolve.promoContext.discount });
  }

  // Persist the Stripe IDs in the service-role-only side table so the cron can
  // place the hold later. If this fails the request is unusable (no card on
  // file), so roll the request back and ask the customer to retry.
  const { error: pmErr } = await db.from('request_payment_methods').insert({
    request_id: data.id,
    stripe_customer_id: stripeCustomerId,
    stripe_payment_method_id: stripePaymentMethodId,
  });
  if (pmErr) {
    console.error('[payments/create_scheduled_booking] Could not store payment method, rolling back request', data.id, '-', pmErr.message);
    await db.from('service_requests').delete().eq('id', data.id);
    return res.status(500).json({ error: 'We could not finish saving your booking. Please try again or contact ShiftFuel.' });
  }

  console.log('[payments/create_scheduled_booking] Created scheduled request', data?.id, 'service_date', row.service_date);
  saveReusableBookingSnapshots(db, row).catch((snapshotErr) => {
    console.warn('[payments/create_scheduled_booking] Snapshot save failed:', snapshotErr.message);
  });
  return res.status(200).json({ id: data?.id, status: 'request_received', payment_status: 'payment_scheduled' });
}

// Customer re-authorizes a saved-card booking whose off-session hold failed
// (payment_status 'needs_reauth'). The browser places a fresh manual-capture hold
// on-session and posts its PaymentIntent here. Ownership is verified by phone+email.
async function handleCustomerReauthorizeScheduled(body, res) {
  const { request_id, phone, email, new_payment_intent_id } = body;
  if (!request_id || !phone || !email) return res.status(400).json({ error: 'request_id, phone, and email are required' });
  if (!new_payment_intent_id) return res.status(400).json({ error: 'new_payment_intent_id is required' });

  const db = getSupabaseAdmin();
  const { data: request, error: reqErr } = await db
    .from('service_requests')
    .select('id, customer_phone, customer_email, payment_status, status, estimated_total, payment_intent_id')
    .eq('id', request_id)
    .maybeSingle();
  if (reqErr || !request) return res.status(404).json({ error: 'Request not found' });

  const phoneMatch = cleanPhone(request.customer_phone) === cleanPhone(phone);
  const emailMatch = (request.customer_email || '').toLowerCase() === (email || '').toLowerCase();
  if (!phoneMatch || !emailMatch) return res.status(403).json({ error: 'Your phone and email do not match this request' });

  if (request.payment_status !== 'needs_reauth') {
    if (request.payment_status === 'authorized') return res.status(200).json({ status: 'already_authorized' });
    return res.status(400).json({ error: 'This request is not awaiting re-authorization.' });
  }

  const stripe = getStripe();
  let intent;
  try {
    intent = await stripe.paymentIntents.retrieve(new_payment_intent_id);
  } catch (err) {
    console.error('[payments/customer_reauthorize_scheduled] retrieve failed:', err.message);
    return res.status(400).json({ error: 'Payment authorization could not be verified. Please try again.' });
  }
  if (!intent || intent.status !== 'requires_capture' || intent.capture_method !== 'manual') {
    return res.status(400).json({ error: 'Payment authorization could not be verified. Please try again.' });
  }
  if (intent.currency !== 'usd') {
    return res.status(400).json({ error: 'Payment currency mismatch. Please contact ShiftFuel.' });
  }
  if (request.estimated_total == null) {
    return res.status(400).json({ error: 'This request has no amount to authorize. Please contact ShiftFuel.' });
  }
  if (intent.amount !== Math.round(Number(request.estimated_total) * 100)) {
    return res.status(400).json({ error: 'Authorization amount does not match. Please refresh and try again.' });
  }

  const { data: existingUse } = await db
    .from('service_requests')
    .select('id')
    .eq('payment_intent_id', new_payment_intent_id)
    .neq('id', request_id)
    .maybeSingle();
  if (existingUse) return res.status(400).json({ error: 'This payment is already applied to another request.' });

  const { error: updErr } = await db
    .from('service_requests')
    .update({ payment_status: 'authorized', payment_intent_id: new_payment_intent_id })
    .eq('id', request_id);
  if (updErr) {
    console.error('[payments/customer_reauthorize_scheduled] update failed:', updErr.message);
    return res.status(500).json({ error: `Authorization succeeded but we could not update the request. Contact ShiftFuel and reference ${request_id}.` });
  }

  // Clear the failed-auth marker on the side table (best-effort).
  db.from('request_payment_methods')
    .update({ auth_error: null, updated_at: new Date().toISOString() })
    .eq('request_id', request_id)
    .then(() => {}, () => {});

  console.log('[payments/customer_reauthorize_scheduled] Re-authorized request', request_id, 'PI', new_payment_intent_id);
  return res.status(200).json({ status: 'authorized' });
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
  // Worker has the vehicle and is en route to the service but HASN'T started it
  // yet — still cancelable (fee + costs).
  const feePlusCostsStatuses = [
    'vehicle_picked_up',
    'pickup_vehicle_photo_uploaded', 'pickup_odometer_photo_uploaded', 'pickup_fuel_gauge_photo_uploaded',
  ];
  // Service is actually underway (or done): once "Start service" is tapped it can't
  // be cancelled — the worker finishes it and the customer is charged for the
  // completed service. (Worker-side defers any in-flight return-request to here.)
  const serviceStartedBlocked = [
    'fueling_in_progress', 'car_wash_in_progress', 'service_in_progress', 'partial_service_complete',
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
  if (serviceStartedBlocked.includes(status)) {
    return { cancelable: false, message: "Your specialist has already started the service, so it can't be cancelled now. They'll finish it and you'll be charged for the completed service." };
  }
  if (noFeeStatuses.includes(status)) {
    // Canceled before any key handoff — nothing to return, fully closed.
    return { cancelable: true, tier: 'none', requiresKeyReturn: false, returnType: null, newStatus: 'cancelled' };
  }
  if (flatFeeStatuses.includes(status)) {
    // Key received but vehicle not yet picked up — worker must return the KEY.
    return { cancelable: true, tier: 'flat_fee', requiresKeyReturn: true, returnType: 'key', newStatus: 'cancelled_pending_key_return' };
  }
  if (feePlusCostsStatuses.includes(status)) {
    // Vehicle already picked up / service started — worker must return the VEHICLE.
    return { cancelable: true, tier: 'fee_plus_costs', requiresKeyReturn: true, returnType: 'vehicle', newStatus: 'cancelled_pending_key_return' };
  }
  return { cancelable: false, message: 'This request cannot be cancelled from Track right now. Please contact ShiftFuel.' };
}

// Single shared place the Stripe-fee-covering markup is computed for
// cancellations — never hard-code this math per call site.
function cancellationChargeForTier(tier, receiptTotals, recoverable = { mileage: 0, time: 0 }) {
  if (tier === 'none') {
    return { feeAmount: 0, mileageCost: 0, timeCost: 0, stripeFee: 0, receiptTotal: 0, totalCharged: 0 };
  }
  if (tier === 'flat_fee') {
    // Keys received but no driving yet — flat base fee only, nothing to recover.
    return { feeAmount: CANCELLATION_BASE_FEE, mileageCost: 0, timeCost: 0, stripeFee: 0, receiptTotal: 0, totalCharged: CANCELLATION_BASE_FEE };
  }
  // fee_plus_costs: vehicle picked up / en route. Recover the real sunk cost of the
  // aborted trip — the detour miles already driven and the time already spent —
  // on top of the base fee, then gross up for the Stripe fee like a normal charge.
  const receiptTotal = roundMoney((receiptTotals.fuel || 0) + (receiptTotals.wash || 0));
  const mileageCost = roundMoney(Math.max(0, (recoverable && recoverable.mileage) || 0));
  const timeCost = roundMoney(Math.max(0, (recoverable && recoverable.time) || 0));
  const subtotal = roundMoney(CANCELLATION_BASE_FEE + receiptTotal + mileageCost + timeCost);
  const totalCharged = Math.ceil((subtotal + RETURN_RECOVERY_FIXED) / (1 - RETURN_RECOVERY_RATE));
  const stripeFee = roundMoney(totalCharged - subtotal);
  return { feeAmount: CANCELLATION_BASE_FEE, mileageCost, timeCost, stripeFee, receiptTotal, totalCharged };
}

// One-way estimated detour legs stamped at booking; a conservative fallback for the
// sunk-cost calc when the live GPS trail is too thin to Map-Match. fuel →
// [station_miles], wash → [wash_miles].
function estimatedDetourMilesFromNotes(request) {
  const notes = String(request.notes || '');
  const st = String(request.service_type || '');
  const station = /fuel/.test(st) ? Number((notes.match(/\[station_miles (\d+(?:\.\d+)?)\]/) || [])[1] || 0) : 0;
  const wash = /wash/.test(st) ? Number((notes.match(/\[wash_miles (\d+(?:\.\d+)?)\]/) || [])[1] || 0) : 0;
  return (Number.isFinite(station) ? station : 0) + (Number.isFinite(wash) ? wash : 0);
}

// Real sunk cost for a post-pickup cancellation: miles the worker has driven SINCE
// pickup (GPS Map-Matched, estimated legs as fallback) × the worker mileage rate,
// plus minutes since pickup × the company time rate. Both inputs are clamped so bad
// GPS or clock skew can never balloon the charge. Never throws — returns zeros on any
// failure so a cancellation is never blocked by this.
async function computeCancellationSunkCost(db, request) {
  const meta = { miles: 0, minutes: 0, source: 'none' };
  try {
    const settings = await getServerPricingSettings(db);
    const mileageRate = settings.mileageRatePerMile || 0;
    const timeRate = settings.timeRatePerMin || 0;
    const pickupIso = request.vehicle_picked_up_at || null;

    // Minutes since pickup, clamped to a sane single-job ceiling.
    let minutes = 0;
    if (pickupIso) {
      const ms = Date.now() - new Date(pickupIso).getTime();
      if (Number.isFinite(ms) && ms > 0) minutes = Math.min(240, ms / 60000);
    }

    // Actual driven miles since pickup; fall back to the booking-time estimate.
    let miles = 0;
    const gps = await drivenMilesSoFar({ supabaseAdmin: db, requestId: request.id, sinceIso: pickupIso });
    if (Number.isFinite(gps) && gps > 0) {
      miles = gps;
      meta.source = 'gps';
    } else {
      miles = estimatedDetourMilesFromNotes(request);
      meta.source = miles > 0 ? 'estimate' : 'none';
    }
    miles = Math.min(100, Math.max(0, miles));

    meta.miles = Math.round(miles * 10) / 10;
    meta.minutes = Math.round(minutes);
    return { mileage: roundMoney(miles * mileageRate), time: roundMoney(minutes * timeRate), meta };
  } catch (err) {
    console.warn('[payments/customer_cancel] sunk-cost calc failed:', err && err.message);
    return { mileage: 0, time: 0, meta };
  }
}

async function handleCustomerCancel(body, res) {
  const { request_id, phone, email, reason } = body;

  if (!request_id || (!phone && !email)) {
    return res.status(400).json({ error: 'request_id and phone or email are required' });
  }

  const db = getSupabaseAdmin();
  const { data: request, error: reqErr } = await db
    .from('service_requests')
    .select('id, payment_intent_id, payment_status, status, customer_phone, customer_email, notes, assigned_employee_id, estimated_total, service_type, vehicle_picked_up_at')
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

  // Post-pickup cancellations recover the real sunk cost of the aborted trip (detour
  // miles already driven + time already spent). Earlier tiers have no trip to recover.
  let sunkCost = { mileage: 0, time: 0, meta: null };
  if (outcome.tier === 'fee_plus_costs') {
    sunkCost = await computeCancellationSunkCost(db, request);
  }
  const charge = cancellationChargeForTier(outcome.tier, receiptTotals, sunkCost);
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

  // Audit stamp for the recovered trip cost, so admin/payroll can see (and pay the
  // worker for) the aborted-trip mileage and time behind the higher charge.
  const meta = sunkCost.meta;
  const notesWithCancelCost = meta && (charge.mileageCost || charge.timeCost)
    ? `${String(request.notes || '')}\n[cancel_costs mileage=${charge.mileageCost} time=${charge.timeCost} miles=${meta.miles} mins=${meta.minutes} src=${meta.source}]`.trim()
    : null;

  // The authorization hold is held roughly at estimated_total; the reversal is
  // whatever isn't captured as the final cancellation charge.
  const heldAmount = Number(request.estimated_total);
  const finalChargeAmount = charge.totalCharged;
  const paymentReversalAmount = Number.isFinite(heldAmount)
    ? roundMoney(Math.max(0, heldAmount - finalChargeAmount))
    : null;

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
    // Spec-named fields (additive): explicit key/vehicle return contract + audit.
    key_return_required: outcome.returnType === 'key',
    vehicle_return_required: outcome.returnType === 'vehicle',
    cancellation_fee: charge.feeAmount,
    final_charge_amount: finalChargeAmount,
    payment_reversal_amount: paymentReversalAmount,
    payment_status: paymentStatus,
    updated_at: timestamp,
    ...(notesWithCancelCost ? { notes: notesWithCancelCost } : {}),
  };
  const minimalUpdateData = {
    status: outcome.newStatus,
    cancellation_reason: trimmedReason,
    canceled_at: timestamp,
    canceled_by: 'customer',
    payment_status: paymentStatus,
    updated_at: timestamp,
    ...(notesWithCancelCost ? { notes: notesWithCancelCost } : {}),
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
    charge: {
      fee_amount: charge.feeAmount,
      mileage_cost: charge.mileageCost || 0,
      time_cost: charge.timeCost || 0,
      stripe_fee: charge.stripeFee,
      receipt_total: charge.receiptTotal,
      total_charged: charge.totalCharged,
    },
  });
}

async function handleWorkerConfirmCancellationReturn(body, res) {
  // Either the assigned worker OR an admin may confirm the key/vehicle is back.
  const { worker_token, caller_token, request_id } = body;
  const token = worker_token || caller_token;

  if (!token || !request_id) {
    return res.status(400).json({ error: 'A staff token and request_id are required' });
  }

  const staff = await verifyAnyStaffToken(token);
  if (!staff) return res.status(401).json({ error: 'Invalid or expired staff session' });

  const db = getSupabaseAdmin();
  // Select '*' so the new key/vehicle-return flags are read when present without
  // erroring on databases where the migration has not run yet.
  const { data: request, error: reqErr } = await db
    .from('service_requests')
    .select('*')
    .eq('id', request_id)
    .maybeSingle();

  if (reqErr || !request) return res.status(404).json({ error: 'Request not found' });
  if (request.status !== 'cancelled_pending_key_return') {
    return res.status(400).json({ error: 'This request is not awaiting a key/vehicle return.' });
  }

  const timestamp = new Date().toISOString();
  // Which item is the worker returning? Prefer the explicit flag; fall back to
  // the legacy "requires key return" flag (key) when the new columns are absent.
  const returnedVehicle = request.vehicle_return_required === true;

  const updateData = {
    status: 'cancelled',
    cancelled_at: timestamp,
    cancellation_key_returned_at: timestamp,
    cancellation_status: 'cancelled',
    // Spec-named fields: stamp the actual return, clear the requirement, and
    // stop live tracking now that the key/vehicle is back with the customer.
    key_returned_at: returnedVehicle ? (request.key_returned_at || null) : timestamp,
    vehicle_returned_at: returnedVehicle ? timestamp : (request.vehicle_returned_at || null),
    key_return_required: false,
    vehicle_return_required: false,
    live_tracking_enabled: false,
    updated_at: timestamp,
  };
  const minimalUpdateData = {
    status: 'cancelled',
    cancelled_at: timestamp,
    cancellation_key_returned_at: timestamp,
    cancellation_status: 'cancelled',
    updated_at: timestamp,
  };

  let { error: updateErr } = await db.from('service_requests').update(updateData).eq('id', request_id);
  if (updateErr) {
    const missingOptionalColumn = updateErr.code === 'PGRST204'
      || updateErr.code === '42703'
      || /column|schema cache/i.test(String(updateErr.message || ''));
    if (missingOptionalColumn) {
      ({ error: updateErr } = await db.from('service_requests').update(minimalUpdateData).eq('id', request_id));
    }
  }

  if (updateErr) {
    console.error('[payments/worker_confirm_cancellation_return] DB update failed:', updateErr.message);
    return res.status(500).json({ error: 'Could not update the request. Please try again.' });
  }

  return res.status(200).json({ success: true, status: 'cancelled', returned: returnedVehicle ? 'vehicle' : 'key' });
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
  const { payment_intent_id, client_secret, reason } = body;

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
      await resolvePendingAuthorization(payment_intent_id, 'voided', reason || 'abandoned');
      return res.status(200).json({ status: 'already_canceled' });
    }
    if (intent.status === 'requires_capture') {
      const canceled = await stripe.paymentIntents.cancel(payment_intent_id);
      console.log('[payments/cancel_authorization] Canceled pre-booking authorization', payment_intent_id);
      await resolvePendingAuthorization(payment_intent_id, 'voided', reason || 'abandoned');
      return res.status(200).json({ status: canceled.status });
    }
    if (['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing'].includes(intent.status)) {
      const canceled = await stripe.paymentIntents.cancel(payment_intent_id);
      console.log('[payments/cancel_authorization] Canceled incomplete pre-booking authorization', payment_intent_id);
      await resolvePendingAuthorization(payment_intent_id, 'voided', reason || 'abandoned');
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
  const keyReturnLat = Number(body.key_return_lat);
  const keyReturnLng = Number(body.key_return_lng);
  const keyReturnCoords = Number.isFinite(keyReturnLat) && Number.isFinite(keyReturnLng) && (keyReturnLat || keyReturnLng)
    ? { key_return_lat: keyReturnLat, key_return_lng: keyReturnLng }
    : {};

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
      ...keyReturnCoords,
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
      ...keyReturnCoords,
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
      || /column|schema cache|captured_amount|cancellation_fee|actual_fuel|actual_car_wash|payment_operating|net_target|rounded_customer|key_return_lat|key_return_lng/i.test(String(error.message || ''))
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

  let { error: updateErr } = await db.from('service_requests').update({
    status: 'complete',
    key_returned_to_type,
    key_returned_to_name_or_location: returnedToName,
    key_returned_at: new Date().toISOString(),
    key_returned_by: key_returned_by || null,
    ...keyReturnCoords,
    updated_at: new Date().toISOString(),
  }).eq('id', request_id);

  if (updateErr && /column|schema cache|key_return_lat|key_return_lng/i.test(String(updateErr.message || ''))) {
    ({ error: updateErr } = await db.from('service_requests').update({
      status: 'complete',
      key_returned_to_type,
      key_returned_to_name_or_location: returnedToName,
      key_returned_at: new Date().toISOString(),
      key_returned_by: key_returned_by || null,
      updated_at: new Date().toISOString(),
    }).eq('id', request_id));
  }

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

// ── Admin: incomplete-authorization management ──────────────────────────────
async function handleAdminListPendingAuthorizations(body, res) {
  const { caller_token } = body;
  if (!caller_token) return res.status(401).json({ error: 'Authorization required' });
  const isAdmin = await verifyAdminToken(caller_token);
  if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('pending_authorizations')
    .select('payment_intent_id, amount_cents, customer_name, customer_email, service_label, reason, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[payments/admin_list_pending_authorizations] DB error:', error.message);
    return res.status(500).json({ error: 'Could not load incomplete authorizations.' });
  }

  const pending = data || [];
  if (!pending.length) return res.status(200).json({ authorizations: [] });

  // Defensive cross-check: this card is for holds that NEVER became a request.
  // markAuthorizationBooked() (in create-authorized-booking) is best-effort and
  // can miss — a deploy race, an alternate booking path, etc. — which would leave
  // the hold for a real, active booking stuck as 'pending' and showing here
  // forever. So recompute "incomplete" at read time: drop any hold whose payment
  // intent already has a service_requests row, and self-heal those stale rows to
  // 'booked' so they stop recomputing on every load.
  const intentIds = pending.map((r) => r.payment_intent_id).filter(Boolean);
  let bookedIds = new Set();
  if (intentIds.length) {
    const { data: reqs, error: reqErr } = await db
      .from('service_requests')
      .select('payment_intent_id')
      .in('payment_intent_id', intentIds);
    if (reqErr) {
      console.error('[payments/admin_list_pending_authorizations] request cross-check failed:', reqErr.message);
    } else {
      bookedIds = new Set((reqs || []).map((r) => r.payment_intent_id).filter(Boolean));
    }
  }

  const withoutBooking = pending.filter((r) => !bookedIds.has(r.payment_intent_id));

  if (bookedIds.size) {
    // Fire-and-forget self-heal; never block the response on it.
    db.from('pending_authorizations')
      .update({ status: 'booked', resolved_at: new Date().toISOString() })
      .in('payment_intent_id', [...bookedIds])
      .then(() => {}, (err) => console.warn('[pending_auth] self-heal failed:', err.message));
  }

  // Second cross-check against Stripe: a row only belongs on this card if its
  // intent is a REAL hold (requires_capture). create_intent records a pending
  // row the moment a PaymentIntent is created — before the card is confirmed —
  // so a customer who retried the "Authorize" step, changed the amount, or
  // bailed mid-checkout leaves behind intents that never became holds
  // (requires_payment_method / requires_confirmation / requires_action) and
  // hold no money. Those must not show as "$75 hold — Void hold". Verify each
  // surviving row (typically 0–2) and keep only genuine holds; self-heal the
  // dead ones so they stop reappearing. Fail open on transient Stripe errors so
  // a real hold is never hidden.
  const authorizations = [];
  const phantomIds = [];
  let stripe;
  try { stripe = getStripe(); } catch (_) { stripe = null; }

  for (const row of withoutBooking) {
    if (!stripe || !row.payment_intent_id) { authorizations.push(row); continue; }
    try {
      const intent = await stripe.paymentIntents.retrieve(row.payment_intent_id);
      if (intent.status === 'requires_capture') {
        authorizations.push(row);                         // real, uncaptured hold
      } else if (
        intent.status === 'requires_payment_method'
        || intent.status === 'requires_confirmation'
        || intent.status === 'canceled'
      ) {
        phantomIds.push(row.payment_intent_id);           // never a hold / dead — heal
      }
      // requires_action / processing / succeeded: don't show and don't heal —
      // let the existing flows (booking, capture, 24h cron) resolve them.
    } catch (err) {
      if (err.code === 'resource_missing') {
        phantomIds.push(row.payment_intent_id);           // intent gone — heal
      } else {
        console.warn('[payments/admin_list_pending_authorizations] Stripe verify failed; showing row:', row.payment_intent_id, err.message);
        authorizations.push(row);                         // fail open
      }
    }
  }

  if (phantomIds.length) {
    // Fire-and-forget; never block the response.
    db.from('pending_authorizations')
      .update({ status: 'voided', reason: 'abandoned', resolved_at: new Date().toISOString() })
      .in('payment_intent_id', phantomIds)
      .then(() => {}, (err) => console.warn('[pending_auth] phantom self-heal failed:', err.message));
  }

  return res.status(200).json({ authorizations });
}

// Admin: advance bookings whose off-session authorization failed and now need
// the customer to re-authorize. Reads from service_requests + the side table.
async function handleAdminListReauthNeeded(body, res) {
  const { caller_token } = body;
  if (!caller_token) return res.status(401).json({ error: 'Authorization required' });
  const isAdmin = await verifyAdminToken(caller_token);
  if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });

  const db = getSupabaseAdmin();
  const { data, error } = await db
    .from('service_requests')
    .select('id, customer_name, customer_email, service_label, service_date, estimated_total')
    .eq('payment_status', 'needs_reauth')
    .order('service_date', { ascending: true });

  if (error) {
    console.error('[payments/admin_list_reauth_needed] DB error:', error.message);
    return res.status(500).json({ error: 'Could not load authorizations needing action.' });
  }

  const rows = data || [];
  if (!rows.length) return res.status(200).json({ requests: [] });

  // Attach the last off-session error from the service-role-only side table.
  const errorsById = {};
  const { data: pms } = await db
    .from('request_payment_methods')
    .select('request_id, auth_error, auth_attempts')
    .in('request_id', rows.map((r) => r.id));
  for (const pm of pms || []) errorsById[pm.request_id] = pm;

  const requests = rows.map((r) => ({
    id: r.id,
    customer_name: r.customer_name,
    customer_email: r.customer_email,
    service_label: r.service_label,
    service_date: r.service_date,
    estimated_total: r.estimated_total,
    auth_error: errorsById[r.id]?.auth_error || null,
    auth_attempts: errorsById[r.id]?.auth_attempts || 0,
  }));

  return res.status(200).json({ requests });
}

// Admin: immediately re-attempt the off-session hold for a needs_reauth request
// (e.g. after the customer says they fixed their funds). Mirrors the cron pass.
async function handleAdminRetryScheduledAuth(body, res) {
  const { caller_token, request_id } = body;
  if (!caller_token) return res.status(401).json({ error: 'Authorization required' });
  const isAdmin = await verifyAdminToken(caller_token);
  if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });
  if (!request_id) return res.status(400).json({ error: 'request_id is required' });

  const db = getSupabaseAdmin();
  const { data: request, error } = await db
    .from('service_requests')
    .select('id, payment_status, estimated_total, service_date')
    .eq('id', request_id)
    .maybeSingle();
  if (error || !request) return res.status(404).json({ error: 'Request not found' });
  if (request.payment_status !== 'needs_reauth') {
    return res.status(400).json({ error: 'This request is not awaiting re-authorization.' });
  }

  const { data: pm } = await db
    .from('request_payment_methods')
    .select('stripe_customer_id, stripe_payment_method_id, auth_attempts')
    .eq('request_id', request_id)
    .maybeSingle();
  if (!pm || !pm.stripe_customer_id || !pm.stripe_payment_method_id) {
    return res.status(400).json({ error: 'No saved card on file — the customer must re-authorize.' });
  }

  const amountCents = Math.round(Number(request.estimated_total) * 100);
  if (!amountCents || amountCents < 50) return res.status(400).json({ error: 'Invalid amount on this request.' });

  const result = await placeScheduledHold({
    db,
    stripe: getStripe(),
    request,
    pm,
    idempotencyKey: `sched-auth-retry-${request_id}-${Date.now()}`,
  });

  if (result.status === 'authorized') {
    // service_requests + request_payment_methods already updated by the helper.
    return res.status(200).json({ status: 'authorized' });
  }

  if (result.piStatus) {
    // PI came back in a non-capture state — record it but don't bump the attempt
    // counter (matches the original behavior for this specific case).
    await db.from('request_payment_methods')
      .update({ auth_error: result.reason, updated_at: new Date().toISOString() })
      .eq('request_id', request_id);
    return res.status(409).json({ error: `Card still needs customer action (${result.piStatus}).` });
  }

  // Thrown card error or transient error — the original catch block handled both
  // identically: record the error, bump the attempt counter, and 409.
  await db.from('request_payment_methods')
    .update({ auth_error: String(result.reason), auth_attempts: (pm.auth_attempts || 0) + 1, updated_at: new Date().toISOString() })
    .eq('request_id', request_id);
  console.warn('[payments/admin_retry_scheduled_auth] retry failed for', request_id, '-', result.reason);
  return res.status(409).json({ error: `Could not authorize the saved card: ${result.reason}.` });
}

async function handleAdminVoidAuthorization(body, res) {
  const { caller_token, payment_intent_id } = body;
  if (!caller_token) return res.status(401).json({ error: 'Authorization required' });
  const isAdmin = await verifyAdminToken(caller_token);
  if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });
  if (!payment_intent_id) return res.status(400).json({ error: 'payment_intent_id is required' });

  try {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(payment_intent_id);
    if (intent.status !== 'canceled') {
      await stripe.paymentIntents.cancel(payment_intent_id);
      console.log('[payments/admin_void_authorization] Voided hold', payment_intent_id);
    }
    await resolvePendingAuthorization(payment_intent_id, 'voided', 'admin_voided');
    return res.status(200).json({ status: 'voided' });
  } catch (err) {
    // If Stripe says it's already in a terminal state, still mark it resolved so
    // it leaves the admin list rather than reappearing on every refresh.
    if (err.code === 'payment_intent_unexpected_state') {
      await resolvePendingAuthorization(payment_intent_id, 'voided', 'admin_voided');
      return res.status(200).json({ status: 'already_finalized' });
    }
    console.error('[payments/admin_void_authorization] Stripe error:', err.message);
    return res.status(500).json({ error: 'Could not void this authorization. Please check Stripe.' });
  }
}

// Admin login is folded into this router (instead of a separate api/admin-login.js)
// to stay under the Hobby-plan serverless-function limit. It's per-IP throttled via
// PAYMENTS_RATE_LIMITS['admin_login'] and mints the session through the
// service-role-only admin_create_session RPC (so the anon key can't brute force it).
async function handleAdminLogin(body, res) {
  const { username_hash, password_hash } = body;
  if (typeof username_hash !== 'string' || typeof password_hash !== 'string'
      || !username_hash || !password_hash) {
    return res.status(400).json({ error: 'Missing credentials' });
  }
  try {
    const db = getSupabaseAdmin();
    const { data: token, error } = await db.rpc('admin_create_session', {
      p_username_hash: username_hash,
      p_password_hash: password_hash,
    });
    if (error) {
      if ((error.message || '').includes('ACCOUNT_LOCKED')) return res.status(423).json({ error: 'ACCOUNT_LOCKED' });
      return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }
    if (!token) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    return res.status(200).json({ token });
  } catch (err) {
    console.error('[payments/admin_login] error:', err.message);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
}

// ── Main router ───────────────────────────────────────────────────────────────

const HANDLERS = {
  admin_login:                       handleAdminLogin,
  admin_list_pending_authorizations: handleAdminListPendingAuthorizations,
  admin_list_reauth_needed:          handleAdminListReauthNeeded,
  admin_retry_scheduled_auth:        handleAdminRetryScheduledAuth,
  admin_void_authorization:          handleAdminVoidAuthorization,
  create_intent:             handleCreateIntent,
  create_authorized_booking: handleCreateAuthorizedBooking,
  create_setup_intent:       handleCreateSetupIntent,
  create_scheduled_booking:  handleCreateScheduledBooking,
  customer_reauthorize_scheduled: handleCustomerReauthorizeScheduled,
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

  // The booking-creation actions call Mapbox (service-area + station surcharge)
  // before Stripe verification, so rate-limit them per IP to block abuse. The
  // cap is generous — a real customer never submits dozens of bookings a minute.
  const rl = PAYMENTS_RATE_LIMITS[action];
  if (rl && await enforceRateLimit(req, res, `payments:${action}`, rl)) return;

  try {
    const result = await handler(body, res);
    // Push after the handler has updated the DB (status-guarded inside
    // notifyRequest). AWAITED, not fire-and-forget: Vercel freezes the function
    // the instant it returns, so an un-awaited push usually never sends. The
    // handler already called res.json(), so the client isn't kept waiting.
    const pushEvent = PUSH_AFTER_ACTION[action];
    if (pushEvent && body.request_id) {
      try { await notifyRequest(body.request_id, pushEvent); }
      catch (e) { console.warn('[payments/push]', e.message); }
    }
    return result;
  } catch (err) {
    console.error(`[payments/${action}] Unhandled error:`, err.message);
    return res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
  }
};
