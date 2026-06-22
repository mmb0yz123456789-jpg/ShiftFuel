// Admin production-readiness polish.
// This layer improves clarity and safety without changing Supabase/Stripe request logic.
(() => {
  if (!document.body?.classList.contains('admin-portal-page')) return;

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

  function safeFormatPhone(value) {
    const digits = text(value).replace(/\D/g, '');
    if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    return value || 'Not provided';
  }

  function requestById(id) {
    try {
      if (typeof allRequests !== 'undefined') return allRequests.find((request) => request.id === id);
    } catch (_) {}
    return null;
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

  function enhance(root = document) {
    applyReasonDropdowns(root);
    root.querySelectorAll('.request-card').forEach(addProductionSummary);
    root.querySelectorAll('.complete-panel').forEach(addChargeReview);
    polishText(root);
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
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) enhance(node);
      });
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      enhance();
      observer.observe(document.body, { childList: true, subtree: true });
    });
  } else {
    enhance();
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();
