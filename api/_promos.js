/**
 * /api/_promos.js
 *
 * Promo-code validation + discount math, shared by the public validate endpoint
 * (api/promos.js) and the authoritative booking re-price (create-authorized-
 * booking.js / payments.js create_authorized_booking).
 *
 * The discount only ever reduces SERVICE FEES (the convenience/service fees that
 * are our margin) — never the at-cost fuel. All validation is server-side so a
 * customer can't enumerate codes or fake "new customer" pricing.
 */

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

const APPLIES_TO = ['service_fees', 'wash_and_fees', 'total', 'fuel_service', 'wash_service', 'inspection'];

const num = (v) => Number(v) || 0;

// Pull the price breakdown a discount can target off a booking row. The same
// shape is sent by the browser for the live preview (api/promos validate).
function amountsFromRow(row) {
  return {
    fuel_service: num(row.displayed_fuel_service_fee ?? row.fuel_convenience_fee),
    wash_service: num(row.displayed_car_wash_service_fee ?? row.wash_convenience_fee),
    inspection: num(row.displayed_inspection_fee ?? row.quick_inspection_fee),
    wash_price: num(row.wash_fee ?? row.wash_amount), // car-wash package price
    total: num(row.promo_order_total ?? row.estimated_total ?? row.rounded_customer_total),
  };
}

// The dollar base a code's % / $ is computed against, per its applies_to mode.
function discountBase(appliesTo, a) {
  const fees = num(a.fuel_service) + num(a.wash_service) + num(a.inspection);
  switch (appliesTo) {
    case 'total':        return roundMoney(num(a.total));
    case 'wash_and_fees':return roundMoney(fees + num(a.wash_price));
    case 'fuel_service': return roundMoney(num(a.fuel_service));
    case 'wash_service': return roundMoney(num(a.wash_service));
    case 'inspection':   return roundMoney(num(a.inspection));
    case 'service_fees':
    default:             return roundMoney(fees);
  }
}

// Back-compat: service fees only.
function serviceFeesFromRow(row) {
  return discountBase('service_fees', amountsFromRow(row));
}

function computeDiscount(promo, base) {
  const b = Math.max(0, Number(base) || 0);
  if (b <= 0) return 0;
  let d = promo.discount_type === 'percent'
    ? b * (Number(promo.discount_value) / 100)
    : Number(promo.discount_value);
  if (!Number.isFinite(d) || d <= 0) return 0;
  return roundMoney(Math.min(d, b)); // never discount more than the base
}

// An ILIKE pattern that matches a phone's digits regardless of formatting, e.g.
// "9085006350" → "%908%500%6350%" matches "(908) 500-6350".
function phoneLikePattern(phone) {
  const d = String(phone || '').replace(/\D/g, '');
  if (d.length < 10) return null;
  const last10 = d.slice(-10);
  return `%${last10.slice(0, 3)}%${last10.slice(3, 6)}%${last10.slice(6)}%`;
}

// Has this phone/email booked before? Determines new vs returning audience.
async function customerHasHistory(db, phone, email) {
  const cleanEmail = String(email || '').trim();
  if (cleanEmail) {
    const { data } = await db.from('service_requests').select('id').ilike('customer_email', cleanEmail).limit(1);
    if (Array.isArray(data) && data.length) return true;
  }
  const pat = phoneLikePattern(phone);
  if (pat) {
    const { data } = await db.from('service_requests').select('id').ilike('customer_phone', pat).limit(1);
    if (Array.isArray(data) && data.length) return true;
  }
  return false;
}

// How many times has this customer already redeemed this specific code?
async function customerRedemptionCount(db, promoId, phone, email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanPhone = String(phone || '').replace(/\D/g, '');
  const ors = [];
  if (cleanEmail) ors.push(`customer_email.eq.${cleanEmail}`);
  if (cleanPhone.length >= 10) ors.push(`customer_phone.eq.${cleanPhone.slice(-10)}`);
  if (!ors.length) return 0;
  const { data } = await db
    .from('promo_redemptions')
    .select('id')
    .eq('promo_code_id', promoId)
    .or(ors.join(','));
  return Array.isArray(data) ? data.length : 0;
}

async function fetchPromo(db, code) {
  const norm = normalizeCode(code);
  if (!norm) return null;
  const { data } = await db.from('promo_codes').select('*').ilike('code', norm).limit(1).maybeSingle();
  return data || null;
}

// Full server-side validation. `amounts` is the price breakdown (from a row via
// amountsFromRow, or sent by the browser). Returns { ok, reason, promo, discount }.
async function validatePromoForCustomer({ db, code, phone, email, amounts }) {
  const a = amounts || {};
  const orderTotal = num(a.total);
  const promo = await fetchPromo(db, code);
  if (!promo) return { ok: false, reason: 'That promo code was not found.' };
  if (!promo.active) return { ok: false, reason: 'This promo code is no longer active.' };

  const now = Date.now();
  if (promo.starts_at && new Date(promo.starts_at).getTime() > now) {
    return { ok: false, reason: 'This promo code is not active yet.' };
  }
  if (promo.expires_at && new Date(promo.expires_at).getTime() < now) {
    return { ok: false, reason: 'This promo code has expired.' };
  }
  if (promo.max_redemptions != null && Number(promo.redemption_count) >= Number(promo.max_redemptions)) {
    return { ok: false, reason: 'This promo code has reached its redemption limit.' };
  }
  if (Number(promo.min_order_amount) > 0 && Number(orderTotal || 0) < Number(promo.min_order_amount)) {
    return { ok: false, reason: `This code needs a minimum order of $${Number(promo.min_order_amount).toFixed(2)}.` };
  }

  if (promo.audience === 'new' || promo.audience === 'returning') {
    const hasHistory = await customerHasHistory(db, phone, email);
    if (promo.audience === 'new' && hasHistory) {
      return { ok: false, reason: 'This code is for first-time customers only.' };
    }
    if (promo.audience === 'returning' && !hasHistory) {
      return { ok: false, reason: 'This code is for returning customers only.' };
    }
  }

  if (Number(promo.per_customer_limit) > 0) {
    const used = await customerRedemptionCount(db, promo.id, phone, email);
    if (used >= Number(promo.per_customer_limit)) {
      return { ok: false, reason: 'You have already used this promo code.' };
    }
  }

  const base = discountBase(promo.applies_to || 'service_fees', a);
  const discount = computeDiscount(promo, base);
  if (discount <= 0) return { ok: false, reason: 'This code does not apply to this order.' };
  return { ok: true, promo, discount };
}

// Record a redemption (digits-only phone + lowercase email, so the per-customer
// cap matches reliably) and bump the total counter. Best-effort, never throws.
async function recordPromoRedemption({ db, promo, requestId, phone, email, discount }) {
  try {
    await db.from('promo_redemptions').insert({
      promo_code_id: promo.id,
      request_id: requestId || null,
      customer_phone: String(phone || '').replace(/\D/g, '').slice(-10) || null,
      customer_email: String(email || '').trim().toLowerCase() || null,
      discount_amount: roundMoney(discount),
    });
    await db.from('promo_codes')
      .update({ redemption_count: Number(promo.redemption_count || 0) + 1, updated_at: new Date().toISOString() })
      .eq('id', promo.id);
  } catch (err) {
    console.warn('[promos] redemption record failed:', err.message);
  }
}

module.exports = {
  APPLIES_TO,
  normalizeCode,
  roundMoney,
  amountsFromRow,
  discountBase,
  serviceFeesFromRow,
  computeDiscount,
  validatePromoForCustomer,
  recordPromoRedemption,
};
