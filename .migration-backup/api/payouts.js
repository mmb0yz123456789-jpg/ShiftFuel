/**
 * /api/payouts.js
 *
 * Stripe Connect payouts for 1099 contractor workers (Phase 2 of payroll
 * payments). Each worker gets a Stripe Express connected account; the admin
 * pays a worker by creating a Transfer to that account, which Stripe then pays
 * out to the worker's bank on its normal schedule. Every Stripe payout is also
 * written into the worker_payouts ledger (method = 'stripe_connect') so the
 * Payroll tab's "paid / outstanding" view stays the single source of truth.
 *
 * Actions (all POST, body.action):
 *   connect_create_account  – Create (or reuse) a worker's Express account
 *   connect_onboarding_link – Hosted onboarding/Account-management link URL
 *   connect_status          – Refresh + return onboarding/payout readiness
 *   connect_transfer        – ADMIN: transfer a worker's pay + record it
 *
 * Auth: workers (worker token) may only act on their OWN account for the
 * create/link/status actions. connect_transfer is admin-only.
 *
 * Requires (Stripe sandbox/test): Connect enabled in the dashboard and a
 * STRIPE_SECRET_KEY (test) set in Vercel. Express + transfers only.
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

function baseUrlFrom(req) {
  const origin = req.headers.origin;
  if (origin && /^https?:\/\//.test(origin)) return origin;
  return 'https://shift-fuel.vercel.app';
}

// Resolve who is calling and which employee they're allowed to act on.
// Workers are pinned to their own employee id; admins may target anyone.
async function resolveCaller(token, requestedEmployeeId) {
  if (!token) return null;
  const isAdmin = await verifyAdminToken(token);
  if (isAdmin) {
    return { isAdmin: true, employeeId: requestedEmployeeId || null };
  }
  const workerId = await verifyWorkerToken(token);
  if (workerId) return { isAdmin: false, employeeId: workerId };
  return null;
}

async function loadEmployee(db, employeeId) {
  const { data, error } = await db
    .from('employees')
    .select('id, full_name, email, phone, stripe_connect_account_id, stripe_connect_ready')
    .eq('id', employeeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// Create the Express account if the worker doesn't have one yet, persist it,
// and return the account id. Idempotent.
async function ensureConnectAccount(stripe, db, employee) {
  if (employee.stripe_connect_account_id) return employee.stripe_connect_account_id;

  const account = await stripe.accounts.create({
    type: 'express',
    country: 'US',
    email: employee.email || undefined,
    business_type: 'individual',
    capabilities: { transfers: { requested: true } },
    business_profile: {
      product_description: 'ShiftFuel concierge fuel & car-wash services (1099 contractor).',
    },
    metadata: { employee_id: employee.id, source: 'shiftfuel' },
  });

  await db
    .from('employees')
    .update({ stripe_connect_account_id: account.id, stripe_connect_updated_at: new Date().toISOString() })
    .eq('id', employee.id);

  return account.id;
}

function readinessFromAccount(account) {
  const transfersActive = account.capabilities && account.capabilities.transfers === 'active';
  return {
    ready: !!(account.details_submitted && account.payouts_enabled && transfersActive),
    details_submitted: !!account.details_submitted,
    payouts_enabled: !!account.payouts_enabled,
    transfers_active: !!transfersActive,
    requirements_due: (account.requirements && account.requirements.currently_due) || [],
  };
}

async function persistReady(db, employeeId, ready) {
  await db
    .from('employees')
    .update({ stripe_connect_ready: ready, stripe_connect_updated_at: new Date().toISOString() })
    .eq('id', employeeId);
}

const HANDLERS = {
  // ── Create (or reuse) the worker's Express account ────────────────────────
  async connect_create_account(req, body, res) {
    const caller = await resolveCaller(body.caller_token, body.employee_id);
    if (!caller || !caller.employeeId) return res.status(401).json({ error: 'Unauthorized' });

    const db = getSupabaseAdmin();
    const employee = await loadEmployee(db, caller.employeeId);
    if (!employee) return res.status(404).json({ error: 'Worker not found' });

    const stripe = getStripe();
    const accountId = await ensureConnectAccount(stripe, db, employee);
    return res.status(200).json({ account_id: accountId });
  },

  // ── Hosted onboarding / account-management link ───────────────────────────
  async connect_onboarding_link(req, body, res) {
    const caller = await resolveCaller(body.caller_token, body.employee_id);
    if (!caller || !caller.employeeId) return res.status(401).json({ error: 'Unauthorized' });

    const db = getSupabaseAdmin();
    const employee = await loadEmployee(db, caller.employeeId);
    if (!employee) return res.status(404).json({ error: 'Worker not found' });

    const stripe = getStripe();
    const accountId = await ensureConnectAccount(stripe, db, employee);
    const baseUrl = baseUrlFrom(req);

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${baseUrl}/worker/dashboard?payouts=refresh`,
      return_url: `${baseUrl}/worker/dashboard?payouts=done`,
      type: 'account_onboarding',
    });

    return res.status(200).json({ url: link.url });
  },

  // ── Refresh + return readiness ────────────────────────────────────────────
  async connect_status(req, body, res) {
    const caller = await resolveCaller(body.caller_token, body.employee_id);
    if (!caller || !caller.employeeId) return res.status(401).json({ error: 'Unauthorized' });

    const db = getSupabaseAdmin();
    const employee = await loadEmployee(db, caller.employeeId);
    if (!employee) return res.status(404).json({ error: 'Worker not found' });

    if (!employee.stripe_connect_account_id) {
      return res.status(200).json({ account_id: null, ready: false, onboarded: false });
    }

    const stripe = getStripe();
    const account = await stripe.accounts.retrieve(employee.stripe_connect_account_id);
    const status = readinessFromAccount(account);
    await persistReady(db, employee.id, status.ready);

    return res.status(200).json({
      account_id: employee.stripe_connect_account_id,
      onboarded: status.details_submitted,
      ...status,
    });
  },

  // ── ADMIN: transfer a worker's pay and record it in the ledger ────────────
  async connect_transfer(req, body, res) {
    const isAdmin = await verifyAdminToken(body.caller_token);
    if (!isAdmin) return res.status(401).json({ error: 'Unauthorized' });

    const employeeId = body.employee_id;
    const amount = Number(body.amount);
    if (!employeeId) return res.status(400).json({ error: 'Missing employee_id' });
    if (!(amount > 0)) return res.status(400).json({ error: 'Amount must be greater than 0' });

    const db = getSupabaseAdmin();
    const employee = await loadEmployee(db, employeeId);
    if (!employee) return res.status(404).json({ error: 'Worker not found' });
    if (!employee.stripe_connect_account_id) {
      return res.status(400).json({ error: 'Worker has not set up a payout account yet.' });
    }

    const stripe = getStripe();

    // Re-check readiness server-side so we never transfer to an un-onboarded acct.
    const account = await stripe.accounts.retrieve(employee.stripe_connect_account_id);
    const { ready } = readinessFromAccount(account);
    await persistReady(db, employee.id, ready);
    if (!ready) {
      return res.status(400).json({ error: 'Worker payout account is not finished onboarding yet.' });
    }

    let transfer;
    try {
      transfer = await stripe.transfers.create({
        amount: Math.round(amount * 100),
        currency: 'usd',
        destination: employee.stripe_connect_account_id,
        metadata: { employee_id: employeeId, period_key: body.period_key || '' },
      });
    } catch (err) {
      // Most common in test mode: insufficient platform balance.
      const msg = /insufficient/i.test(err.message || '')
        ? 'Stripe platform balance is too low to transfer. In test mode, take a test customer payment first to fund the balance.'
        : (err.message || 'Stripe transfer failed.');
      return res.status(400).json({ error: msg });
    }

    // Record into the same ledger the manual "Mark paid" flow uses.
    const { error: insErr } = await db.from('worker_payouts').insert({
      employee_id: employeeId,
      worker_name: employee.full_name,
      period_key: body.period_key || `adhoc:${new Date().toISOString().slice(0, 10)}`,
      period_label: body.period_label || null,
      amount: Math.round(amount * 100) / 100,
      method: 'stripe_connect',
      reference: transfer.id,
      stripe_transfer_id: transfer.id,
      status: 'paid',
    });
    if (insErr) {
      // The money moved; surface that the ledger write failed so the admin can retry record-keeping.
      console.error('[payouts/connect_transfer] ledger insert failed:', insErr.message);
      return res.status(200).json({ ok: true, transfer_id: transfer.id, ledger_warning: insErr.message });
    }

    return res.status(200).json({ ok: true, transfer_id: transfer.id });
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
    console.error(`[payouts/${action}] Unhandled error:`, err.message);
    return res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
  }
};
