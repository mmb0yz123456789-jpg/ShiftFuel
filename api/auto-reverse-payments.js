const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

// Statuses that mean the request was handled — skip reversal
const SKIP_STATUSES = new Set([
  'complete',
  'denied',
  'customer_canceled',
  'unable_to_complete',
  'auto_reversed',
]);

// Payment statuses that are already finalized — skip reversal
const SKIP_PAYMENT_STATUSES = new Set([
  'auto_reversed',
  'voided',
  'refunded',
  'not_started',
]);

module.exports = async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'];
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Yesterday's date in YYYY-MM-DD
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  console.log(`[auto-reverse] Running for service_date: ${yesterdayStr}`);

  // Find all requests from yesterday that have a payment and were not handled
  const { data: candidates, error } = await supabase
    .from('service_requests')
    .select('id, status, payment_intent_id, payment_status, final_total, estimated_total, customer_name, service_date')
    .eq('service_date', yesterdayStr)
    .not('payment_intent_id', 'is', null);

  if (error) {
    console.error('[auto-reverse] Supabase query error:', error.message);
    return res.status(500).json({ error: 'Database query failed' });
  }

  const results = { reversed: [], skipped: [], failed: [] };

  for (const row of candidates || []) {
    // Skip if already handled
    if (SKIP_STATUSES.has(row.status)) {
      results.skipped.push({ id: row.id, reason: `status=${row.status}` });
      continue;
    }

    // Skip if payment already finalized
    if (SKIP_PAYMENT_STATUSES.has(row.payment_status)) {
      results.skipped.push({ id: row.id, reason: `payment_status=${row.payment_status}` });
      continue;
    }

    const reversedAt = new Date().toISOString();

    try {
      if (row.payment_status === 'captured') {
        // Payment was already captured — issue a full refund
        await stripe.refunds.create({ payment_intent: row.payment_intent_id });
        console.log(`[auto-reverse] Refunded captured payment for request ${row.id}`);
      } else {
        // Payment is only authorized — void/cancel the hold
        await stripe.paymentIntents.cancel(row.payment_intent_id);
        console.log(`[auto-reverse] Voided authorization for request ${row.id}`);
      }

      // Mark request as auto-reversed
      const { error: updateError } = await supabase
        .from('service_requests')
        .update({
          status: 'auto_reversed',
          payment_status: 'auto_reversed',
          auto_reversed_at: reversedAt,
          notes: appendNote(row.notes, `Auto-reversed on ${reversedAt.slice(0, 10)}: service was not completed on the scheduled date.`),
          updated_at: reversedAt,
        })
        .eq('id', row.id);

      if (updateError) {
        console.error(`[auto-reverse] Failed to update request ${row.id}:`, updateError.message);
        results.failed.push({ id: row.id, reason: updateError.message });
      } else {
        results.reversed.push({ id: row.id, action: row.payment_status === 'captured' ? 'refunded' : 'voided' });
      }
    } catch (err) {
      if (err.code === 'payment_intent_unexpected_state') {
        // Already captured or already canceled — just mark it
        await supabase
          .from('service_requests')
          .update({
            payment_status: 'auto_reversed',
            auto_reversed_at: reversedAt,
            updated_at: reversedAt,
          })
          .eq('id', row.id);
        results.reversed.push({ id: row.id, action: 'already_finalized' });
      } else {
        console.error(`[auto-reverse] Stripe error for request ${row.id}:`, err.message);
        results.failed.push({ id: row.id, reason: err.message });
      }
    }
  }

  console.log(`[auto-reverse] Done. Reversed: ${results.reversed.length}, Skipped: ${results.skipped.length}, Failed: ${results.failed.length}`);
  res.status(200).json(results);
};

function appendNote(existing, note) {
  return existing ? `${existing}\n${note}` : note;
}
