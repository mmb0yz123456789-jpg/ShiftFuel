const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
const { notifyRequest } = require('./_push');
const { placeScheduledHold } = require('./_scheduled-auth');

// Place the off-session hold for advance (saved-card) bookings this many days
// before the service date — fresh enough to stay inside Stripe's ~7-day capture
// window, with a day of slack to chase any failed authorization.
const AUTH_LEAD_DAYS = 2;

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

  // ── Second pass: orphaned authorization holds ──────────────────────────────
  // Holds that were placed but never became a booking (customer left before
  // clicking "Book request" and the on-unload beacon never fired — e.g. a crash
  // or force-quit). These have no service_requests row, so the pass above can
  // never see them. Void any still-pending hold older than 24h so the customer's
  // funds are released well before Stripe's ~7-day auth expiry.
  results.orphansVoided = [];
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: orphans, error: orphanErr } = await supabase
    .from('pending_authorizations')
    .select('payment_intent_id, created_at')
    .eq('status', 'pending')
    .lt('created_at', cutoff);

  if (orphanErr) {
    console.error('[auto-reverse] pending_authorizations query error:', orphanErr.message);
  } else {
    for (const hold of orphans || []) {
      const voidedAt = new Date().toISOString();
      try {
        const intent = await stripe.paymentIntents.retrieve(hold.payment_intent_id);
        if (intent.status !== 'canceled') {
          await stripe.paymentIntents.cancel(hold.payment_intent_id);
        }
      } catch (err) {
        // already canceled/captured/terminal — still resolve the row below
        if (err.code !== 'payment_intent_unexpected_state' && err.code !== 'resource_missing') {
          console.error(`[auto-reverse] orphan void failed for ${hold.payment_intent_id}:`, err.message);
          results.failed.push({ payment_intent_id: hold.payment_intent_id, reason: err.message });
          continue;
        }
      }
      await supabase
        .from('pending_authorizations')
        .update({ status: 'voided', reason: 'auto_expired', resolved_at: voidedAt })
        .eq('payment_intent_id', hold.payment_intent_id);
      results.orphansVoided.push({ payment_intent_id: hold.payment_intent_id });
    }
  }

  // ── Third pass: authorize upcoming saved-card (advance) bookings ───────────
  // These have no hold yet (the card was saved at booking time). Place the real
  // off-session manual-capture hold ~AUTH_LEAD_DAYS before the service date.
  results.scheduledAuthorized = [];
  results.scheduledFailed = [];
  const authCutoff = new Date();
  authCutoff.setDate(authCutoff.getDate() + AUTH_LEAD_DAYS);
  const authCutoffStr = authCutoff.toISOString().slice(0, 10);

  const { data: scheduled, error: scheduledErr } = await supabase
    .from('service_requests')
    .select('id, estimated_total, service_date')
    .eq('payment_status', 'payment_scheduled')
    .lte('service_date', authCutoffStr)
    .order('service_date', { ascending: true })
    .limit(50);

  if (scheduledErr) {
    console.error('[auto-reverse] scheduled-auth query error:', scheduledErr.message);
  } else {
    for (const reqRow of scheduled || []) {
      // Optimistic claim: flip to 'authorizing' only while still 'payment_scheduled'.
      // If nothing comes back, another run already claimed it — skip.
      const { data: claimed, error: claimErr } = await supabase
        .from('service_requests')
        .update({ payment_status: 'authorizing' })
        .eq('id', reqRow.id)
        .eq('payment_status', 'payment_scheduled')
        .select('id')
        .maybeSingle();
      if (claimErr || !claimed) continue;

      const failReauth = async (reason, attempts) => {
        await supabase.from('service_requests').update({ payment_status: 'needs_reauth' }).eq('id', reqRow.id);
        await supabase.from('request_payment_methods')
          .update({ auth_error: String(reason), auth_attempts: (attempts || 0) + 1, updated_at: new Date().toISOString() })
          .eq('request_id', reqRow.id);
        await notifyRequest(reqRow.id, 'reauth_needed');
        results.scheduledFailed.push({ id: reqRow.id, reason: String(reason) });
      };

      // Pull the saved card from the service-role-only side table.
      const { data: pm, error: pmErr } = await supabase
        .from('request_payment_methods')
        .select('stripe_customer_id, stripe_payment_method_id, auth_attempts')
        .eq('request_id', reqRow.id)
        .maybeSingle();
      if (pmErr || !pm || !pm.stripe_customer_id || !pm.stripe_payment_method_id) {
        console.error(`[auto-reverse] scheduled-auth: no saved card for ${reqRow.id}`);
        await failReauth('no_saved_card', 0);
        continue;
      }

      const amountCents = Math.round(Number(reqRow.estimated_total) * 100);
      if (!amountCents || amountCents < 50) {
        console.error(`[auto-reverse] scheduled-auth: invalid amount for ${reqRow.id}`);
        await failReauth('invalid_amount', pm.auth_attempts);
        continue;
      }

      // Stable idempotency key + the optimistic claim together prevent a
      // duplicate hold across reruns.
      const result = await placeScheduledHold({
        db: supabase,
        stripe,
        request: reqRow,
        pm,
        idempotencyKey: `sched-auth-${reqRow.id}`,
      });

      if (result.status === 'authorized') {
        results.scheduledAuthorized.push({ id: reqRow.id, payment_intent_id: result.paymentIntentId });
      } else if (result.status === 'needs_reauth') {
        // Card decline / authentication_required / non-usable PI status — customer must act.
        await failReauth(result.reason, pm.auth_attempts);
      } else {
        // Transient (network/Stripe outage) — release the claim so the next
        // daily run retries.
        console.error(`[auto-reverse] scheduled-auth transient error for ${reqRow.id}:`, result.message);
        await supabase.from('service_requests').update({ payment_status: 'payment_scheduled' }).eq('id', reqRow.id);
        results.scheduledFailed.push({ id: reqRow.id, reason: `transient:${result.reason}` });
      }
    }
  }

  console.log(`[auto-reverse] Done. Reversed: ${results.reversed.length}, Skipped: ${results.skipped.length}, Failed: ${results.failed.length}, OrphansVoided: ${results.orphansVoided.length}, ScheduledAuthorized: ${results.scheduledAuthorized.length}, ScheduledFailed: ${results.scheduledFailed.length}`);
  res.status(200).json(results);
};

function appendNote(existing, note) {
  return existing ? `${existing}\n${note}` : note;
}
