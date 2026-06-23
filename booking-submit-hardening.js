// Hard timeout ownership for the final Book Request click.
(() => {
  if (!document.body?.classList.contains('booking-page') && !document.body?.classList.contains('returning-page')) return;
  const PREFIX = '[booking-submit-hardening]';
  const TIMEOUT_MS = 12000;
  let locked = false;
  const log = (m, d) => d === undefined ? console.log(PREFIX, m) : console.log(PREFIX, m, d);
  const err = (m, e) => console.error(PREFIX, m, e);

  function setStatus(panel, type, message) {
    const status = panel?.querySelector('[data-submit-status]');
    if (!status) return;
    status.dataset.status = type || '';
    status.textContent = message || '';
    status.hidden = false;
  }

  function unlock(panel, submitted = false) {
    log('Page unlocked');
    locked = false;
    try { bookingState.submitting = false; } catch (_) {}
    [document.documentElement, document.body, document.querySelector('[data-booking-flow]'), document.querySelector('.booking-flow-shell')].forEach((el) => {
      if (!el) return;
      el.style.pointerEvents = '';
      el.style.overflow = '';
      el.removeAttribute('aria-busy');
      el.classList.remove('is-submitting', 'is-loading', 'booking-locked', 'page-locked', 'disabled');
    });
    document.querySelectorAll('.booking-submit-overlay, .booking-loading-overlay, .loading-overlay, .page-loading-overlay, .blocking-overlay, .modal-backdrop').forEach((el) => el.remove());
    const submit = panel?.querySelector('[data-submit-booking]') || document.querySelector('[data-submit-booking]');
    const cancel = panel?.querySelector('[data-cancel-authorization]') || document.querySelector('[data-cancel-authorization]');
    if (submit && !submitted) {
      submit.disabled = false;
      submit.hidden = false;
      submit.textContent = 'Book request';
      submit.removeAttribute('aria-busy');
    }
    if (cancel && !submitted) {
      cancel.disabled = false;
      cancel.hidden = false;
      cancel.textContent = 'Cancel authorization';
      cancel.removeAttribute('aria-busy');
    }
  }

  function publicNumber(id) {
    try { return publicRequestNumber(id); } catch (_) { return `SF-${String(id || '').slice(0, 8).toUpperCase()}`; }
  }

  function showSuccess(panel, data) {
    const number = publicNumber(data.id);
    bookingState.submitted = true;
    bookingState.submittedRequestNumber = number;
    const fields = panel.querySelector('.booking-step-fields');
    if (fields) {
      fields.innerHTML = `<div class="submission-success"><h3>Request received.</h3><p>Your request number is: <strong>${escapeHtml(number)}</strong></p><p>Use Track My Vehicle to follow your request.</p><div class="admin-button-row"><button class="button primary" type="button" data-new-booking>Submit a new request</button><a class="button secondary" href="track.html">Track My Vehicle</a></div></div>`;
    }
    setStatus(panel, 'success', `Request received. Your request number is ${number}.`);
    const actions = panel.querySelector('.booking-step-actions');
    if (actions) actions.hidden = true;
    panel.querySelectorAll('[data-submit-booking], [data-cancel-authorization]').forEach((button) => { button.hidden = true; });
  }

  function makePayload() {
    // Prefer the more complete frozen-quote payload (full fee breakdown frozen
    // at authorization time, not just the total) when it's available.
    if (typeof window.freezeAuthorizedQuote === 'function' && typeof window.makePayloadFromFrozenQuote === 'function') {
      window.freezeAuthorizedQuote();
      const payload = window.makePayloadFromFrozenQuote();
      log('Frozen quote total loaded', { amountCents: payload.amount_cents, total: payload.estimated_total });
      log('Stripe authorization/payment intent loaded', { paymentIntentId: payload.payment_intent_id, amountCents: payload.amount_cents });
      return payload;
    }

    const totals = calculateTotals();
    const payload = buildBookingPayload();
    const amountCents = Math.round(Number(bookingState.payment.authorizedAmountCents || totals.estimatedTotal * 100));
    payload.amount_cents = amountCents;
    payload.estimated_total = amountCents / 100;
    payload.authorized_amount = amountCents / 100;
    payload.rounded_customer_total = amountCents / 100;
    payload.booking_idempotency_key = bookingState.payment.paymentIntentId || payload.payment_intent_id || '';
    log('Frozen quote total loaded', { amountCents, total: amountCents / 100 });
    log('Stripe authorization/payment intent loaded', { paymentIntentId: payload.payment_intent_id, amountCents });
    return payload;
  }

  async function submit(panel, button) {
    log('Book request clicked');
    if (locked || bookingState.submitting || bookingState.submitted) return;
    let submitted = false;
    try {
      locked = true;
      bookingState.submitting = true;
      unlock(panel, false);
      locked = true;
      bookingState.submitting = true;
      savePanelValues(panel);
      log('Validation started');
      if (!bookingState.payment.authorized || !bookingState.payment.paymentIntentId) {
        setStatus(panel, 'error', 'Please authorize payment before submitting.');
        return;
      }
      if (!bookingState.values.reviewConfirmed) {
        setStatus(panel, 'error', 'Please confirm the booking information before submitting.');
        return;
      }
      log('Validation passed');
      const stored = sessionStorage.getItem(`shiftfuel_booking_request_${bookingState.payment.paymentIntentId}`);
      if (stored) {
        const data = JSON.parse(stored);
        if (data?.id) { showSuccess(panel, data); submitted = true; return; }
      }
      const payload = makePayload();
      button.disabled = true;
      button.textContent = 'Submitting...';
      setStatus(panel, 'warning', 'Submitting booking...');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      log('Supabase insert started');
      const response = await Promise.race([
        fetch('/api/create-authorized-booking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Booking is taking longer than expected.')), TIMEOUT_MS)),
      ]).finally(() => clearTimeout(timer));
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.id) throw new Error(data.error || 'Could not submit booking.');
      log('Supabase insert succeeded', data);
      sessionStorage.setItem(`shiftfuel_booking_request_${bookingState.payment.paymentIntentId}`, JSON.stringify(data));
      log('Request number created', { requestNumber: publicNumber(data.id), requestId: data.id });
      showSuccess(panel, data);
      submitted = true;
      log('Submit finished');
    } catch (error) {
      err('Submit failed', error);
      const timeout = error?.name === 'AbortError' || /longer than expected|timed out/i.test(error?.message || '');
      setStatus(panel, 'error', timeout
        ? 'Booking is taking longer than expected. Please try again or cancel the authorization. Your card has not been charged.'
        : `Your payment authorization was approved, but the request could not be created. Your card has not been charged. You can try again or cancel the authorization. ${error.message || ''}`.trim());
    } finally {
      unlock(panel, submitted);
    }
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-submit-booking]');
    if (!button) return;
    const panel = button.closest('.booking-accordion-card');
    if (!panel) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    submit(panel, button);
  }, true);
  window.unlockBookingPage = unlock;
})();
