// Freeze the authorized booking quote so admin price edits cannot break checkout after Stripe approval.
// Also hardens final Book Request submission so the page can never stay locked after failure.
(() => {
  if (!document.body?.classList.contains('booking-page') && !document.body?.classList.contains('returning-page')) return;

  const DEBUG_PREFIX = '[booking-submit]';
  const SUBMIT_TIMEOUT_MS = 15000;

  function debug(message, data) {
    if (data !== undefined) console.log(DEBUG_PREFIX, message, data);
    else console.log(DEBUG_PREFIX, message);
  }

  function debugError(message, error) {
    console.error(DEBUG_PREFIX, message, error);
  }

  function money(value) {
    try {
      if (typeof formatMoney === 'function') return formatMoney(value);
    } catch (_) {}
    return `$${(Number(value) || 0).toFixed(2)}`;
  }

  function cloneTotals(totals) {
    return {
      ...totals,
      washPackage: totals?.washPackage ? { ...totals.washPackage } : null,
      frozenAt: new Date().toISOString(),
    };
  }

  function currentQuoteTotals() {
    try {
      if (bookingState?.payment?.authorized && bookingState.payment.authorizedQuote) return bookingState.payment.authorizedQuote;
    } catch (_) {}
    return typeof calculateTotals === 'function' ? calculateTotals() : null;
  }

  function ensurePaymentShape() {
    if (typeof bookingState === 'undefined') return;
    if (!bookingState.payment) bookingState.payment = {};
    if (!Object.prototype.hasOwnProperty.call(bookingState.payment, 'authorizedQuote')) bookingState.payment.authorizedQuote = null;
  }

  function freezeAuthorizedQuote() {
    ensurePaymentShape();
    if (typeof bookingState === 'undefined' || typeof calculateTotals !== 'function') return;
    if (!bookingState.payment.authorized) return;
    const totals = cloneTotals(calculateTotals());
    const cents = Number(bookingState.payment.authorizedAmountCents || Math.round(totals.estimatedTotal * 100));
    totals.estimatedTotal = Math.round(cents) / 100;
    bookingState.payment.authorizedQuote = totals;
    debug('Frozen quote total loaded', { amountCents: cents, total: totals.estimatedTotal });
  }

  function clearFrozenQuoteWhenUnauthorized() {
    try {
      if (!bookingState.payment.authorized) bookingState.payment.authorizedQuote = null;
    } catch (_) {}
  }

  function makePayloadFromFrozenQuote() {
    const payload = buildBookingPayload();
    const totals = currentQuoteTotals();
    const amountCents = Math.round(Number(bookingState.payment.authorizedAmountCents || totals.estimatedTotal * 100));

    payload.amount_cents = amountCents;
    payload.estimated_total = amountCents / 100;
    payload.authorized_amount = amountCents / 100;
    payload.rounded_customer_total = amountCents / 100;
    payload.booking_idempotency_key = bookingState.payment.paymentIntentId || payload.payment_intent_id || '';

    if (totals) {
      payload.estimated_gallons = totals.fuelGallons;
      payload.selected_fuel_gallons = totals.selectedFuelGallons;
      payload.authorization_fuel_gallons = totals.authorizationFuelGallons;
      payload.estimated_fuel_amount = totals.fuelEstimate;
      payload.fuel_convenience_fee = totals.fuelFee;
      payload.wash_fee = totals.washAmount;
      payload.wash_package_label = totals.washPackage?.label || payload.wash_package_label || '';
      payload.wash_convenience_fee = totals.washFee;
      payload.quick_inspection_fee = totals.quickFee;
      payload.service_fee = Number(totals.fuelFee || 0) + Number(totals.washFee || 0);
      payload.base_fuel_service_fee = totals.fuelBaseFee;
      payload.base_car_wash_service_fee = totals.washBaseFee;
      payload.base_inspection_fee = totals.quickFee;
      payload.payment_operating_recovery_amount = totals.recovery;
      payload.displayed_fuel_service_fee = totals.fuelFee;
      payload.displayed_car_wash_service_fee = totals.washFee;
      payload.displayed_inspection_fee = totals.quickFee;
      payload.net_target_amount = totals.netTarget;
      payload.gross_total_before_rounding = totals.grossBeforeRounding;
      payload.notes = [payload.notes || '', `[client_quote_frozen ${totals.frozenAt || new Date().toISOString()}] Customer authorized ${money(amountCents / 100)}.`].filter(Boolean).join('\n');
    }

    return payload;
  }

  function setSubmitStatus(panel, type, message) {
    const status = panel?.querySelector('[data-submit-status]');
    if (status) {
      status.dataset.status = type || '';
      status.textContent = message || '';
      status.hidden = false;
    }
  }

  function storedRequestForPayment(paymentIntentId) {
    if (!paymentIntentId) return null;
    try {
      const raw = sessionStorage.getItem(`shiftfuel_booking_request_${paymentIntentId}`);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function rememberRequestForPayment(paymentIntentId, request) {
    if (!paymentIntentId || !request?.id) return;
    try {
      sessionStorage.setItem(`shiftfuel_booking_request_${paymentIntentId}`, JSON.stringify(request));
    } catch (_) {}
  }

  function restoreClickablePage() {
    [document.documentElement, document.body, document.querySelector('[data-booking-flow]'), document.querySelector('.booking-flow-shell')].forEach((element) => {
      if (!element) return;
      element.style.pointerEvents = '';
      element.classList.remove('is-submitting', 'is-loading', 'booking-locked', 'page-locked', 'disabled');
      element.removeAttribute('aria-busy');
      if (element === document.documentElement || element === document.body) element.style.overflow = '';
    });

    document.querySelectorAll('.booking-submit-overlay, .booking-loading-overlay, .loading-overlay, .page-loading-overlay, .blocking-overlay, .modal-backdrop').forEach((overlay) => {
      overlay.remove();
    });
  }

  function unlockBookingPage(panel, options = {}) {
    debug('Page unlocked');
    try {
      if (typeof bookingState !== 'undefined') bookingState.submitting = false;
    } catch (_) {}

    restoreClickablePage();

    const submitted = Boolean(options.submitted || (typeof bookingState !== 'undefined' && bookingState.submitted));
    const submitButton = panel?.querySelector('[data-submit-booking]') || document.querySelector('[data-submit-booking]');
    const cancelButton = panel?.querySelector('[data-cancel-authorization]') || document.querySelector('[data-cancel-authorization]');

    if (submitButton && !submitted) {
      submitButton.disabled = false;
      submitButton.hidden = false;
      submitButton.textContent = 'Book request';
      submitButton.removeAttribute('aria-busy');
    }
    if (cancelButton && !submitted) {
      cancelButton.disabled = false;
      cancelButton.hidden = false;
      cancelButton.textContent = 'Cancel authorization';
      cancelButton.removeAttribute('aria-busy');
    }

    panel?.querySelectorAll('fieldset').forEach((fieldset) => { fieldset.disabled = false; });
  }

  function showSuccess(panel, data) {
    const requestNumber = typeof publicRequestNumber === 'function'
      ? publicRequestNumber(data.id)
      : `SF-${String(data.id || '').slice(0, 8).toUpperCase()}`;

    bookingState.submitted = true;
    bookingState.submittedRequestNumber = requestNumber;

    const fields = panel.querySelector('.booking-step-fields');
    if (fields) {
      fields.innerHTML = `
        <div class="submission-success">
          <h3>Request received.</h3>
          <p>Your request number is: <strong>${escapeHtml(requestNumber)}</strong></p>
          <p>Use Track My Vehicle to follow your request.</p>
          <div class="admin-button-row">
            <button class="button primary" type="button" data-new-booking>Submit a new request</button>
            <a class="button secondary" href="track.html">Track My Vehicle</a>
          </div>
        </div>
      `;
    }

    setSubmitStatus(panel, 'success', `Request received. Your request number is ${requestNumber}.`);
    const actions = panel.querySelector('.booking-step-actions');
    if (actions) actions.hidden = true;
    const submitButton = panel.querySelector('[data-submit-booking]');
    if (submitButton) submitButton.hidden = true;
    const cancelButton = panel.querySelector('[data-cancel-authorization]');
    if (cancelButton) cancelButton.hidden = true;
  }

  async function submitWithFrozenQuote(panel, button) {
    debug('Book request clicked');
    if (!panel) return;
    if (bookingState.submitted) {
      debug('Submit ignored because request is already submitted');
      return;
    }
    if (bookingState.submitting) {
      debug('Submit ignored because bookingSubmitting lock is active');
      return;
    }

    let safetyTimer = null;
    let controller = null;
    let timedOut = false;

    try {
      bookingState.submitting = true;
      restoreClickablePage();
      savePanelValues(panel);
      debug('Validation started');

      if (!bookingState.payment.authorized || !bookingState.payment.paymentIntentId) {
        debug('Validation failed: missing authorization');
        setSubmitStatus(panel, 'error', 'Please authorize payment before submitting.');
        return;
      }
      if (!bookingState.values.reviewConfirmed) {
        debug('Validation failed: confirmation unchecked');
        setSubmitStatus(panel, 'error', 'Please confirm the booking information before submitting.');
        return;
      }
      debug('Validation passed');

      const existing = storedRequestForPayment(bookingState.payment.paymentIntentId);
      if (existing?.id) {
        debug('Existing request found for payment authorization', existing);
        showSuccess(panel, existing);
        return;
      }

      if (!bookingState.payment.authorizedQuote) freezeAuthorizedQuote();
      const payload = makePayloadFromFrozenQuote();
      debug('Stripe authorization/payment intent loaded', {
        paymentIntentId: payload.payment_intent_id,
        amountCents: payload.amount_cents,
      });

      if (button) {
        button.disabled = true;
        button.textContent = 'Submitting...';
        button.setAttribute('aria-busy', 'true');
      }
      const cancelButton = panel.querySelector('[data-cancel-authorization]');
      if (cancelButton) cancelButton.disabled = false;
      setSubmitStatus(panel, 'warning', 'Submitting booking...');

      controller = new AbortController();
      safetyTimer = window.setTimeout(() => {
        timedOut = true;
        debugError('Submit safety timeout reached', new Error('Booking submit timed out'));
        try { controller.abort(); } catch (_) {}
        setSubmitStatus(panel, 'error', 'Booking is taking longer than expected. Please try again or cancel the authorization. Your card has not been charged.');
        unlockBookingPage(panel);
      }, SUBMIT_TIMEOUT_MS);

      debug('Supabase insert started');
      const res = await fetch('/api/create-authorized-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        debugError('Supabase insert failed', data);
        throw new Error(data.error || 'Could not submit booking.');
      }
      if (!data?.id) {
        debugError('Supabase insert failed: missing request id', data);
        throw new Error('Your request was not created. Please try again.');
      }

      debug('Supabase insert succeeded', data);
      rememberRequestForPayment(bookingState.payment.paymentIntentId, data);
      debug('Request number created', { requestNumber: publicRequestNumber(data.id), requestId: data.id });
      showSuccess(panel, data);
      debug('Redirect/confirmation started');
      debug('Submit finished');
    } catch (error) {
      debugError('Submit failed', error);
      if (timedOut || error?.name === 'AbortError') {
        setSubmitStatus(panel, 'error', 'Booking is taking longer than expected. Please try again or cancel the authorization. Your card has not been charged.');
      } else {
        const message = error?.message || 'We could not submit your request. Your card has not been charged. Please try again.';
        const friendly = /payment authorization|price changed|re-authorize/i.test(message)
          ? 'The booking session expired or the authorization could not be verified. Please review your payment authorization and try again.'
          : `Your payment authorization was approved, but the request could not be created. Your card has not been charged. You can try again or cancel the authorization. ${message}`;
        setSubmitStatus(panel, 'error', friendly);
      }
    } finally {
      if (safetyTimer) window.clearTimeout(safetyTimer);
      unlockBookingPage(panel, { submitted: Boolean(bookingState.submitted) });
    }
  }

  function updateFrozenQuoteCopy(root = document) {
    let quote = null;
    try { quote = bookingState.payment.authorizedQuote; } catch (_) {}
    if (!quote) return;

    root.querySelectorAll('[data-review-summary] .review-summary-list div, [data-payment-summary] .review-summary-list div').forEach((row) => {
      const label = row.querySelector('dt')?.textContent?.trim().toLowerCase() || '';
      const value = row.querySelector('dd');
      if (!value) return;
      if (label === 'estimated total' || label === 'payment authorization total') value.textContent = money(quote.estimatedTotal);
    });
    const sidebarTotal = root.querySelector('.summary-total-amount');
    if (sidebarTotal) sidebarTotal.textContent = money(quote.estimatedTotal);
  }

  function start() {
    ensurePaymentShape();

    const originalInvalidate = typeof invalidatePaymentAuthorization === 'function' ? invalidatePaymentAuthorization : null;
    if (originalInvalidate && !originalInvalidate.__quoteFixPatched) {
      const patched = function patchedInvalidatePaymentAuthorization(...args) {
        const result = originalInvalidate.apply(this, args);
        clearFrozenQuoteWhenUnauthorized();
        return result;
      };
      patched.__quoteFixPatched = true;
      invalidatePaymentAuthorization = patched;
    }

    document.addEventListener('booking-payment-authorized', () => {
      debug('Payment authorization event received');
      freezeAuthorizedQuote();
      setTimeout(() => updateFrozenQuoteCopy(document), 0);
    });

    window.addEventListener('unhandledrejection', (event) => {
      debugError('Unhandled promise rejection caught', event.reason);
      const panel = document.querySelector('.booking-accordion-card.is-active');
      if (panel?.querySelector('[data-submit-booking]')) {
        setSubmitStatus(panel, 'error', 'Something went wrong while booking. Your card has not been charged. Please try again or cancel the authorization.');
        unlockBookingPage(panel);
      }
    });

    const root = document.querySelector('[data-booking-flow]');
    if (root) {
      new MutationObserver(() => updateFrozenQuoteCopy(root)).observe(root, { childList: true, subtree: true });
    }
  }

  window.unlockBookingPage = unlockBookingPage;
  window.freezeAuthorizedQuote = freezeAuthorizedQuote;
  window.makePayloadFromFrozenQuote = makePayloadFromFrozenQuote;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
