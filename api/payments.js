/**
 * /api/payments.js
 *
 * Single Vercel Serverless Function that handles all payment operations.
 * The caller must include an `action` field in the POST body to select the handler.
 *
 * Actions (all POST):
 *   create_intent            – Create a manual-capture PaymentIntent for booking authorization
 *   create_customer_final    – Create an automatic-capture PI for customer final payment (no pre-auth)
 *   customer_capture         – Confirm/capture payment on a pending_customer_payment request
 *   customer_cancel          – Cancel a request (customer-authenticated) and void any hold
 *   worker_capture           – Worker completes job; auto-captures the pre-authorized PI
 *   cancel_payment           – Admin/worker: void an authorized (uncaptured) hold
 *   capture_payment          – Admin: manually capture an authorized PI
 *   refund                   – Admin: refund a captured payment
 *   mark_keys_returned       – Admin/worker: record key hand-back and complete the request
 *   customer_request_return  – Customer: request the vehicle be returned after key receipt (no free cancel)
 *   resolve_return_request   – Admin: waive fee / charge $15 fee / continue service for a return request
 */

const Stripe = require('stripe');
const { setCorsHeaders, getSupabaseAdmin, verifyAdminToken, verifyWorkerToken, verifyAnyStaffToken } = require('./_auth');

// ── Shared helpers ────────────────────────────────────────────────────────────

function cleanPhone(value) {
  return String(value || '').replace(/\D/g, '');
}

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY not configured');
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

async function markRequestComplete(db, requestId, paymentIntentId) {
  const { error } = await db.from('service_requests').update({
    status: 'awaiting_key_return',
    payment_status: 'captured',
    payment_intent_id: paymentIntentId,
    updated_at: new Date().toISOString(),
  }).eq('id', requestId);

  if (error) {
    console.error('[payments] markComplete DB error for request', requestId, '—', error.message);
    throw new Error('DB_UPDATE_FAILED');
  }

  // Verify the write landed.
  const { data: verified, error: vErr } = await db
    .from('service_requests')
    .select('id, status, payment_status, payment_intent_id')
    .eq('id', requestId)
    .maybeSingle();

  if (vErr || !verified || verified.status !== 'awaiting_key_return' || verified.payment_status !== 'captured') {
    console.error('[payments] post-write verify failed for request', requestId, JSON.stringify(verified), vErr?.message);
    throw new Error('DB_UPDATE_FAILED');
  }
}

// ── Action handlers ───────────────────────────────────────────────────────────

async function handleCreateIntent(body, res) {
  // Booking authorization — manual capture, no DB involvement here.
  const { amount_cents, customer_name, customer_email, service_label } = body;

  const parsedCents = Math.round(Number(amount_cents));
  if (!parsedCents || parsedCents < 50) {
    return res.status(400).json({ error: 'Amount must be at least $0.50' });
  }
  if (parsedCents > 200000) {
    return res.status(400).json({ error: 'Amount exceeds the maximum allowed for this service' });
  }

  try {
    const stripe = getStripe();
    const pi = await stripe.paymentIntents.create({
      amount: parsedCents,
      currency: 'usd',
      capture_method: 'manual',
      description: service_label || 'ShiftFuel service',
      receipt_email: customer_email || undefined,
      metadata: { customer_name: customer_name || '', service_label: service_label || '' },
    });
    console.log('[payments/create_intent] Created', pi.id, 'amount:', parsedCents);
    return res.status(200).json({ client_secret: pi.client_secret, payment_intent_id: pi.id });
  } catch (err) {
    console.error('[payments/create_intent] Stripe error:', err.message);
    return res.status(500).json({ error: 'Could not initialize payment. Please try again.' });
  }
}

async function handleCreateCustomerFinal(body, res) {
  // Creates an automatic-capture PI for customers who don't have a pre-auth on file.
  const { request_id, phone, email } = body;

  if (!request_id || !phone || !email) {
    return res.status(400).json({ error: 'request_id, phone, and email are required' });
  }

  const db = getSupabaseAdmin();
  const { data: request, error: reqErr } = await db
    .from('service_requests')
    .select('id, customer_phone, customer_email, customer_name, status, final_total, service_label, payment_intent_id, payment_status')
    .eq('id', request_id)
    .maybeSingle();

  if (reqErr || !request) return res.status(404).json({ error: 'Request not found' });

  const phoneMatch = cleanPhone(request.customer_phone) === cleanPhone(phone);
  const emailMatch = (request.customer_email || '').toLowerCase() === (email || '').toLowerCase();
  if (!phoneMatch || !emailMatch) {
    return res.status(403).json({ error: 'Your phone and email do not match this request' });
  }
  const awaitingCustomerPayment = ['pending_customer_payment', 'payment_issue', 'authorization_too_low'];
  if (!awaitingCustomerPayment.includes(request.status)) {
    return res.status(400).json({ error: 'This request is not awaiting customer payment' });
  }
  if (request.payment_intent_id && request.payment_status === 'authorized') {
    return res.status(400).json({
      error: 'A payment authorization already exists. Please use the existing payment confirmation.',
      has_pre_auth: true,
    });
  }
  if (request.final_total == null || request.final_total <= 0) {
    return res.status(400).json({ error: 'Final total is not set. Please contact ShiftFuel.' });
  }

  const amountCents = Math.round(request.final_total * 100);
  if (amountCents < 50) return res.status(400).json({ error: 'Amount is too small to process' });

  try {
    const stripe = getStripe();
    const pi = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      capture_method: 'automatic',
      description: request.service_label || 'ShiftFuel service',
      receipt_email: request.customer_email || undefined,
      metadata: {
        request_id: String(request_id),
        customer_name: request.customer_name || '',
        customer_email: request.customer_email || '',
        service_label: request.service_label || '',
        purpose: 'customer_final_payment',
      },
    });
    console.log('[payments/create_customer_final] PI', pi.id, 'amount:', amountCents, 'for request', request_id);
    return res.status(200).json({ client_secret: pi.client_secret, payment_intent_id: pi.id });
  } catch (err) {
    console.error('[payments/create_customer_final] Stripe error:', err.message);
    return res.status(500).json({ error: 'Could not initialize payment. Please try again.' });
  }
}

async function handleCustomerCapture(body, res) {
  const { request_id, phone, email, new_payment_intent_id } = body;

  if (!request_id || !phone || !email) {
    return res.status(400).json({ error: 'request_id, phone, and email are required' });
  }

  const db = getSupabaseAdmin();
  const { data: request, error: reqErr } = await db
    .from('service_requests')
    .select('id, customer_phone, customer_email, customer_name, payment_intent_id, payment_status, status, final_total')
    .eq('id', request_id)
    .maybeSingle();

  if (reqErr || !request) {
    console.error('[payments/customer_capture] Request lookup failed:', reqErr?.message);
    return res.status(404).json({ error: 'Request not found' });
  }

  const phoneMatch = cleanPhone(request.customer_phone) === cleanPhone(phone);
  const emailMatch = (request.customer_email || '').toLowerCase() === (email || '').toLowerCase();
  if (!phoneMatch || !emailMatch) {
    return res.status(403).json({ error: 'Your phone and email do not match this request' });
  }

  const awaitingCustomerPayment = ['pending_customer_payment', 'payment_issue', 'authorization_too_low'];
  if (!awaitingCustomerPayment.includes(request.status)) {
    if (['complete', 'awaiting_key_return'].includes(request.status) && request.payment_status === 'captured') {
      return res.status(200).json({ status: 'already_complete' });
    }
    return res.status(400).json({ error: 'This request is not awaiting customer payment' });
  }
  if (request.payment_status === 'captured' && !new_payment_intent_id) {
    await markRequestComplete(db, request_id, request.payment_intent_id);
    return res.status(200).json({ status: 'succeeded', already_captured: true });
  }

  const stripe = getStripe();

  // ── Case B: customer paid with a new card ─────────────────────────────────
  if (new_payment_intent_id) {
    try {
      const intent = await stripe.paymentIntents.retrieve(new_payment_intent_id);
      if (intent.status !== 'succeeded') {
        return res.status(400).json({ error: 'Payment was not confirmed. Please try again.' });
      }
      if (intent.currency !== 'usd') {
        return res.status(400).json({ error: 'Payment currency mismatch. Please contact ShiftFuel.' });
      }
      if (request.final_total == null) {
        return res.status(400).json({ error: 'Final total is not set. Please contact ShiftFuel.' });
      }
      const expectedCents = Math.round(request.final_total * 100);
      if (intent.amount !== expectedCents) {
        return res.status(400).json({ error: 'Payment amount does not match the final total. Please contact ShiftFuel.' });
      }
      if (intent.metadata?.request_id && String(intent.metadata.request_id) !== String(request_id)) {
        return res.status(400).json({ error: 'Payment reference mismatch. Please contact ShiftFuel.' });
      }
      const { data: existingUse } = await db
        .from('service_requests')
        .select('id')
        .eq('payment_intent_id', new_payment_intent_id)
        .neq('id', request_id)
        .maybeSingle();
      if (existingUse) {
        return res.status(400).json({ error: 'This payment has already been applied to another request. Please contact ShiftFuel.' });
      }
      await markRequestComplete(db, request_id, new_payment_intent_id);
      console.log('[payments/customer_capture] New card payment succeeded for request', request_id);
      return res.status(200).json({ status: 'succeeded' });
    } catch (err) {
      if (err.message === 'DB_UPDATE_FAILED') {
        return res.status(500).json({ error: `Payment was processed, but we could not update your request. Contact ShiftFuel and reference request ${request_id}.` });
      }
      console.error('[payments/customer_capture] New PI verification failed:', err.message);
      return res.status(500).json({ error: 'Payment verification failed. Please try again.' });
    }
  }

  // ── Case A: capture the existing pre-authorized PI ────────────────────────
  const piId = request.payment_intent_id;
  if (!piId) return res.status(400).json({ error: 'No payment authorization found for this request' });
  if (request.final_total == null) return res.status(400).json({ error: 'Final total is not set. Please contact ShiftFuel.' });

  const amountToCaptureInCents = Math.round(request.final_total * 100);
  try {
    const intentCheck = await stripe.paymentIntents.retrieve(piId);
    if (intentCheck.status === 'succeeded') {
      await markRequestComplete(db, request_id, piId);
      return res.status(200).json({ status: 'succeeded', already_captured: true });
    }
    if (intentCheck.status !== 'requires_capture') {
      return res.status(400).json({ error: 'Payment authorization is no longer valid. Please contact ShiftFuel.' });
    }
    if (intentCheck.amount_capturable < amountToCaptureInCents) {
      return res.status(400).json({ error: 'The authorized amount is less than the final total. Please contact ShiftFuel.' });
    }
    const intent = await stripe.paymentIntents.capture(piId, { amount_to_capture: amountToCaptureInCents });
    console.log('[payments/customer_capture] Captured', intent.id, 'for request', request_id);
    await markRequestComplete(db, request_id, piId);
    return res.status(200).json({ status: intent.status, amount_captured: intent.amount_captured });
  } catch (err) {
    if (err.message === 'DB_UPDATE_FAILED') {
      return res.status(500).json({ error: `Payment was processed, but we could not update your request. Contact ShiftFuel and reference request ${request_id}.` });
    }
    if (err.code === 'payment_intent_unexpected_state') {
      try {
        const intent = await stripe.paymentIntents.retrieve(piId);
        if (intent.status === 'succeeded') {
          await markRequestComplete(db, request_id, piId);
          return res.status(200).json({ status: 'succeeded', already_captured: true });
        }
      } catch (_) {}
      return res.status(400).json({ error: 'Payment could not be processed. Please contact ShiftFuel.' });
    }
    console.error('[payments/customer_capture] Stripe error:', err.message);
    return res.status(500).json({ error: 'Payment capture failed. Please try again.' });
  }
}

async function handleCustomerCancel(body, res) {
  const { request_id, phone, email, reason } = body;

  if (!request_id || (!phone && !email)) {
    return res.status(400).json({ error: 'request_id and phone or email are required' });
  }
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'A cancellation reason is required' });
  }

  const db = getSupabaseAdmin();
  const { data: request, error: reqErr } = await db
    .from('service_requests')
    .select('id, payment_intent_id, payment_status, status, customer_phone, customer_email')
    .eq('id', request_id)
    .maybeSingle();

  if (reqErr || !request) return res.status(404).json({ error: 'Request not found' });

  const phoneMatch = phone && cleanPhone(phone) && cleanPhone(phone) === cleanPhone(request.customer_phone);
  const emailMatch = email && email.trim().toLowerCase() === (request.customer_email || '').toLowerCase();
  if (!phoneMatch && !emailMatch) {
    return res.status(403).json({ error: 'Contact details do not match this request' });
  }

  // Free cancellation is only allowed before the worker has received the keys.
  const cancelableStatuses = ['pending', 'request_received', 'pending_review', 'pending_customer_info', 'accepted', 'confirmed', 'assigned'];
  if (!cancelableStatuses.includes(request.status)) {
    return res.status(400).json({ error: `This request cannot be canceled for free at status "${request.status}". Use the "Request vehicle return" option instead.` });
  }

  const timestamp = new Date().toISOString();
  let paymentStatus = request.payment_status;
  let holdReleaseWarning = null;

  const releaseableStatuses = ['authorized', 'requires_capture'];
  const alreadyReleased = ['voided', 'authorization_released', 'refunded', 'failed', 'auto_reversed', 'payment_release_failed'];

  if (request.payment_intent_id && releaseableStatuses.includes(request.payment_status)) {
    try {
      const stripe = getStripe();
      await stripe.paymentIntents.cancel(request.payment_intent_id);
      paymentStatus = 'voided';
      console.log('[payments/customer_cancel] Voided PI', request.payment_intent_id, 'for request', request_id);
    } catch (err) {
      if (err.code === 'payment_intent_unexpected_state') {
        paymentStatus = 'voided';
      } else {
        console.error('[payments/customer_cancel] Failed to void PI:', err.message);
        paymentStatus = 'payment_release_failed';
        holdReleaseWarning = 'Your card hold could not be released automatically. ShiftFuel will release it manually within 1–3 business days.';
      }
    }
  }

  const updateData = {
    status: 'customer_canceled',
    cancellation_reason: reason.trim(),
    canceled_at: timestamp,
    canceled_by: 'customer',
    updated_at: timestamp,
  };
  if (paymentStatus !== request.payment_status) updateData.payment_status = paymentStatus;

  const { error: updateErr } = await db.from('service_requests').update(updateData).eq('id', request_id);
  if (updateErr) {
    console.error('[payments/customer_cancel] DB update failed:', updateErr.message);
    return res.status(500).json({ error: 'Could not cancel the request. Please contact ShiftFuel.' });
  }

  console.log('[payments/customer_cancel] Request', request_id, 'canceled. payment_status:', paymentStatus);
  return res.status(200).json({ success: true, payment_status: paymentStatus, ...(holdReleaseWarning ? { warning: holdReleaseWarning } : {}) });
}

async function handleWorkerCapture(body, res) {
  const { worker_token, request_id } = body;

  if (!worker_token || !request_id) {
    return res.status(400).json({ error: 'worker_token and request_id are required' });
  }

  const employeeId = await verifyWorkerToken(worker_token);
  if (!employeeId) return res.status(401).json({ error: 'Invalid or expired worker session' });

  const db = getSupabaseAdmin();
  const { data: request, error: reqErr } = await db
    .from('service_requests')
    .select('id, payment_intent_id, payment_status, status, final_total')
    .eq('id', request_id)
    .maybeSingle();

  if (reqErr || !request) return res.status(404).json({ error: 'Request not found' });
  if (!request.payment_intent_id) {
    return res.status(400).json({ error: 'No payment authorization found for this request' });
  }
  if (request.payment_status === 'captured') {
    await markRequestComplete(db, request_id, request.payment_intent_id);
    return res.status(200).json({ status: 'succeeded', already_captured: true });
  }
  if (request.final_total == null || request.final_total <= 0) {
    return res.status(400).json({ error: 'Final total is not set. Enter receipt amounts before completing.' });
  }

  const stripe = getStripe();
  const piId = request.payment_intent_id;
  const amountToCaptureInCents = Math.round(request.final_total * 100);

  try {
    const intent = await stripe.paymentIntents.retrieve(piId);
    if (intent.status === 'succeeded') {
      await markRequestComplete(db, request_id, piId);
      return res.status(200).json({ status: 'succeeded', already_captured: true });
    }
    if (intent.status !== 'requires_capture') {
      await db.from('service_requests').update({ payment_status: 'capture_failed', status: 'payment_issue', updated_at: new Date().toISOString() }).eq('id', request_id);
      return res.status(400).json({ capture_failed: true, error: 'Payment authorization has expired or is no longer valid. The customer will need to provide a new payment method.' });
    }
    if (intent.amount_capturable < amountToCaptureInCents) {
      await db.from('service_requests').update({ payment_status: 'capture_failed', status: 'authorization_too_low', updated_at: new Date().toISOString() }).eq('id', request_id);
      return res.status(400).json({ capture_failed: true, error: `The authorized amount ($${(intent.amount_capturable / 100).toFixed(2)}) is less than the final total ($${request.final_total.toFixed(2)}). The customer will need to pay the difference.` });
    }
    const captured = await stripe.paymentIntents.capture(piId, { amount_to_capture: amountToCaptureInCents });
    console.log('[payments/worker_capture] Captured', captured.id, 'for request', request_id);
    await markRequestComplete(db, request_id, piId);
    return res.status(200).json({ status: captured.status, amount_captured: captured.amount_captured });
  } catch (err) {
    if (err.message === 'DB_UPDATE_FAILED') {
      return res.status(500).json({ error: `Payment was captured but we could not update the request. Contact ShiftFuel support and reference request ${request_id}.` });
    }
    if (err.code === 'payment_intent_unexpected_state') {
      try {
        const check = await stripe.paymentIntents.retrieve(piId);
        if (check.status === 'succeeded') {
          await markRequestComplete(db, request_id, piId);
          return res.status(200).json({ status: 'succeeded', already_captured: true });
        }
      } catch (_) {}
    }
    console.error('[payments/worker_capture] Stripe error:', err.message);
    await db.from('service_requests').update({ payment_status: 'capture_failed', status: 'payment_issue', updated_at: new Date().toISOString() }).eq('id', request_id).catch(() => {});
    return res.status(500).json({ capture_failed: true, error: 'Payment capture failed. The customer will be prompted to update their payment method.' });
  }
}

async function handleCancelPayment(body, res) {
  // Admin/worker: void an authorized (uncaptured) hold.
  const { payment_intent_id, request_id, caller_token } = body;

  if (!caller_token) return res.status(401).json({ error: 'Authorization required' });
  const authorized = await verifyAnyStaffToken(caller_token);
  if (!authorized) return res.status(403).json({ error: 'Session expired or invalid. Please log in again.' });
  if (!payment_intent_id || !request_id) {
    return res.status(400).json({ error: 'payment_intent_id and request_id are required' });
  }

  const db = getSupabaseAdmin();
  const { data: request, error: reqErr } = await db
    .from('service_requests')
    .select('id, payment_intent_id, payment_status, status')
    .eq('id', request_id)
    .maybeSingle();

  if (reqErr || !request) return res.status(404).json({ error: 'Request not found' });
  if (request.payment_intent_id !== payment_intent_id) {
    return res.status(403).json({ error: 'Payment intent does not match this request' });
  }
  if (request.payment_status === 'captured') {
    return res.status(400).json({ error: 'Payment has already been captured. Use refund instead.' });
  }

  const alreadyReleased = ['voided', 'authorization_released', 'refunded', 'failed', 'auto_reversed'];
  if (alreadyReleased.includes(request.payment_status)) {
    return res.status(200).json({ status: 'already_released', payment_status: request.payment_status });
  }

  try {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.cancel(payment_intent_id);
    console.log('[payments/cancel_payment] Canceled', intent.id, 'for request', request_id);

    const { error: dbErr } = await db.from('service_requests').update({ payment_status: 'voided', updated_at: new Date().toISOString() }).eq('id', request_id);
    if (dbErr) {
      console.error('[payments/cancel_payment] DB update failed after Stripe cancel:', dbErr.message);
      return res.status(200).json({ status: intent.status, warning: 'Stripe hold released but database update failed. Contact support.' });
    }
    return res.status(200).json({ status: intent.status, payment_status: 'voided' });
  } catch (err) {
    if (err.code === 'payment_intent_unexpected_state') {
      try {
        const stripe = getStripe();
        const check = await stripe.paymentIntents.retrieve(payment_intent_id);
        const finalStatus = check.status === 'succeeded' ? 'captured' : 'voided';
        await db.from('service_requests').update({ payment_status: finalStatus, updated_at: new Date().toISOString() }).eq('id', request_id);
        return res.status(200).json({ status: check.status, payment_status: finalStatus, already_finalized: true });
      } catch (_) {
        return res.status(200).json({ status: 'already_finalized' });
      }
    }
    await db.from('service_requests').update({ payment_status: 'payment_release_failed', updated_at: new Date().toISOString() }).eq('id', request_id).catch(() => {});
    console.error('[payments/cancel_payment] Stripe error:', err.message);
    return res.status(500).json({ error: 'Payment hold release failed. Please cancel the authorization manually in Stripe.', payment_status: 'payment_release_failed' });
  }
}

async function handleCapturePayment(body, res) {
  // Admin manual capture of an authorized PI.
  const { payment_intent_id, request_id, amount_cents, caller_token } = body;

  if (!caller_token) return res.status(401).json({ error: 'Authorization required' });
  const authorized = await verifyAnyStaffToken(caller_token);
  if (!authorized) return res.status(403).json({ error: 'Session expired or invalid. Please log in again.' });
  if (!payment_intent_id || !request_id) {
    return res.status(400).json({ error: 'payment_intent_id and request_id are required' });
  }

  const db = getSupabaseAdmin();
  const { data: request, error: reqErr } = await db
    .from('service_requests')
    .select('id, payment_intent_id, payment_status, status')
    .eq('id', request_id)
    .maybeSingle();

  if (reqErr || !request) return res.status(404).json({ error: 'Request not found' });
  if (request.payment_intent_id !== payment_intent_id) {
    return res.status(403).json({ error: 'Payment intent does not match this request' });
  }
  if (request.payment_status === 'captured') {
    return res.status(200).json({ status: 'succeeded', already_captured: true });
  }
  if (request.payment_status !== 'authorized') {
    return res.status(400).json({ error: 'Payment is not in an authorized state' });
  }

  try {
    const stripe = getStripe();
    const captureParams = {};
    if (amount_cents && amount_cents >= 50) captureParams.amount_to_capture = Math.round(amount_cents);
    const intent = await stripe.paymentIntents.capture(payment_intent_id, captureParams);
    console.log('[payments/capture_payment] Captured', intent.id, 'for request', request_id);

    // Update DB: captured payment moves request to awaiting key return.
    await markRequestComplete(db, request_id, payment_intent_id);

    return res.status(200).json({ status: intent.status, amount_captured: intent.amount_captured });
  } catch (err) {
    if (err.code === 'payment_intent_unexpected_state') {
      return res.status(200).json({ status: 'already_finalized' });
    }
    console.error('[payments/capture_payment] Error:', err.message);
    await db.from('service_requests').update({ payment_status: 'capture_failed', status: 'payment_issue', updated_at: new Date().toISOString() }).eq('id', request_id).catch(() => {});
    return res.status(500).json({ capture_failed: true, error: 'Payment capture failed. The customer will be prompted to update their payment method.' });
  }
}

async function handleRefund(body, res) {
  // Admin-only refund of a captured payment.
  const { payment_intent_id, request_id, amount_cents, caller_token } = body;

  if (!caller_token) return res.status(401).json({ error: 'Authorization required' });
  const isAdmin = await verifyAdminToken(caller_token);
  if (!isAdmin) return res.status(403).json({ error: 'Admin access required for refunds' });
  if (!payment_intent_id || !request_id) {
    return res.status(400).json({ error: 'payment_intent_id and request_id are required' });
  }

  const db = getSupabaseAdmin();
  const { data: request, error: reqErr } = await db
    .from('service_requests')
    .select('id, payment_intent_id, payment_status')
    .eq('id', request_id)
    .maybeSingle();

  if (reqErr || !request) return res.status(404).json({ error: 'Request not found' });
  if (request.payment_intent_id !== payment_intent_id) {
    return res.status(403).json({ error: 'Payment intent does not match this request' });
  }
  if (request.payment_status !== 'captured') {
    return res.status(400).json({ error: 'Only captured payments can be refunded' });
  }

  try {
    const stripe = getStripe();
    const refundParams = { payment_intent: payment_intent_id };
    if (amount_cents && amount_cents >= 50) refundParams.amount = Math.round(amount_cents);
    const refund = await stripe.refunds.create(refundParams);
    console.log('[payments/refund] Refund', refund.id, 'status:', refund.status, 'for request', request_id);
    return res.status(200).json({ status: refund.status, amount_refunded: refund.amount });
  } catch (err) {
    console.error('[payments/refund] Error:', err.message);
    return res.status(500).json({ error: 'Refund failed. Please try again.' });
  }
}

async function handleMarkKeysReturned(body, res) {
  const { request_id, caller_token, key_returned_to_type, key_returned_to_name_or_location, key_returned_by } = body;

  if (!caller_token) return res.status(401).json({ error: 'Authorization required' });
  const authorized = await verifyAnyStaffToken(caller_token);
  if (!authorized) return res.status(403).json({ error: 'Session expired or invalid. Please log in again.' });

  if (!request_id || !key_returned_to_type || !key_returned_to_name_or_location) {
    return res.status(400).json({ error: 'request_id, key_returned_to_type, and key_returned_to_name_or_location are required' });
  }

  const db = getSupabaseAdmin();
  const { data: request, error: reqErr } = await db
    .from('service_requests')
    .select('id, status')
    .eq('id', request_id)
    .maybeSingle();

  if (reqErr || !request) return res.status(404).json({ error: 'Request not found' });
  if (request.status !== 'awaiting_key_return') {
    return res.status(400).json({ error: 'Request is not awaiting key return' });
  }

  const { error: updateErr } = await db.from('service_requests').update({
    status: 'complete',
    key_returned_to_type,
    key_returned_to_name_or_location,
    key_returned_at: new Date().toISOString(),
    key_returned_by: key_returned_by || null,
    updated_at: new Date().toISOString(),
  }).eq('id', request_id);

  if (updateErr) {
    console.error('[payments/mark_keys_returned] DB error:', updateErr.message);
    return res.status(500).json({ error: 'Could not mark keys as returned. Please try again.' });
  }

  console.log('[payments/mark_keys_returned] Keys returned for request', request_id);
  return res.status(200).json({ status: 'complete' });
}

async function handleCustomerRequestReturn(body, res) {
  const { request_id, phone, email } = body;

  if (!request_id || (!phone && !email)) {
    return res.status(400).json({ error: 'request_id and phone or email are required' });
  }

  const db = getSupabaseAdmin();
  const { data: request, error: reqErr } = await db
    .from('service_requests')
    .select('id, status, customer_phone, customer_email')
    .eq('id', request_id)
    .maybeSingle();

  if (reqErr || !request) return res.status(404).json({ error: 'Request not found' });

  const phoneMatch = phone && cleanPhone(phone) && cleanPhone(phone) === cleanPhone(request.customer_phone);
  const emailMatch = email && email.trim().toLowerCase() === (request.customer_email || '').toLowerCase();
  if (!phoneMatch && !emailMatch) {
    return res.status(403).json({ error: 'Contact details do not match this request' });
  }

  const freeCancelStatuses = ['pending', 'request_received', 'pending_review', 'pending_customer_info', 'accepted', 'confirmed', 'assigned'];
  if (freeCancelStatuses.includes(request.status)) {
    return res.status(400).json({ error: 'This request can still be canceled for free. Use Cancel request instead.' });
  }

  const blockedStatuses = ['complete', 'denied', 'customer_canceled', 'canceled', 'unable_to_complete', 'auto_reversed', 'closed_no_charge', 'canceled_return_completed', 'return_requested', 'customer_return_requested'];
  if (blockedStatuses.includes(request.status)) {
    return res.status(400).json({ error: `A vehicle return cannot be requested at status "${request.status}". Contact ShiftFuel for help.` });
  }

  const timestamp = new Date().toISOString();
  const { error: updateErr } = await db.from('service_requests').update({
    status: 'return_requested',
    pre_return_request_status: request.status,
    return_requested_at: timestamp,
    return_requested_by: 'customer',
    return_request_reason: 'customer_requested_after_key_receipt',
    updated_at: timestamp,
  }).eq('id', request_id);

  if (updateErr) {
    console.error('[payments/customer_request_return] DB update failed:', updateErr.message);
    return res.status(500).json({ error: 'Could not submit your return request. Please contact ShiftFuel.' });
  }

  console.log('[payments/customer_request_return] Return requested for request', request_id);
  return res.status(200).json({ success: true, status: 'return_requested' });
}

async function handleResolveReturnRequest(body, res) {
  const { request_id, caller_token, decision } = body; // decision: 'waive' | 'charge_fee' | 'continue_service'

  if (!caller_token) return res.status(401).json({ error: 'Authorization required' });
  const isAdmin = await verifyAdminToken(caller_token);
  if (!isAdmin) return res.status(403).json({ error: 'Admin access required' });

  if (!request_id || !decision) {
    return res.status(400).json({ error: 'request_id and decision are required' });
  }
  if (!['waive', 'charge_fee', 'continue_service'].includes(decision)) {
    return res.status(400).json({ error: 'Invalid decision' });
  }

  const db = getSupabaseAdmin();
  const { data: request, error: reqErr } = await db
    .from('service_requests')
    .select('id, status, payment_intent_id, payment_status, pre_return_request_status')
    .eq('id', request_id)
    .maybeSingle();

  if (reqErr || !request) return res.status(404).json({ error: 'Request not found' });
  if (request.status !== 'return_requested') {
    return res.status(400).json({ error: 'Request is not awaiting a return-request decision' });
  }

  const timestamp = new Date().toISOString();

  if (decision === 'continue_service') {
    const { error: updateErr } = await db.from('service_requests').update({
      status: request.pre_return_request_status || 'key_received',
      cancellation_fee_decision_by: 'admin',
      cancellation_fee_decision_at: timestamp,
      updated_at: timestamp,
    }).eq('id', request_id);
    if (updateErr) {
      console.error('[payments/resolve_return_request] DB update failed:', updateErr.message);
      return res.status(500).json({ error: 'Could not update the request. Please try again.' });
    }
    return res.status(200).json({ success: true, status: request.pre_return_request_status || 'key_received' });
  }

  const alreadyFinalized = ['voided', 'authorization_released', 'refunded', 'captured', 'cancellation_fee_paid', 'payment_release_failed'];

  if (decision === 'waive') {
    let paymentStatus = request.payment_status;

    if (request.payment_intent_id && !alreadyFinalized.includes(request.payment_status)) {
      try {
        const stripe = getStripe();
        await stripe.paymentIntents.cancel(request.payment_intent_id);
        paymentStatus = 'authorization_released';
      } catch (err) {
        if (err.code === 'payment_intent_unexpected_state') {
          paymentStatus = 'authorization_released';
        } else {
          console.error('[payments/resolve_return_request] Failed to release hold:', err.message);
          return res.status(500).json({ error: 'Payment hold could not be released automatically. Check Stripe.' });
        }
      }
    }

    const { error: updateErr } = await db.from('service_requests').update({
      status: 'canceled_return_completed',
      payment_status: paymentStatus,
      captured_amount: 0,
      cancellation_fee_applied: false,
      cancellation_fee_waived: true,
      cancellation_fee_decision_by: 'admin',
      cancellation_fee_decision_at: timestamp,
      authorization_released_at: timestamp,
      updated_at: timestamp,
    }).eq('id', request_id);

    if (updateErr) {
      console.error('[payments/resolve_return_request] DB update failed:', updateErr.message);
      return res.status(500).json({ error: 'Could not update the request. Please try again.' });
    }
    return res.status(200).json({ success: true, status: 'canceled_return_completed', payment_status: paymentStatus });
  }

  // decision === 'charge_fee'
  if (!request.payment_intent_id) {
    return res.status(400).json({ error: 'No payment authorization exists to charge the fee against.' });
  }
  if (alreadyFinalized.includes(request.payment_status)) {
    return res.status(400).json({ error: 'Payment was already finalized. Use the refund/review flow instead.' });
  }

  try {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.capture(request.payment_intent_id, { amount_to_capture: 1500 });
    console.log('[payments/resolve_return_request] Captured $15 fee for request', request_id);

    const { error: updateErr } = await db.from('service_requests').update({
      status: 'canceled_return_completed',
      payment_status: 'cancellation_fee_paid',
      captured_amount: 15.00,
      cancellation_fee_applied: true,
      cancellation_fee_amount: 15.00,
      cancellation_fee_waived: false,
      cancellation_fee_decision_by: 'admin',
      cancellation_fee_decision_at: timestamp,
      updated_at: timestamp,
    }).eq('id', request_id);

    if (updateErr) {
      console.error('[payments/resolve_return_request] DB update failed after charge:', updateErr.message);
      return res.status(200).json({ success: true, warning: 'Fee charged in Stripe but database update failed. Contact support.' });
    }
    return res.status(200).json({ success: true, status: 'canceled_return_completed', amount_captured: intent.amount_captured });
  } catch (err) {
    console.error('[payments/resolve_return_request] Fee capture failed:', err.message);
    return res.status(500).json({ error: 'Cancellation fee could not be processed. Please review payment status.' });
  }
}

// ── Main router ───────────────────────────────────────────────────────────────

const HANDLERS = {
  create_intent:         handleCreateIntent,
  create_customer_final: handleCreateCustomerFinal,
  customer_capture:      handleCustomerCapture,
  customer_cancel:       handleCustomerCancel,
  worker_capture:        handleWorkerCapture,
  cancel_payment:        handleCancelPayment,
  capture_payment:       handleCapturePayment,
  refund:                handleRefund,
  mark_keys_returned:    handleMarkKeysReturned,
  customer_request_return: handleCustomerRequestReturn,
  resolve_return_request:  handleResolveReturnRequest,
};

module.exports = async (req, res) => {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, ...body } = req.body || {};

  if (!action) {
    return res.status(400).json({ error: 'Missing required field: action' });
  }

  const handler = HANDLERS[action];
  if (!handler) {
    return res.status(400).json({ error: `Unknown action: ${action}` });
  }

  try {
    return await handler(body, res);
  } catch (err) {
    console.error(`[payments/${action}] Unhandled error:`, err.message);
    return res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
  }
};
