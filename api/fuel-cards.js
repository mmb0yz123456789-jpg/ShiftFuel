/**
 * /api/fuel-cards.js
 *
 * Stripe Issuing virtual fuel cards (Phase 3 of payroll payments). Each worker
 * gets a virtual card restricted to FUEL + CAR-WASH merchants with a
 * per-transaction cap, so they never front their own money for gas and the card
 * can't be misused. The card lives in the worker's profile inside the app.
 *
 * Actions (all POST, body.action):
 *   issue_card       – ADMIN: create cardholder + virtual card for a worker
 *   card_details     – Worker (own) or admin: card status + number (test mode)
 *   set_card_status  – ADMIN: freeze (inactive) / unfreeze (active)
 *
 * Requires (Stripe sandbox/test): Issuing enabled in the dashboard and a
 * STRIPE_SECRET_KEY (test) in Vercel. The plaintext PAN is only returned by
 * Stripe in TEST mode; in live you'd use Issuing Elements client-side.
 */

const Stripe = require('stripe');
const {
  setCorsHeaders,
  getSupabaseAdmin,
  verifyAdminToken,
  verifyWorkerToken,
} = require('./_auth');

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured');
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

// Fuel + car-wash merchant categories (Stripe Issuing MCC groups).
const FUEL_WASH_CATEGORIES = ['automated_fuel_dispensers', 'service_stations', 'car_washes'];

// Per-transaction cap (dollars). Overridable per call; defaults to $150.
const DEFAULT_PER_TXN_CAP = 150;

// Issuing cardholders need a billing address. Workers don't have one on file,
// so cards bill to the company address. Override via ISSUING_BILLING_* env vars.
function companyBillingAddress() {
  return {
    line1: process.env.ISSUING_BILLING_LINE1 || '602 Main St',
    city: process.env.ISSUING_BILLING_CITY || 'Wilmington',
    state: process.env.ISSUING_BILLING_STATE || 'DE',
    postal_code: process.env.ISSUING_BILLING_POSTAL || '19804',
    country: 'US',
  };
}

function toE164(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return undefined;
}

// Workers may only read their OWN card; admins may target anyone.
async function resolveCaller(token, requestedEmployeeId) {
  if (!token) return null;
  const isAdmin = await verifyAdminToken(token);
  if (isAdmin) return { isAdmin: true, employeeId: requestedEmployeeId || null };
  const workerId = await verifyWorkerToken(token);
  if (workerId) return { isAdmin: false, employeeId: workerId };
  return null;
}

async function loadEmployee(db, employeeId) {
  const { data, error } = await db
    .from('employees')
    .select('id, full_name, email, phone, stripe_cardholder_id, stripe_card_id, stripe_card_last4, stripe_card_status, stripe_phys_card_id, stripe_phys_card_last4, stripe_phys_card_status')
    .eq('id', employeeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

function perTxnCapFrom(card) {
  return (card.spending_controls
    && card.spending_controls.spending_limits
    && card.spending_controls.spending_limits[0]
    && card.spending_controls.spending_limits[0].amount / 100) || null;
}

async function ensureCardholder(stripe, db, employee) {
  if (employee.stripe_cardholder_id) return employee.stripe_cardholder_id;

  const cardholder = await stripe.issuing.cardholders.create({
    type: 'individual',
    name: employee.full_name || 'ShiftFuel Worker',
    email: employee.email || undefined,
    phone_number: toE164(employee.phone),
    billing: { address: companyBillingAddress() },
    metadata: { employee_id: employee.id, source: 'shiftfuel' },
  });

  await db
    .from('employees')
    .update({ stripe_cardholder_id: cardholder.id, stripe_card_updated_at: new Date().toISOString() })
    .eq('id', employee.id);

  return cardholder.id;
}

const HANDLERS = {
  // ── ADMIN: create the worker's fuel card ──────────────────────────────────
  async issue_card(req, body, res) {
    const isAdmin = await verifyAdminToken(body.caller_token);
    if (!isAdmin) return res.status(401).json({ error: 'Unauthorized' });
    if (!body.employee_id) return res.status(400).json({ error: 'Missing employee_id' });

    const db = getSupabaseAdmin();
    const employee = await loadEmployee(db, body.employee_id);
    if (!employee) return res.status(404).json({ error: 'Worker not found' });
    if (employee.stripe_card_id) {
      return res.status(200).json({
        card_id: employee.stripe_card_id,
        last4: employee.stripe_card_last4,
        status: employee.stripe_card_status,
        already_existed: true,
      });
    }

    const stripe = getStripe();
    const cardholderId = await ensureCardholder(stripe, db, employee);

    const capDollars = Number(body.per_transaction_cap) > 0 ? Number(body.per_transaction_cap) : DEFAULT_PER_TXN_CAP;
    const card = await stripe.issuing.cards.create({
      cardholder: cardholderId,
      currency: 'usd',
      type: 'virtual',
      status: 'active',
      spending_controls: {
        allowed_categories: FUEL_WASH_CATEGORIES,
        spending_limits: [{ amount: Math.round(capDollars * 100), interval: 'per_authorization' }],
      },
      metadata: { employee_id: employee.id, source: 'shiftfuel' },
    });

    await db
      .from('employees')
      .update({
        stripe_card_id: card.id,
        stripe_card_last4: card.last4,
        stripe_card_status: card.status,
        stripe_card_updated_at: new Date().toISOString(),
      })
      .eq('id', employee.id);

    return res.status(200).json({ card_id: card.id, last4: card.last4, status: card.status });
  },

  // ── Worker (own) or admin: card details for the in-profile display ────────
  // Returns both the virtual (online) card and the physical (pump) card.
  async card_details(req, body, res) {
    const caller = await resolveCaller(body.caller_token, body.employee_id);
    if (!caller || !caller.employeeId) return res.status(401).json({ error: 'Unauthorized' });

    const db = getSupabaseAdmin();
    const employee = await loadEmployee(db, caller.employeeId);
    if (!employee) return res.status(404).json({ error: 'Worker not found' });

    const stripe = getStripe();
    const sync = {};

    // Virtual card — expand number/cvc (TEST mode only) so it can be displayed.
    let virtual = { has_card: false };
    if (employee.stripe_card_id) {
      let card;
      try {
        card = await stripe.issuing.cards.retrieve(employee.stripe_card_id, { expand: ['number', 'cvc'] });
      } catch (err) {
        card = await stripe.issuing.cards.retrieve(employee.stripe_card_id);
      }
      if (card.status && card.status !== employee.stripe_card_status) sync.stripe_card_status = card.status;
      virtual = {
        has_card: true,
        card_id: card.id,
        brand: card.brand,
        last4: card.last4,
        exp_month: card.exp_month,
        exp_year: card.exp_year,
        status: card.status,
        number: card.number || null,
        cvc: card.cvc || null,
        per_transaction_cap: perTxnCapFrom(card),
      };
    }

    // Physical card — no PAN displayed (it's printed on the card).
    let physical = { has_card: false };
    if (employee.stripe_phys_card_id) {
      const card = await stripe.issuing.cards.retrieve(employee.stripe_phys_card_id);
      if (card.status && card.status !== employee.stripe_phys_card_status) sync.stripe_phys_card_status = card.status;
      physical = {
        has_card: true,
        card_id: card.id,
        brand: card.brand,
        last4: card.last4,
        status: card.status,
        per_transaction_cap: perTxnCapFrom(card),
      };
    }

    if (Object.keys(sync).length) await db.from('employees').update(sync).eq('id', employee.id);

    // Keep the legacy top-level virtual fields for backward compatibility.
    return res.status(200).json({ ...virtual, virtual, physical });
  },

  // ── ADMIN: freeze / unfreeze (virtual by default, or physical) ────────────
  async set_card_status(req, body, res) {
    const isAdmin = await verifyAdminToken(body.caller_token);
    if (!isAdmin) return res.status(401).json({ error: 'Unauthorized' });
    if (!body.employee_id) return res.status(400).json({ error: 'Missing employee_id' });

    const which = body.which === 'physical' ? 'physical' : 'virtual';
    const status = body.status === 'inactive' ? 'inactive' : 'active';
    const db = getSupabaseAdmin();
    const employee = await loadEmployee(db, body.employee_id);
    if (!employee) return res.status(404).json({ error: 'Worker not found' });

    const cardId = which === 'physical' ? employee.stripe_phys_card_id : employee.stripe_card_id;
    if (!cardId) return res.status(400).json({ error: 'Worker has no card to update.' });

    const stripe = getStripe();
    const card = await stripe.issuing.cards.update(cardId, { status });
    const col = which === 'physical' ? 'stripe_phys_card_status' : 'stripe_card_status';
    const tsCol = which === 'physical' ? 'stripe_phys_card_updated_at' : 'stripe_card_updated_at';
    await db.from('employees').update({ [col]: card.status, [tsCol]: new Date().toISOString() }).eq('id', employee.id);

    return res.status(200).json({ status: card.status, which });
  },

  // ── ADMIN: order a physical card mailed to the company address ────────────
  async order_physical_card(req, body, res) {
    const isAdmin = await verifyAdminToken(body.caller_token);
    if (!isAdmin) return res.status(401).json({ error: 'Unauthorized' });
    if (!body.employee_id) return res.status(400).json({ error: 'Missing employee_id' });

    const db = getSupabaseAdmin();
    const employee = await loadEmployee(db, body.employee_id);
    if (!employee) return res.status(404).json({ error: 'Worker not found' });
    if (employee.stripe_phys_card_id) {
      return res.status(200).json({
        card_id: employee.stripe_phys_card_id,
        last4: employee.stripe_phys_card_last4,
        status: employee.stripe_phys_card_status,
        already_existed: true,
      });
    }

    const stripe = getStripe();
    const cardholderId = await ensureCardholder(stripe, db, employee);
    const capDollars = Number(body.per_transaction_cap) > 0 ? Number(body.per_transaction_cap) : DEFAULT_PER_TXN_CAP;

    // Physical cards are created `inactive` and ship to the address below; they
    // get activated once received. They carry the same fuel/wash + cap controls.
    const card = await stripe.issuing.cards.create({
      cardholder: cardholderId,
      currency: 'usd',
      type: 'physical',
      shipping: {
        name: employee.full_name || 'ShiftFuel Worker',
        address: companyBillingAddress(),
      },
      spending_controls: {
        allowed_categories: FUEL_WASH_CATEGORIES,
        spending_limits: [{ amount: Math.round(capDollars * 100), interval: 'per_authorization' }],
      },
      metadata: { employee_id: employee.id, source: 'shiftfuel' },
    });

    await db
      .from('employees')
      .update({
        stripe_phys_card_id: card.id,
        stripe_phys_card_last4: card.last4,
        stripe_phys_card_status: card.status,
        stripe_phys_card_updated_at: new Date().toISOString(),
      })
      .eq('id', employee.id);

    return res.status(200).json({ card_id: card.id, last4: card.last4, status: card.status });
  },

  // ── Admin or worker (own): activate a physical card once it's received ────
  async activate_physical_card(req, body, res) {
    const caller = await resolveCaller(body.caller_token, body.employee_id);
    if (!caller || !caller.employeeId) return res.status(401).json({ error: 'Unauthorized' });

    const db = getSupabaseAdmin();
    const employee = await loadEmployee(db, caller.employeeId);
    if (!employee) return res.status(404).json({ error: 'Worker not found' });
    if (!employee.stripe_phys_card_id) return res.status(400).json({ error: 'No physical card to activate.' });

    const stripe = getStripe();
    const card = await stripe.issuing.cards.update(employee.stripe_phys_card_id, { status: 'active' });
    await db
      .from('employees')
      .update({ stripe_phys_card_status: card.status, stripe_phys_card_updated_at: new Date().toISOString() })
      .eq('id', employee.id);

    return res.status(200).json({ status: card.status });
  },
};

module.exports = async (req, res) => {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, ...body } = req.body || {};
  if (!action) return res.status(400).json({ error: 'Missing required field: action' });

  const handler = HANDLERS[action];
  if (!handler) return res.status(400).json({ error: `Unknown action: ${action}` });

  try {
    return await handler(req, body, res);
  } catch (err) {
    console.error(`[fuel-cards/${action}] Unhandled error:`, err.message);
    return res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
  }
};
