/**
 * api/_scheduled-auth.js
 *
 * Shared helper for placing the off-session, manual-capture Stripe hold on a
 * saved-card (advance) booking. Two call sites use it:
 *
 *   1. api/auto-reverse-payments.js — the daily cron's third pass, which places
 *      the hold ~2 days before the service date for `payment_scheduled` requests.
 *   2. api/payments.js (handleAdminRetryScheduledAuth) — admin "retry" for a
 *      request that landed in `needs_reauth`.
 *
 * The two callers construct their Stripe/Supabase clients differently
 * (auto-reverse builds its own `Stripe(...)`/`createClient(...)`; payments uses
 * `getStripe()`/`getSupabaseAdmin()`), so the clients are passed in rather than
 * imported here.
 *
 * This helper owns the parts that must never drift between the two: the
 * PaymentIntent create params and the success-path DB writes (both tables). It
 * does NOT perform the failure-path DB writes, because the two callers handle
 * failure differently (the cron flips `service_requests` back/forward, notifies,
 * and bumps the attempt counter; the admin retry only records on
 * `request_payment_methods` and returns an HTTP error, and skips the attempt
 * bump for a non-capture PI status). Instead it returns a classified result and
 * lets each caller apply its own failure handling.
 *
 * Returns one of:
 *   { status: 'authorized',   paymentIntentId }            — hold placed; both tables updated.
 *   { status: 'needs_reauth', reason, piStatus }           — PI created but not a usable hold
 *                                                            (requires_action/processing/etc.);
 *                                                            `piStatus` is the raw PI status.
 *   { status: 'needs_reauth', reason }                     — definitive card failure (decline /
 *                                                            authentication_required / card_declined).
 *   { status: 'error',        reason, message }            — transient error (network/Stripe outage);
 *                                                            safe to retry. `reason` is the code,
 *                                                            `message` the raw Stripe error message.
 */

async function placeScheduledHold({ db, stripe, request, pm, idempotencyKey }) {
  const amountCents = Math.round(Number(request.estimated_total) * 100);

  let pi;
  try {
    // Stripe params here are the single source of truth for both call sites.
    pi = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      customer: pm.stripe_customer_id,
      payment_method: pm.stripe_payment_method_id,
      off_session: true,
      confirm: true,
      capture_method: 'manual',
      description: `ShiftFuel scheduled ${request.service_date || ''}`.trim(),
    }, { idempotencyKey });
  } catch (err) {
    const code = err.code || err.decline_code || 'auth_failed';
    const isCardError = err.type === 'StripeCardError'
      || err.code === 'authentication_required'
      || err.code === 'card_declined'
      || /requires_action|authentication/i.test(String(err.message || ''));
    if (isCardError) {
      // Definitive — the customer must re-authorize.
      return { status: 'needs_reauth', reason: code };
    }
    // Transient (network/Stripe outage) — caller decides whether to release/retry.
    return { status: 'error', reason: code, message: err.message };
  }

  if (pi.status === 'requires_capture') {
    await db.from('service_requests')
      .update({ payment_status: 'authorized', payment_intent_id: pi.id })
      .eq('id', request.id);
    await db.from('request_payment_methods')
      .update({ auth_error: null, updated_at: new Date().toISOString() })
      .eq('request_id', request.id);
    return { status: 'authorized', paymentIntentId: pi.id };
  }

  // PI created but not a usable hold (requires_action / processing / etc.) — the
  // customer must act. `piStatus` is surfaced so callers that distinguish this
  // from a thrown card error can do so.
  return { status: 'needs_reauth', reason: `unexpected_status:${pi.status}`, piStatus: pi.status };
}

module.exports = { placeScheduledHold };
