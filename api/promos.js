/**
 * /api/promos.js
 *
 * - action 'validate' (public, rate-limited): preview a code's discount for a
 *   customer at booking time. Authoritative re-validation also runs at booking
 *   (create-authorized-booking.js), so this is just for the live preview.
 * - admin actions (require admin token): list / save / toggle / delete codes.
 */

const { setCorsHeaders, getSupabaseAdmin, verifyAdminToken } = require('./_auth');
const { enforceRateLimit } = require('./_rate-limit');
const {
  normalizeCode,
  validatePromoForCustomer,
  eligiblePromosForCustomer,
  legacyAudienceForTarget,
  APPLIES_TO,
  TARGET_AUDIENCES,
} = require('./_promos');

module.exports = async (req, res) => {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const action = String(body.action || '').trim();
  const db = getSupabaseAdmin();

  // ── Public: validate a code for a customer ────────────────────────────────
  if (action === 'validate') {
    if (await enforceRateLimit(req, res, 'promo_validate', { limit: 20, windowSeconds: 60 })) return;
    try {
      const result = await validatePromoForCustomer({
        db,
        code: body.code,
        phone: body.phone,
        email: body.email,
        amounts: {
          fuel_service: Number(body.fuel_service) || 0,
          wash_service: Number(body.wash_service) || 0,
          inspection: Number(body.inspection) || 0,
          wash_price: Number(body.wash_price) || 0,
          // Back-compat: older clients sent a single service_fees sum.
          total: Number(body.order_total) || 0,
        },
        isAccount: !!body.is_account,
        serviceType: body.service_type || '',
        customerId: body.customer_id || '',
      });
      if (!result.ok) return res.status(200).json({ ok: false, valid: false, reason: result.reason });
      return res.status(200).json({
        ok: true,
        valid: true,
        code: result.promo.code,
        discount: result.discount,
        discount_type: result.promo.discount_type,
        discount_value: result.promo.discount_value,
        applies_to: result.promo.applies_to || 'service_fees',
        description: result.promo.description || '',
      });
    } catch (err) {
      console.error('[promos/validate] error:', err.message);
      return res.status(200).json({ ok: false, valid: false, reason: 'Could not check that code right now.' });
    }
  }

  if (action === 'eligible') {
    if (await enforceRateLimit(req, res, 'promo_eligible', { limit: 20, windowSeconds: 60 })) return;
    try {
      const promos = await eligiblePromosForCustomer({
        db,
        phone: body.phone,
        email: body.email,
        isAccount: !!body.is_account,
        serviceType: body.service_type || '',
        customerId: body.customer_id || '',
      });
      return res.status(200).json({
        ok: true,
        promos: promos.slice(0, 8).map((p) => ({
          code: p.code,
          name: p.name || '',
          description: p.description || '',
          discount_type: p.discount_type,
          discount_value: p.discount_value,
          applies_to: p.applies_to || 'service_fees',
          target_audience: p.target_audience || (p.audience === 'all' ? 'everyone' : p.audience),
          specific_customer_id: p.specific_customer_id || '',
          expires_at: p.expires_at || null,
        })),
      });
    } catch (err) {
      console.error('[promos/eligible] error:', err.message);
      return res.status(200).json({ ok: true, promos: [] });
    }
  }

  // ── Admin actions (require a valid admin token) ───────────────────────────
  const adminId = await verifyAdminToken(body.admin_token);
  if (!adminId) return res.status(401).json({ error: 'Unauthorized' });

  try {
    if (action === 'list') {
      const { data, error } = await db.from('promo_codes').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ ok: true, promos: data || [] });
    }

    if (action === 'save') {
      const p = body.promo || {};
      const code = normalizeCode(p.code);
      if (!code) return res.status(400).json({ error: 'Code is required' });
      if (!['percent', 'fixed', 'free_addon'].includes(p.discount_type)) return res.status(400).json({ error: 'Invalid discount type' });
      const value = p.discount_type === 'free_addon' ? 0 : Number(p.discount_value);
      if (!Number.isFinite(value) || (p.discount_type !== 'free_addon' && value <= 0)) return res.status(400).json({ error: 'Discount value must be greater than 0' });
      if (p.discount_type === 'percent' && value > 100) return res.status(400).json({ error: 'Percentage cannot exceed 100' });
      const targetAudience = p.target_audience || (p.audience === 'all' ? 'everyone' : p.audience) || 'everyone';
      if (!TARGET_AUDIENCES.includes(targetAudience)) return res.status(400).json({ error: 'Invalid target audience' });
      if (!APPLIES_TO.includes(p.applies_to || 'service_fees')) return res.status(400).json({ error: 'Invalid "applies to" option' });
      const eligibleServices = Array.isArray(p.eligible_services) && p.eligible_services.length
        ? p.eligible_services.map((item) => String(item || '').trim()).filter(Boolean)
        : ['all'];

      const row = {
        name: p.name ? String(p.name).trim() : null,
        code,
        description: p.description ? String(p.description).trim() : null,
        discount_type: p.discount_type,
        discount_value: value,
        applies_to: p.discount_type === 'free_addon' ? 'inspection' : (p.applies_to || 'service_fees'),
        audience: legacyAudienceForTarget(targetAudience),
        target_audience: targetAudience,
        eligible_services: eligibleServices.length ? eligibleServices : ['all'],
        inactive_days_threshold: targetAudience === 'inactive' ? Math.max(1, parseInt(p.inactive_days_threshold, 10) || 30) : null,
        specific_customer_id: targetAudience === 'specific' && p.specific_customer_id ? String(p.specific_customer_id).trim() : null,
        specific_customer_phone: targetAudience === 'specific' && p.specific_customer_phone ? String(p.specific_customer_phone).replace(/\D/g, '').slice(-10) : null,
        specific_customer_email: targetAudience === 'specific' && p.specific_customer_email ? String(p.specific_customer_email).trim().toLowerCase() : null,
        min_order_amount: Math.max(0, Number(p.min_order_amount) || 0),
        per_customer_limit: Math.max(0, parseInt(p.per_customer_limit, 10) || 0),
        max_redemptions: (p.max_redemptions === '' || p.max_redemptions == null) ? null : Math.max(1, parseInt(p.max_redemptions, 10)),
        starts_at: p.starts_at || null,
        expires_at: p.expires_at || null,
        active: p.active !== false,
        updated_at: new Date().toISOString(),
      };

      if (p.id) {
        const { error } = await db.from('promo_codes').update(row).eq('id', p.id);
        if (error) throw error;
        return res.status(200).json({ ok: true, id: p.id });
      }
      const { data, error } = await db.from('promo_codes').insert(row).select('id').maybeSingle();
      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'A promo code with that name already exists.' });
        throw error;
      }
      return res.status(200).json({ ok: true, id: data?.id });
    }

    if (action === 'toggle') {
      const { error } = await db.from('promo_codes').update({ active: !!body.active, updated_at: new Date().toISOString() }).eq('id', body.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    if (action === 'delete') {
      const { error } = await db.from('promo_codes').delete().eq('id', body.id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('[promos] admin error:', err.message);
    return res.status(500).json({ error: err.message || 'Promo operation failed' });
  }
};
