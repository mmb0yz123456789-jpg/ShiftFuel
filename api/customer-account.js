const { setCorsHeaders, getSupabaseAdmin } = require('./_auth');
const { enforceRateLimit } = require('./_rate-limit');

function cleanPhone(value) {
  return String(value || '').replace(/\D/g, '').slice(-10);
}

function cleanEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function publicClaimPayload(result) {
  const data = result && typeof result === 'object' ? result : {};
  return {
    ok: data.ok === true,
    status: data.status || 'unavailable',
    execute: data.execute === true,
    claim_method: data.claim_method || '',
    claimable: data.claimable || {},
    potential_matches: data.potential_matches || {},
    conflicts: data.conflicts || {},
  };
}

module.exports = async function handler(req, res) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const action = String(body.action || '').trim();
  if (action !== 'claim_history') return res.status(400).json({ error: 'Unknown action' });
  if (await enforceRateLimit(req, res, 'customer_claim_history', { limit: 20, windowSeconds: 60 })) return;

  const phone = cleanPhone(body.phone);
  const email = cleanEmail(body.email);
  if (phone.length < 10 || !email) return res.status(400).json({ error: 'Phone and email are required.' });

  try {
    const db = getSupabaseAdmin();
    const lookup = await db.rpc('public_lookup_customer_account', {
      p_phone: phone,
      p_email: email,
    });
    if (lookup.error) throw lookup.error;
    const customerId = lookup.data && typeof lookup.data === 'object' ? lookup.data.id : '';
    if (!customerId) return res.status(404).json({ error: 'Customer account was not found.' });

    const claim = await db.rpc('public_claim_customer_history', {
      p_customer_id: customerId,
      p_execute: body.execute === true,
    });
    if (claim.error) throw claim.error;

    return res.status(200).json(publicClaimPayload(claim.data));
  } catch (error) {
    console.error('[customer-account/claim_history] error:', error.message);
    return res.status(500).json({ error: 'Could not check past services right now.' });
  }
};
