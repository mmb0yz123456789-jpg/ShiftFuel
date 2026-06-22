/**
 * /api/create-authorized-booking.js
 * Creates a service request from a Stripe manual-capture authorization.
 * This endpoint trusts the Stripe-verified authorized amount as the frozen quote,
 * instead of recalculating with current admin pricing after authorization.
 */

const Stripe = require('stripe');
const { setCorsHeaders, getSupabaseAdmin } = require('./_auth');

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured');
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function cleanPhone(value) {
  return String(value || '').replace(/\D/g, '');
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

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

const ALLOWED_BOOKING_FIELDS = [
  'customer_name', 'customer_phone', 'customer_email', 'customer_id',
  'vehicle_year', 'vehicle_make', 'vehicle_model', 'vehicle_color', 'license_plate', 'vehicle_id',
  'hospital', 'address_street', 'address_apt', 'address_city', 'address_state', 'address_zip', 'address_validation_status',
  'parking_location', 'parking_spot', 'parking_map_url', 'key_handoff_details', 'special_instructions',
  'service_type', 'service_label', 'service_date', 'desired_return_time',
  'fuel_type', 'estimated_fuel_range', 'estimated_gallons', 'selected_fuel_gallons', 'authorization_fuel_gallons',
  'price_per_gallon', 'estimated_fuel_amount', 'fuel_convenience_fee',
  'wash_package', 'wash_package_label', 'wash_fee', 'wash_convenience_fee',
  'quick_inspection', 'quick_inspection_fee', 'service_fee', 'estimated_total',
  'base_fuel_service_fee', 'base_car_wash_service_fee', 'base_inspection_fee',
  'payment_operating_recovery_amount', 'displayed_fuel_service_fee', 'displayed_car_wash_service_fee',
  'displayed_inspection_fee', 'net_target_amount', 'gross_total_before_rounding', 'rounded_customer_total',
  'authorized_amount', 'booking_source', 'notes',
];

const ALLOWED_SERVICE_TYPES = ['fuel', 'car-wash', 'car-wash-fuel', 'fuel-only', 'wash-only'];

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

  if (userErr || !user?.id) return false;
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

  if (vehicleErr || !vehicle?.id) return false;
  row.vehicle_id = vehicle.id;
  return true;
}

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
      const { data: existingAddress, error } = await db
        .from('saved_service_addresses')
        .select('id,customer_phone,address_street,hospital,address_apt,address_city,address_state,address_zip')
        .ilike('customer_email', customerEmail)
        .eq('is_active', true)
        .is('deleted_at', null);
      if (!error) {
        const normalizedPhone = cleanPhone(customerPhone);
        const duplicate = (existingAddress || []).filter((address) => cleanPhone(address.customer_phone) === normalizedPhone).find((address) => {
          return savedAddressTextKey(address.address_street || address.hospital) === savedAddressTextKey(addressPayload.address_street || addressPayload.hospital)
            && savedAddressTextKey(address.address_apt) === savedAddressTextKey(addressPayload.address_apt)
            && savedAddressTextKey(address.address_city) === savedAddressTextKey(addressPayload.address_city)
            && savedAddressStateKey(address.address_state) === savedAddressStateKey(addressPayload.address_state)
            && savedAddressZipKey(address.address_zip) === savedAddressZipKey(addressPayload.address_zip);
        });
        if (duplicate?.id) await db.from('saved_service_addresses').update(addressPayload).eq('id', duplicate.id);
        else await db.from('saved_service_addresses').insert(addressPayload);
      }
    } catch (error) {
      console.warn('[create-authorized-booking] address snapshot skipped:', error.message);
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
      const { data: existingVehicle, error } = await db
        .from('saved_customer_vehicles')
        .select('id,customer_phone,license_plate,vehicle_color')
        .ilike('customer_email', customerEmail)
        .eq('is_active', true)
        .is('deleted_at', null);
      if (!error) {
        const normalizedPhone = cleanPhone(customerPhone);
        const duplicate = (existingVehicle || []).filter((vehicle) => cleanPhone(vehicle.customer_phone) === normalizedPhone).find((vehicle) => {
          return savedVehiclePlateKey(vehicle.license_plate) === savedVehiclePlateKey(vehiclePayload.license_plate)
            && savedVehicleColorKey(vehicle.vehicle_color) === savedVehicleColorKey(vehiclePayload.vehicle_color);
        });
        if (duplicate?.id) await db.from('saved_customer_vehicles').update(vehiclePayload).eq('id', duplicate.id);
        else await db.from('saved_customer_vehicles').insert(vehiclePayload);
      }
    } catch (error) {
      console.warn('[create-authorized-booking] vehicle snapshot skipped:', error.message);
    }
  }
}

function buildBookingRow(body, intent) {
  const { amount_cents, ...rawFields } = body;
  const row = {};
  for (const field of ALLOWED_BOOKING_FIELDS) {
    if (rawFields[field] !== undefined) row[field] = rawFields[field];
  }

  const authorizedTotal = roundMoney(intent.amount / 100);
  row.status = 'request_received';
  row.payment_status = 'authorized';
  row.payment_intent_id = intent.id;
  row.final_total = null;
  row.estimated_total = authorizedTotal;
  row.authorized_amount = authorizedTotal;
  row.rounded_customer_total = authorizedTotal;

  // Preserve the frozen quote fields sent from the browser. Fill any missing totals from the authorized amount.
  row.gross_total_before_rounding = row.gross_total_before_rounding ?? authorizedTotal;
  row.net_target_amount = row.net_target_amount ?? authorizedTotal;
  row.service_fee = row.service_fee ?? roundMoney(Number(row.displayed_fuel_service_fee || 0) + Number(row.displayed_car_wash_service_fee || 0));
  row.parking_spot = row.parking_spot || row.parking_location || 'See parking location';
  row.key_handoff_method = row.key_handoff_method || row.key_handoff_details || 'See key handoff details';
  row.notes = [row.notes || '', `[quote_frozen ${new Date().toISOString()}] Authorized quote ${authorizedTotal.toFixed(2)}.`].filter(Boolean).join('\n');
  return row;
}

async function insertBookingRow(db, row) {
  const maxInsertAttempts = Object.keys(row).length + 5;
  for (let attempt = 0; attempt < maxInsertAttempts; attempt += 1) {
    const { data, error } = await db.from('service_requests').insert(row).select().maybeSingle();
    if (!error) return data;

    const message = String(error.message || '');
    if (/null value in column "(user_id|vehicle_id)"/i.test(message)) {
      const attached = await attachLegacyUserAndVehicle(db, row);
      if (attached) continue;
    }

    const column = message.match(/Could not find the '([^']+)' column/i)?.[1]
      || message.match(/column "([^"]+)" of relation/i)?.[1]
      || message.match(/record has no field "([^"]+)"/i)?.[1];
    if (column && Object.prototype.hasOwnProperty.call(row, column)) {
      delete row[column];
      continue;
    }
    throw error;
  }
  throw new Error('Could not create booking after retrying unsupported columns.');
}

module.exports = async function handler(req, res) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    const paymentIntentId = body.payment_intent_id;
    const expectedCents = Math.round(Number(body.amount_cents));

    if (!paymentIntentId) return res.status(400).json({ error: 'payment_intent_id is required' });
    if (!expectedCents || expectedCents < 50) return res.status(400).json({ error: 'Amount must be at least $0.50' });
    if (!body.customer_name || !String(body.customer_name).trim()) return res.status(400).json({ error: 'Customer name is required' });
    if (!body.customer_phone || !String(body.customer_phone).trim()) return res.status(400).json({ error: 'Customer phone is required' });
    if (!body.customer_email || !String(body.customer_email).trim()) return res.status(400).json({ error: 'Customer email is required' });
    if (!ALLOWED_SERVICE_TYPES.includes(body.service_type)) return res.status(400).json({ error: 'Invalid service type' });

    const stripe = getStripe();
    let intent;
    try {
      intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch (error) {
      console.error('[create-authorized-booking] Stripe retrieve failed:', error.message);
      return res.status(400).json({ error: 'Payment authorization could not be verified. Please try again.' });
    }

    if (!intent || intent.status === 'canceled' || intent.status === 'requires_payment_method') {
      return res.status(400).json({ error: 'Payment authorization could not be verified. Please try again.' });
    }
    if (intent.capture_method && intent.capture_method !== 'manual') {
      return res.status(400).json({ error: 'Payment authorization could not be verified. Please try again.' });
    }
    if (intent.status !== 'requires_capture') {
      return res.status(400).json({ error: 'Payment authorization could not be verified. Please try again.' });
    }
    if (intent.amount !== expectedCents) {
      console.error('[create-authorized-booking] Amount mismatch:', intent.amount, 'vs expected', expectedCents);
      return res.status(409).json({ error: 'The price changed before your request was submitted. Please re-authorize the updated total before booking.' });
    }

    const db = getSupabaseAdmin();
    const row = buildBookingRow(body, intent);
    const data = await insertBookingRow(db, row);
    try {
      await saveReusableBookingSnapshots(db, row);
    } catch (error) {
      console.warn('[create-authorized-booking] reusable snapshot skipped:', error.message);
    }

    console.log('[create-authorized-booking] Created request', data?.id, 'for PI', intent.id, 'amount', intent.amount);
    return res.status(200).json({ id: data?.id, status: 'request_received', payment_status: 'authorized' });
  } catch (error) {
    console.error('[create-authorized-booking] error:', error.message || error);
    return res.status(500).json({ error: 'Could not submit booking. Please try again.' });
  }
};
