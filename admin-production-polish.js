// Admin production-readiness polish.
// This layer improves clarity and safety without changing Supabase/Stripe request logic.
(() => {
  if (!document.body?.classList.contains('admin-portal-page')) return;

  if (!document.querySelector('link[data-admin-dashboard-refinements]')) {
    const refinementCss = document.createElement('link');
    refinementCss.rel = 'stylesheet';
    refinementCss.href = 'admin-dashboard-refinements.css';
    refinementCss.dataset.adminDashboardRefinements = '1';
    document.head.appendChild(refinementCss);
  }

  const DENY_REASONS = [
    'Address outside service area',
    'Customer information incomplete',
    'Duplicate request',
    'Invalid payment authorization',
    'No worker available',
    'Unsafe location',
    'Vehicle inaccessible',
    'Weather/safety issue',
    'Other',
  ];

  const CANCEL_REASONS = [
    'Customer requested cancellation',
    'Customer requested vehicle return',
    'Keys not available',
    'Vehicle inaccessible',
    'Payment issue',
    'Service cannot be completed',
    'Weather/safety issue',
    'Worker safety concern',
    'Other',
  ];

  const ATTENTION_STATUSES = new Set([
    'pending', 'request_received', 'payment_issue', 'authorization_too_low',
    'pending_customer_payment', 'return_requested', 'customer_return_requested',
    'cancelled_pending_key_return',
  ]);

  const CANCELLED_STATUSES = new Set(['customer_canceled', 'canceled', 'cancelled', 'canceled_return_completed', 'cancelled_pending_key_return']);
  const ARCHIVED_STATUSES = new Set(['unable_to_complete', 'auto_reversed', 'closed_no_charge']);

  function text(value) {
    return String(value ?? '').trim();
  }

  function html(value) {
    return text(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function moneyValue(value) {
    const amount = Number(value || 0);
    return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  }

  function publicTicket(id) {
    return `SF-${String(id || '').slice(0, 8).toUpperCase()}`;
  }

  function getAllRequests() {
    try {
      if (typeof allRequests !== 'undefined' && Array.isArray(allRequests)) return allRequests;
    } catch (_) {}
    return [];
  }

  function selectedRequestId() {
    return document.querySelector('.request-card[data-request-id]')?.dataset.requestId || '';
  }

  function selectedRequestCard() {
    const id = selectedRequestId();
    return id ? document.querySelector(`.request-card[data-request-id="${CSS.escape(id)}"]`) : null;
  }

  function safeFormatPhone(value) {
    const digits = text(value).replace(/\D/g, '');
    if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    return value || 'Not provided';
  }

  function requestById(id) {
    return getAllRequests().find((request) => request.id === id) || null;
  }

  function requestFinalTotal(request) {
    if (!request) return 0;
    if (request.final_total != null) return Number(request.final_total || 0);
    try {
      if (typeof receiptTotalsFromNotes === 'function' && typeof finalTotalFromSavedReceipts === 'function') {
        return Number(finalTotalFromSavedReceipts(request, receiptTotalsFromNotes(request)) || 0);
      }
    } catch (_) {}
    return Number(request.estimated_total || 0);
  }

  function replaceOptions(select, options) {
    if (!select || select.dataset.productionOptionsApplied) return;
    const current = select.value;
    select.innerHTML = '<option value="">— Select a reason —</option>' +
      options.map((option) => `<option value="${html(option)}">${html(option)}</option>`).join('');
    if (options.includes(current)) select.value = current;
    select.dataset.productionOptionsApplied = '1';
  }

  function enforceOtherRequired(panel, selectClass, wrapClass, inputClass) {
    const select = panel?.querySelector(selectClass);
    const wrap = panel?.querySelector(wrapClass);
    const input = panel?.querySelector(inputClass);
    if (!select || !wrap || !input) return;
    const isOther = select.value === 'Other';
    wrap.hidden = !isOther;
    input.required = isOther;
  }

  function applyReasonDropdowns(root = document) {
    root.querySelectorAll('.deny-reason-panel').forEach((panel) => {
      replaceOptions(panel.querySelector('.deny-reason-select'), DENY_REASONS);
      enforceOtherRequired(panel, '.deny-reason-select', '.deny-reason-other-wrap', '.deny-reason-other');
    });

    root.querySelectorAll('.service-unable-panel, .return-request-banner').forEach((panel) => {
      const select = panel.querySelector('.service-unable-reason');
      if (select) replaceOptions(select, CANCEL_REASONS);
      enforceOtherRequired(panel, '.service-unable-reason', '.service-unable-other-wrap', '.service-unable-other');
    });
  }

  function addProductionSummary(card) {
    if (!card || card.querySelector('.admin-production-summary')) return;
    const id = card.dataset.requestId;
    const request = requestById(id);
    if (!request) return;

    const address = typeof adminFormatAddress === 'function'
      ? adminFormatAddress(request)
      : [request.address_street, request.address_apt, request.address_city, request.address_state, request.address_zip].filter(Boolean).join(', ');
    const service = typeof adminFormatService === 'function' ? adminFormatService(request) : request.service_type;
    const vehicle = [request.vehicle_year, request.vehicle_make, request.vehicle_model].filter(Boolean).join(' ') || 'Not provided';
    const status = typeof statusLabels !== 'undefined' ? (statusLabels[request.status] || request.status) : request.status;
    const paymentStatus = typeof paymentStatusLabel === 'function' ? paymentStatusLabel(request) : (request.payment_status || 'Not started');

    const summary = document.createElement('section');
    summary.className = 'admin-production-summary';
    summary.innerHTML = `
      <div class="admin-production-fact"><span>Request number</span><strong>${html(publicTicket(request.id))}</strong></div>
      <div class="admin-production-fact"><span>Customer</span><strong>${html(request.customer_name || 'Customer')}</strong></div>
      <div class="admin-production-fact"><span>Phone</span><strong>${html(safeFormatPhone(request.customer_phone))}</strong></div>
      <div class="admin-production-fact"><span>Email</span><strong>${html(request.customer_email || 'Not provided')}</strong></div>
      <div class="admin-production-fact full-span"><span>Service address</span><strong>${html(address || 'Not provided')}</strong></div>
      <div class="admin-production-fact"><span>Vehicle</span><strong>${html(vehicle)}</strong></div>
      <div class="admin-production-fact"><span>License plate</span><strong>${html(request.license_plate || 'Not provided')}</strong></div>
      <div class="admin-production-fact full-span"><span>Service type</span><strong>${html(service || 'Not provided')}</strong></div>
      <div class="admin-production-fact"><span>Desired return</span><strong>${html(request.desired_return_time || 'Not selected')}</strong></div>
      <div class="admin-production-fact"><span>Current status</span><strong>${html(status || 'Unknown')}</strong></div>
      <div class="admin-production-fact"><span>Payment status</span><strong>${html(paymentStatus)}</strong></div>
    `;

    card.querySelector('.request-card-header')?.after(summary);
  }

  function addChargeReview(panel) {
    if (!panel || panel.querySelector('.admin-final-charge-review')) return;
    const id = panel.dataset.completeFor;
    const request = requestById(id);
    if (!request) return;

    let receiptTotals = { fuel: 0, wash: 0 };
    let fees = { fuel: 0, wash: 0, inspection: 0, recovery: 0 };
    try {
      if (typeof receiptTotalsFromNotes === 'function') receiptTotals = receiptTotalsFromNotes(request);
      if (typeof feeSummary === 'function') fees = feeSummary(request, receiptTotals);
    } catch (_) {}

    const finalTotal = requestFinalTotal(request);
    const review = document.createElement('section');
    review.className = 'admin-final-charge-review';
    review.innerHTML = `
      <h5>Final charge review</h5>
      <div class="admin-final-charge-grid">
        <div><span>Fuel receipt total</span><strong>${moneyValue(receiptTotals.fuel)}</strong></div>
        <div><span>Car wash receipt total</span><strong>${moneyValue(receiptTotals.wash)}</strong></div>
        <div><span>Fuel service fee</span><strong>${moneyValue(fees.fuel)}</strong></div>
        <div><span>Car wash service fee</span><strong>${moneyValue(fees.wash)}</strong></div>
        <div><span>Add-ons</span><strong>${moneyValue(fees.inspection)}</strong></div>
        <div><span>Adjustments/recovery</span><strong>${moneyValue(fees.recovery)}</strong></div>
        <div class="final-total-row"><span>Final total</span><strong>${moneyValue(finalTotal)}</strong></div>
      </div>
    `;
    panel.querySelector('.request-details')?.after(review);
  }

  function ensureLastUpdatedControl() {
    if (document.querySelector('#admin-last-updated')) return;
    const refresh = document.querySelector('#admin-refresh-btn');
    if (!refresh) return;
    const stamp = document.createElement('span');
    stamp.id = 'admin-last-updated';
    stamp.className = 'admin-last-updated';
    stamp.textContent = 'Last updated: —';
    refresh.insertAdjacentElement('afterend', stamp);
  }

  function markLastUpdated() {
    ensureLastUpdatedControl();
    const stamp = document.querySelector('#admin-last-updated');
    if (!stamp) return;
    const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    stamp.textContent = `Last updated: ${time}`;
  }

  function normalizeRevenueLabel() {
    const label = document.querySelector('#stat-revenue-label');
    if (!label) return;
    // Current calculation is displayed service-fee revenue, not true net profit after all costs.
    label.textContent = label.textContent.replace(/^Net Revenue/i, 'Revenue');
  }

  function updateRequestsBadge() {
    const requests = getAllRequests();
    const nav = document.querySelector('.admin-page-tab[data-page="requests"]');
    if (!nav) return;

    let badge = nav.querySelector('.requests-attention-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'page-tab-badge requests-attention-badge';
      nav.appendChild(badge);
    }

    const count = requests.filter((request) => ATTENTION_STATUSES.has(request.status)).length;
    badge.textContent = count;
    badge.hidden = count <= 0;
    nav.setAttribute('aria-label', count > 0 ? `Requests, ${count} need attention` : 'Requests');
  }

  function updateClosedBreakdown() {
    const tabs = document.querySelector('.admin-request-tabs');
    if (!tabs) return;
    let breakdown = document.querySelector('.admin-closed-breakdown');
    if (!breakdown) {
      breakdown = document.createElement('div');
      breakdown.className = 'admin-closed-breakdown';
      tabs.insertAdjacentElement('afterend', breakdown);
    }

    const requests = getAllRequests();
    const completed = requests.filter((r) => r.status === 'complete').length;
    const cancelled = requests.filter((r) => CANCELLED_STATUSES.has(r.status)).length;
    const denied = requests.filter((r) => r.status === 'denied').length;
    const archived = requests.filter((r) => ARCHIVED_STATUSES.has(r.status)).length;
    const htmlText = `
      <span><strong>${completed}</strong> Completed</span>
      <span><strong>${cancelled}</strong> Cancelled</span>
      <span><strong>${denied}</strong> Denied</span>
      <span><strong>${archived}</strong> Archived/Closed</span>
    `;
    if (breakdown.innerHTML.trim() !== htmlText.trim()) breakdown.innerHTML = htmlText;
  }

  function updateOpenEmptyState() {
    const empty = document.querySelector('#request-list .empty-state');
    const openSelected = document.querySelector('#show-open')?.classList.contains('active');
    if (!empty || !openSelected || empty.dataset.productionOpenState === '1') return;

    empty.dataset.productionOpenState = '1';
    empty.innerHTML = `
      <p><strong>No open requests right now.</strong><br>Use All Requests to view completed or closed requests.</p>
      <div class="empty-state-actions">
        <button class="button primary empty-create-request" type="button">Create Request</button>
        <button class="button secondary empty-view-all" type="button">View All Requests</button>
      </div>
    `;
  }

  function updateQuickActionsState() {
    const hasSelected = Boolean(selectedRequestId());
    document.querySelectorAll('.admin-action-card').forEach((card) => {
      const label = card.querySelector('strong')?.textContent.trim().toLowerCase() || '';
      const requiresSelection = label === 'assign worker' || label === 'edit request';
      if (!requiresSelection) return;
      card.disabled = !hasSelected;
      card.setAttribute('aria-disabled', String(!hasSelected));
      card.classList.toggle('is-disabled', !hasSelected);
      if (!hasSelected) {
        card.title = 'Select a request first.';
      } else {
        card.title = label === 'assign worker' ? 'Assign or review the selected request worker.' : 'Edit the selected request.';
      }
    });
  }

  function handleQuickAction(card, event) {
    const label = card.querySelector('strong')?.textContent.trim().toLowerCase() || '';
    const requiresSelection = label === 'assign worker' || label === 'edit request';
    if (!requiresSelection) return false;

    const cardEl = selectedRequestCard();
    if (!cardEl) {
      event.preventDefault();
      event.stopImmediatePropagation();
      updateQuickActionsState();
      return true;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    if (label === 'assign worker') {
      const select = cardEl.querySelector('.assign-worker-select');
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => select?.focus(), 250);
      return true;
    }

    const editButton = cardEl.querySelector('.edit-request');
    editButton?.click();
    cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return true;
  }

  function polishText(root = document) {
    root.querySelectorAll('.capture-and-proceed').forEach((button) => {
      button.dataset.productionChargeAmount = String(requestFinalTotal(requestById(button.dataset.id)) || 0);
      button.title = 'Confirm Final Charge & Complete Request';
    });
    root.querySelectorAll('.proceed-to-key-return').forEach((button) => {
      if (/complete request/i.test(button.textContent)) button.textContent = 'Confirm Complete Request';
    });
    root.querySelectorAll('.edit-notes').forEach((textarea) => {
      const label = textarea.closest('label');
      if (label && !label.dataset.productionNotesLabel) {
        label.dataset.productionNotesLabel = '1';
        const first = Array.from(label.childNodes).find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.includes('Admin notes'));
        if (first) first.textContent = 'Internal admin notes ';
      }
    });
    const findSearch = document.querySelector('#find-tickets-search');
    if (findSearch) findSearch.placeholder = 'Search by name, phone, email, request number, vehicle, plate, status, or date';
  }

  function enhance(root = document, options = {}) {
    ensureLastUpdatedControl();
    applyReasonDropdowns(root);
    root.querySelectorAll('.request-card').forEach(addProductionSummary);
    root.querySelectorAll('.complete-panel').forEach(addChargeReview);
    polishText(root);
    normalizeRevenueLabel();
    updateRequestsBadge();
    updateClosedBreakdown();
    updateOpenEmptyState();
    updateQuickActionsState();
    if (options.markUpdated) markLastUpdated();
  }

  function confirmationMessage(button) {
    const id = button.dataset.id || button.dataset.requestId || '';
    const request = requestById(id);
    const amount = requestFinalTotal(request);

    if (button.matches('.capture-and-proceed')) {
      return `Are you sure you want to charge this customer ${moneyValue(amount)} and mark the request complete?`;
    }
    if (button.matches('.retry-payment-capture')) {
      return `Retry charging this customer ${moneyValue(amount)}?`;
    }
    if (button.matches('.proceed-to-key-return')) {
      return 'Are you sure you want to mark this request complete?';
    }
    if (button.matches('.save-deny-reason')) {
      return 'Deny this request and release/refund payment if applicable?';
    }
    if (button.matches('.waive-return-fee')) {
      return 'Waive the return/cancellation fee and release the customer payment hold?';
    }
    if (button.matches('.charge-return-fee')) {
      return 'Charge the displayed return/cancellation amount and close this request?';
    }
    if (button.matches('.permanently-delete-worker')) {
      return 'Permanently delete this inactive worker? This cannot be undone.';
    }
    if (button.matches('.save-total-edit, .edit-total-charge-btn')) {
      return 'Edit the final total? Make sure the payment/refund record is reviewed after saving.';
    }
    if (button.matches('.retry-release-hold')) {
      return 'Release this customer card hold now?';
    }
    if (button.matches('.update-status')) {
      const nextStatus = button.dataset.status || '';
      if (nextStatus === 'complete') return 'Complete this request now?';
      if (nextStatus.includes('closed') || nextStatus.includes('archive')) return 'Archive or close this request?';
    }
    return '';
  }

  document.addEventListener('change', (event) => {
    if (event.target.matches('.deny-reason-select')) {
      enforceOtherRequired(event.target.closest('.deny-reason-panel'), '.deny-reason-select', '.deny-reason-other-wrap', '.deny-reason-other');
    }
    if (event.target.matches('.service-unable-reason')) {
      enforceOtherRequired(event.target.closest('.service-unable-panel'), '.service-unable-reason', '.service-unable-other-wrap', '.service-unable-other');
    }
  }, true);

  document.addEventListener('click', (event) => {
    const emptyCreate = event.target.closest('.empty-create-request');
    if (emptyCreate) {
      event.preventDefault();
      document.querySelector('.admin-page-tab[data-page="create-request"]')?.click();
      return;
    }

    const emptyAll = event.target.closest('.empty-view-all');
    if (emptyAll) {
      event.preventDefault();
      document.querySelector('#show-all')?.click();
      return;
    }

    const quickCard = event.target.closest('.admin-action-card');
    if (quickCard && handleQuickAction(quickCard, event)) return;

    const button = event.target.closest('button');
    if (!button || button.dataset.productionConfirmed === '1') return;
    const message = confirmationMessage(button);
    if (!message) return;
    if (!window.confirm(message)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    button.dataset.productionConfirmed = '1';
    setTimeout(() => { delete button.dataset.productionConfirmed; }, 1500);
  }, true);

  const observer = new MutationObserver((mutations) => {
    let requestListChanged = false;
    for (const mutation of mutations) {
      if (mutation.target?.id === 'request-list' || mutation.target?.closest?.('#request-list')) {
        requestListChanged = true;
      }
      if (mutation.target?.id === 'stat-revenue-label') normalizeRevenueLabel();
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) enhance(node);
      });
    }
    enhance(document, { markUpdated: requestListChanged });
  });

  function start() {
    enhance(document);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
