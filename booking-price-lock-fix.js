// Freeze the authorized booking quote so admin price edits cannot break checkout after Stripe approval.
(() => {
  if (!document.body?.classList.contains('booking-page') && !document.body?.classList.contains('returning-page')) return;

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

  async function submitWithFrozenQuote(panel, button) {
    if (bookingState.submitting || bookingState.submitted) return;
    savePanelValues(panel);
    const status = panel.querySelector('[data-submit-status]');
    const setStatus = (type, message) => {
      if (status) {
        status.dataset.status = type;
        status.textContent = message;
      }
    };

    if (!bookingState.payment.authorized || !bookingState.payment.paymentIntentId) {
      setStatus('error', 'Please authorize payment before submitting.');
      return;
    }
    if (!bookingState.values.reviewConfirmed) {
      setStatus('error', 'Please confirm the booking information before submitting.');
      return;
    }

    if (!bookingState.payment.authorizedQuote) freezeAuthorizedQuote();
    const payload = makePayloadFromFrozenQuote();

    bookingState.submitting = true;
    if (button) {
      button.disabled = true;
      button.textContent = 'Submitting...';
    }
    setStatus('warning', 'Submitting booking...');

    try {
      const res = await fetch('/api/create-authorized-booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not submit booking.');

      bookingState.submitted = true;
      bookingState.submittedRequestNumber = typeof publicRequestNumber === 'function'
        ? publicRequestNumber(data.id)
        : `SF-${String(data.id || '').slice(0, 8).toUpperCase()}`;

      const fields = panel.querySelector('.booking-step-fields');
      if (fields) {
        fields.innerHTML = `
          <div class="submission-success">
            <h3>Request received.</h3>
            <p>Your request number is: <strong>${escapeHtml(bookingState.submittedRequestNumber)}</strong></p>
            <p>Use Track My Vehicle to follow your request.</p>
            <div class="admin-button-row">
              <button class="button primary" type="button" data-new-booking>Submit a new request</button>
              <a class="button secondary" href="track.html">Track My Vehicle</a>
            </div>
          </div>
        `;
      }
      setStatus('success', '');
      const actions = panel.querySelector('.booking-step-actions');
      if (actions) actions.hidden = true;
      if (button) button.hidden = true;
    } catch (error) {
      console.error('Frozen quote booking submit failed:', error);
      const msg = error.message || 'Could not submit booking. Please try again.';
      const clearer = msg.includes('price changed') || msg.includes('re-authorize')
        ? 'The price changed before your request was submitted. Please re-authorize the updated total before booking.'
        : msg;
      setStatus('error', clearer);
      if (button) {
        button.disabled = false;
        button.textContent = 'Book request';
      }
    } finally {
      bookingState.submitting = false;
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
      freezeAuthorizedQuote();
      setTimeout(() => updateFrozenQuoteCopy(document), 0);
    });

    document.addEventListener('click', (event) => {
      const submit = event.target.closest('[data-submit-booking]');
      if (!submit) return;
      const panel = submit.closest('.booking-accordion-card');
      if (!panel) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      submitWithFrozenQuote(panel, submit);
    }, true);

    const root = document.querySelector('[data-booking-flow]');
    if (root) {
      new MutationObserver(() => updateFrozenQuoteCopy(root)).observe(root, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
