'use strict';

const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const autoReversePayments = require('./_cron/auto-reverse-payments');

function getUrl(req) {
  return new URL(req.url || '/api/cron', `https://${req.headers.host || 'localhost'}`);
}

function getSupabase() {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function verifyCron(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;

  const vercelHeader = req.headers['x-vercel-cron-secret'];
  const authHeader = req.headers.authorization;

  if (vercelHeader === cronSecret || authHeader === `Bearer ${cronSecret}`) return true;

  res.status(401).json({ error: 'Unauthorized' });
  return false;
}

async function cleanupOrphanedHolds(req, res) {
  if (!verifyCron(req, res)) return;

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const supabase = getSupabase();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const startedAt = Date.now();
  let cleaned = 0;
  let errors = 0;
  let skipped = 0;

  try {
    const { data: pendingAuths, error: fetchError } = await supabase
      .from('pending_authorizations')
      .select('payment_intent_id, amount_cents, customer_email, created_at')
      .eq('status', 'pending')
      .lt('created_at', oneHourAgo)
      .order('created_at', { ascending: true });

    if (fetchError) {
      return res.status(500).json({ error: 'Database query failed', details: fetchError.message });
    }

    for (const auth of pendingAuths || []) {
      if (!auth.payment_intent_id) {
        skipped++;
        continue;
      }

      try {
        const intent = await stripe.paymentIntents.retrieve(auth.payment_intent_id);

        if (intent.status === 'requires_capture') {
          await stripe.paymentIntents.cancel(auth.payment_intent_id);
          await supabase
            .from('pending_authorizations')
            .update({
              status: 'voided',
              reason: 'orphaned_hold_cleanup',
              resolved_at: new Date().toISOString(),
            })
            .eq('payment_intent_id', auth.payment_intent_id);
          cleaned++;
          continue;
        }

        if (intent.status === 'canceled' || intent.status === 'succeeded') {
          await supabase
            .from('pending_authorizations')
            .update({
              status: intent.status === 'succeeded' ? 'booked' : 'voided',
              reason: intent.status === 'succeeded' ? 'already_captured' : 'already_canceled',
              resolved_at: new Date().toISOString(),
            })
            .eq('payment_intent_id', auth.payment_intent_id);
          skipped++;
          continue;
        }

        if (['requires_payment_method', 'requires_confirmation', 'requires_action', 'processing'].includes(intent.status)) {
          try {
            await stripe.paymentIntents.cancel(auth.payment_intent_id);
          } catch (cancelError) {
            // These intents may already be non-cancelable; the DB state still needs resolving.
          }

          await supabase
            .from('pending_authorizations')
            .update({
              status: 'voided',
              reason: 'never_became_hold',
              resolved_at: new Date().toISOString(),
            })
            .eq('payment_intent_id', auth.payment_intent_id);
          skipped++;
          continue;
        }

        skipped++;
      } catch (error) {
        if (error.code === 'payment_intent_unexpected_state') {
          await supabase
            .from('pending_authorizations')
            .update({
              status: 'voided',
              reason: 'already_terminal',
              resolved_at: new Date().toISOString(),
            })
            .eq('payment_intent_id', auth.payment_intent_id);
          skipped++;
        } else {
          console.error('[cron] Failed to process orphaned hold:', error);
          errors++;
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: `Cleaned ${cleaned} orphaned holds`,
      cleaned,
      errors,
      skipped,
      duration_ms: Date.now() - startedAt,
    });
  } catch (error) {
    console.error('[cron] Cleanup failed:', error);
    return res.status(500).json({
      error: 'Cleanup failed',
      details: error.message,
      cleaned,
      errors,
      skipped,
      duration_ms: Date.now() - startedAt,
    });
  }
}

module.exports = async (req, res) => {
  const url = getUrl(req);
  const job = url.searchParams.get('job');

  if (job === 'cleanup-holds' || url.pathname.endsWith('/cron-cleanup-holds')) {
    return cleanupOrphanedHolds(req, res);
  }

  if (job === 'auto-reverse-payments' || url.pathname.endsWith('/auto-reverse-payments')) {
    return autoReversePayments(req, res);
  }

  return res.status(404).json({ error: 'Unknown cron job' });
};
