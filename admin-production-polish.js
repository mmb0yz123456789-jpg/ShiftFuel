// Admin dashboard card-driven detail panel + filtering fixes.
// Safe display/navigation layer only. Does not change Supabase writes, payment capture, or request status logic.
(() => {
  if (!document.body?.classList.contains('admin-portal-page')) return;

  const MONEY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const CLOSED_STATUSES = new Set(['complete', 'completed', 'finalized', 'denied', 'customer_canceled', 'cancelled', 'canceled', 'closed_no_charge', 'unable_to_complete', 'auto_reversed']);
  const COMPLETE_STATUSES = new Set(['complete', 'completed', 'finalized']);
  const QUICK_ACTIONS = [
    { selector: '.admin-action-card[data-page-action="requests"][data-request-view="unassigned"]', title: 'Assign Worker', subtitle: 'Assign an available worker' },
    { selector: '.admin-action-card[data-page-action="requests"][data-request-view="all"]', title: 'Edit Request', subtitle: 'Update request details' },
    { selector: '.admin-action-card[data-page="create-request"]', title: 'Create Request', subtitle: 'Add a new customer request' },
    { selector: '#admin-side-refresh-btn', title: 'Refresh Dashboard', subtitle: 'Update all data' },
  ];

  let selectedDashboardView = 'open';
  let dashboardSearchTerm = '';
  let dashboardPatched = false;
  let rendering = false;

  const amount = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  };
  const money = (value) => MONEY.format(amount(value));
  const html = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
  const normalizeText = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const digitsOnly = (value) => String(value || '').replace(/\D/g, '');

  function getRequests() {
    try {
      if (typeof allRequests !== 'undefined' && Array.isArray(allRequests)) return allRequests;
    } catch (_) {}
    return [];
  }

  function getEmployees() {
    try {
      if (typeof allEmployees !== 'undefined' && Array.isArray(allEmployees)) return allEmployees;
    } catch (_) {}
    return [];
  }

  function activePage() {
    return document.querySelector('.admin-page-tab.active[data-page]')?.dataset.page || 'dashboard';
  }

  function isDashboardPage() {
    return activePage() === 'dashboard';
  }

  function normalizeRangeValue(value) {
    if (value === 'week') return 'last7';
    if (value === 'this_month') return 'month';
    return value || 'today';
  }

  function rangeLabel(range) {
    return {
      today: 'Today',
      yesterday: 'Yesterday',
      last7: 'Last 7 Days',
      month: 'This Month',
      all: 'All Time',
    }[normalizeRangeValue(range)] || 'Today';
  }

  function currentRange() {
    const filterDateRange = document.querySelector('#dashboard-filter-date-range')?.value;
    const dashboardValue = document.querySelector('#dashboard-range')?.value;
    try {
      return normalizeRangeValue(filterDateRange || dashboardValue || dashboardRange || 'today');
    } catch (_) {
      return normalizeRangeValue(filterDateRange || dashboardValue || 'today');
    }
  }

  function normalizeDashboardRangeSelect() {
    const select = document.querySelector('#dashboard-range');
    if (!select || select.dataset.rangeOptionsFixed === '1') return;
    const current = normalizeRangeValue(select.value || 'today');
    select.innerHTML = `
      <option value="today">Today</option>
      <option value="yesterday">Yesterday</option>
      <option value="last7">Last 7 Days</option>
      <option value="month">This Month</option>
      <option value="all">All Time</option>
    `;
    select.value = ['today', 'yesterday', 'last7', 'month', 'all'].includes(current) ? current : 'today';
    select.dataset.rangeOptionsFixed = '1';
  }

  function rangeBounds(range) {
    const normalized = normalizeRangeValue(range);
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);

    if (normalized === 'all') return { start: null, end: null };
    if (normalized === 'today') {
      end.setDate(end.getDate() + 1);
      return { start, end };
    }
    if (normalized === 'yesterday') {
      start.setDate(start.getDate() - 1);
      return { start, end };
    }
    if (normalized === 'last7') {
      start.setDate(start.getDate() - 6);
      end.setDate(end.getDate() + 1);
      return { start, end };
    }
    if (normalized === 'month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      return { start: monthStart, end: monthEnd };
    }
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  function inRange(stamp, range) {
    const { start, end } = rangeBounds(range);
    if (!start || !end) return true;
    if (!stamp) return false;
    const date = stamp instanceof Date ? stamp : new Date(stamp);
    return !Number.isNaN(date.getTime()) && date >= start && date < end;
  }

  function completionTimestamp(request) {
    const preferredFields = [
      'completed_at',
      'final_payment_processed_at',
      'payment_captured_at',
      'captured_at',
      'charged_at',
      'paid_at',
      'payment_completed_at',
    ];
    for (const field of preferredFields) {
      if (request?.[field]) return request[field];
    }
    // Fallback only for legacy completed records that do not have a dedicated completion timestamp.
    if (COMPLETE_STATUSES.has(String(request?.status || '').toLowerCase())) return request.updated_at || null;
    return null;
  }

  function operationalTimestamp(request) {
    if (request.service_date) return `${request.service_date}T12:00:00`;
    return request.updated_at || request.created_at || null;
  }

  function rangeTimestampForRequest(request, view) {
    if (view === 'completed' || view === 'revenue') return completionTimestamp(request);
    return operationalTimestamp(request);
  }

  function isInSelectedRange(request, view, range = currentRange()) {
    return inRange(rangeTimestampForRequest(request, view), range);
  }

  function isOpenRequest(request) {
    try {
      if (typeof UNASSIGNED_STATUSES !== 'undefined') return UNASSIGNED_STATUSES.includes(request.status);
    } catch (_) {}
    return ['pending', 'request_received'].includes(request.status);
  }

  function isRequestInProgress(request) {
    try {
      if (typeof isOpen === 'function') return isOpen(request) && !isOpenRequest(request);
    } catch (_) {}
    return !isOpenRequest(request) && !CLOSED_STATUSES.has(request.status);
  }

  function isCompletedRequest(request) {
    return COMPLETE_STATUSES.has(String(request.status || '').toLowerCase());
  }

  function statusLabel(status) {
    try {
      if (typeof statusLabels !== 'undefined' && statusLabels[status]) return statusLabels[status];
    } catch (_) {}
    return String(status || 'Unknown').replaceAll('_', ' ');
  }

  function serviceLabel(request) {
    try {
      if (typeof adminFormatService === 'function') return adminFormatService(request);
    } catch (_) {}
    return String(request.service_type || 'Service').replaceAll('-', ' ');
  }

  function phoneLabel(phone) {
    try {
      if (typeof formatPhone === 'function') return formatPhone(phone || '');
    } catch (_) {}
    const digits = digitsOnly(phone);
    if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    return phone || 'Not provided';
  }

  function publicTicket(id) {
    return `SF-${String(id || '').slice(0, 8).toUpperCase()}`;
  }

  function dateLabel(request) {
    if (isCompletedRequest(request)) {
      const completed = completionTimestamp(request);
      if (completed) {
        try {
          return new Date(completed).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
        } catch (_) {}
      }
    }
    if (request.service_date && request.desired_return_time) return `${request.service_date} · ${String(request.desired_return_time).slice(0, 5)}`;
    if (request.service_date) return request.service_date;
    const stamp = request.updated_at || request.created_at;
    if (!stamp) return 'Date not set';
    try {
      return new Date(stamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch (_) {
      return stamp;
    }
  }

  function nextAction(request) {
    const status = String(request.status || '');
    const map = {
      pending: 'Review request',
      request_received: 'Assign or accept request',
      accepted: 'Worker should confirm key received',
      key_received: 'Worker should pick up vehicle',
      vehicle_picked_up: 'Complete requested service',
      service_in_progress: 'Record receipts or service issue',
      fueling_in_progress: 'Record fuel receipt',
      car_wash_in_progress: 'Record car wash receipt',
      fueling_complete: 'Continue remaining service',
      car_wash_complete: 'Continue remaining service',
      receipts_recorded: 'Record return location',
      returned_location_pending: 'Record return location',
      return_location_recorded: 'Upload return photos',
      return_photos_needed: 'Upload return photos',
      vehicle_returned: 'Review final total',
      inspection_needed: 'Complete quick inspection',
      inspection_recorded: 'Confirm final charge',
      awaiting_key_return: 'Document key return',
      pending_customer_payment: 'Waiting for customer payment',
      payment_issue: 'Review payment issue',
      authorization_too_low: 'Review payment issue',
      complete: 'Completed',
      completed: 'Completed',
      finalized: 'Completed',
    };
    return map[status] || 'Review request';
  }

  function receiptTotalsFromRequest(request) {
    const savedFuel = amount(request.actual_fuel_receipt_amount);
    const savedWash = amount(request.actual_car_wash_receipt_amount);
    if (savedFuel || savedWash) return { fuel: savedFuel, wash: savedWash };

    const matches = Array.from(String(request.notes || '').matchAll(/\[receipt_totals fuel=([0-9.]+) wash=([0-9.]+)\]/g));
    const latest = matches.at(-1);
    return {
      fuel: latest ? amount(latest[1]) : 0,
      wash: latest ? amount(latest[2]) : 0,
    };
  }

  function revenueTimestamp(request) {
    return request.payment_captured_at || request.captured_at || request.charged_at || request.final_payment_processed_at || completionTimestamp(request);
  }

  function revenueMetrics(range = currentRange()) {
    const captured = getRequests().filter((request) => request.payment_status === 'captured' && inRange(revenueTimestamp(request), range));
    const refunds = getRequests().filter((request) => ['refunded', 'auto_reversed', 'voided', 'authorization_released'].includes(request.payment_status) && inRange(revenueTimestamp(request), range));

    let gross = 0;
    let receipts = 0;
    let serviceFees = 0;
    let addOns = 0;
    let paymentFees = 0;
    let paymentRecovery = 0;
    let refundsTotal = 0;

    captured.forEach((request) => {
      gross += amount(request.final_total ?? request.captured_amount ?? request.rounded_customer_total);
      const receipt = receiptTotalsFromRequest(request);
      receipts += receipt.fuel + receipt.wash;
      serviceFees += amount(request.displayed_fuel_service_fee) + amount(request.displayed_car_wash_service_fee);
      addOns += amount(request.displayed_inspection_fee);
      paymentFees += amount(request.stripe_fee || request.payment_fee || request.payment_processing_fee);
      paymentRecovery += amount(request.payment_operating_recovery_amount);
    });

    refunds.forEach((request) => {
      refundsTotal += amount(request.final_total ?? request.captured_amount ?? request.rounded_customer_total);
    });

    const hasActualPaymentFees = paymentFees > 0;
    const net = gross - receipts - refundsTotal - (hasActualPaymentFees ? paymentFees : 0);
    return { range, label: rangeLabel(range), captured, gross, receipts, serviceFees, addOns, paymentFees, paymentRecovery, refundsTotal, net, hasActualPaymentFees };
  }

  function serviceTypeMatches(request, selected) {
    if (!selected) return true;
    const type = String(request.service_type || '');
    if (selected === 'fuel') return type === 'fuel' || type === 'fuel-only';
    if (selected === 'car-wash') return type === 'car-wash' || (type.includes('wash') && !type.includes('fuel'));
    if (selected === 'car-wash-fuel') return type.includes('wash') && type.includes('fuel');
    return type === selected;
  }

  function workerMatches(request, selected) {
    if (!selected) return true;
    return request.assigned_employee_id === selected || request.assigned_worker_name === selected;
  }

  function assignmentMatches(request, selected) {
    if (!selected) return true;
    const assigned = Boolean(request.assigned_employee_id || request.assigned_worker_name);
    if (selected === 'assigned') return assigned;
    if (selected === 'unassigned') return !assigned;
    return true;
  }

  function searchMatches(request, term) {
    const clean = normalizeText(term);
    const phoneDigits = digitsOnly(term);
    if (!clean && !phoneDigits) return true;

    const vehicle = [request.vehicle_year, request.vehicle_make, request.vehicle_model, request.vehicle_color].filter(Boolean).join(' ');
    const ticket = publicTicket(request.id);
    const haystack = normalizeText([
      request.customer_name,
      request.customer_email,
      request.customer_phone,
      request.id,
      ticket,
      vehicle,
      request.license_plate,
      request.service_type,
      request.assigned_worker_name,
      statusLabel(request.status),
    ].filter(Boolean).join(' '));

    if (clean && haystack.includes(clean)) return true;
    if (phoneDigits && digitsOnly(request.customer_phone).includes(phoneDigits)) return true;
    return false;
  }

  function currentFilters() {
    return {
      serviceType: document.querySelector('#filter-service-type')?.value || '',
      assignment: document.querySelector('#filter-assignment')?.value || '',
      status: document.querySelector('#dashboard-filter-status')?.value || '',
      worker: document.querySelector('#dashboard-filter-worker')?.value || '',
      paymentStatus: document.querySelector('#dashboard-filter-payment-status')?.value || '',
      range: currentRange(),
      search: dashboardSearchTerm,
    };
  }

  function baseRequestsForView(view, range = currentRange()) {
    const requests = getRequests();
    if (view === 'open') return requests.filter((request) => isOpenRequest(request) && isInSelectedRange(request, 'open', range));
    if (view === 'inprogress') return requests.filter((request) => isRequestInProgress(request) && isInSelectedRange(request, 'inprogress', range));
    if (view === 'completed') return requests.filter((request) => isCompletedRequest(request) && isInSelectedRange(request, 'completed', range));
    return requests.filter((request) => isInSelectedRange(request, view, range));
  }

  function applyDashboardFilters(requests) {
    const filters = currentFilters();
    return requests.filter((request) => {
      if (!serviceTypeMatches(request, filters.serviceType)) return false;
      if (!assignmentMatches(request, filters.assignment)) return false;
      if (!workerMatches(request, filters.worker)) return false;
      if (filters.status && request.status !== filters.status) return false;
      if (filters.paymentStatus && request.payment_status !== filters.paymentStatus) return false;
      if (!searchMatches(request, filters.search)) return false;
      return true;
    });
  }

  function updateMetricCards() {
    const range = currentRange();
    const openCount = applyDashboardFilters(baseRequestsForView('open', range)).length;
    const inProgressCount = applyDashboardFilters(baseRequestsForView('inprogress', range)).length;
    const completedCount = applyDashboardFilters(baseRequestsForView('completed', range)).length;
    const activeWorkerCount = getEmployees().filter((employee) => employee.active).length;
    const metrics = revenueMetrics(range);

    const completedLabel = range === 'all' ? 'Completed' : `Completed ${rangeLabel(range)}`;
    const revenuePrefix = metrics.hasActualPaymentFees ? 'Net Revenue' : 'Gross Revenue';
    const revenueLabel = range === 'all' ? revenuePrefix : `${revenuePrefix} ${rangeLabel(range)}`;

    const statCompletedLabel = document.querySelector('#stat-completed-label');
    const statRevenueLabel = document.querySelector('#stat-revenue-label');
    if (statCompletedLabel) statCompletedLabel.textContent = completedLabel;
    if (statRevenueLabel) statRevenueLabel.textContent = revenueLabel;
    const statOpen = document.querySelector('#stat-open-requests');
    const statProgress = document.querySelector('#stat-in-progress');
    const statCompleted = document.querySelector('#stat-completed-today');
    const statWorkers = document.querySelector('#stat-active-workers');
    const statRevenue = document.querySelector('#stat-net-revenue');
    if (statOpen) statOpen.textContent = openCount;
    if (statProgress) statProgress.textContent = inProgressCount;
    if (statCompleted) statCompleted.textContent = completedCount;
    if (statWorkers) statWorkers.textContent = activeWorkerCount;
    if (statRevenue) statRevenue.textContent = money(metrics.hasActualPaymentFees ? metrics.net : metrics.gross);
  }

  function ensureDashboardPanel() {
    const queueCard = document.querySelector('.admin-queue-card[data-tab-panel="requests"]');
    if (!queueCard) return null;
    let panel = document.querySelector('#dashboard-detail-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'dashboard-detail-panel';
      panel.className = 'dashboard-detail-panel';
      queueCard.prepend(panel);
    }
    return panel;
  }

  function setDashboardMode(active) {
    const queueCard = document.querySelector('.admin-queue-card[data-tab-panel="requests"]');
    const panel = ensureDashboardPanel();
    queueCard?.classList.toggle('dashboard-card-driven-mode', active);
    if (panel) panel.hidden = !active;
    if (!active) {
      document.querySelector('#request-list')?.removeAttribute('hidden');
      document.querySelector('.admin-request-tabs')?.removeAttribute('hidden');
      queueCard?.querySelector(':scope > .admin-toolbar')?.removeAttribute('hidden');
    }
  }

  function updateCardActiveState() {
    document.querySelectorAll('.admin-stat-card[data-dashboard-card-action]').forEach((card) => {
      card.classList.toggle('is-active-dashboard-card', card.dataset.dashboardCardAction === selectedDashboardView && isDashboardPage());
    });
  }

  function requestCard(request) {
    const worker = request.assigned_worker_name || request.assigned_employee_name || 'Unassigned';
    return `
      <article class="dashboard-detail-request-card">
        <div class="dashboard-detail-request-main">
          <div>
            <span class="dashboard-detail-ticket">${html(publicTicket(request.id))}</span>
            <h3>${html(request.customer_name || 'Customer')}</h3>
            <p>${html(phoneLabel(request.customer_phone))}</p>
          </div>
          <span class="status-badge">${html(statusLabel(request.status))}</span>
        </div>
        <dl class="dashboard-detail-grid">
          <div><dt>Service</dt><dd>${html(serviceLabel(request))}</dd></div>
          <div><dt>Worker</dt><dd>${html(worker)}</dd></div>
          <div><dt>Date / time</dt><dd>${html(dateLabel(request))}</dd></div>
          <div><dt>Next action</dt><dd>${html(nextAction(request))}</dd></div>
        </dl>
        <div class="dashboard-detail-actions">
          <button class="button secondary dashboard-manage-request" data-request-id="${html(request.id)}" type="button">Manage request</button>
        </div>
      </article>
    `;
  }

  function emptyState(message) {
    return `<div class="dashboard-detail-empty"><p>${html(message)}</p></div>`;
  }

  function controlsMarkup(resultCount) {
    return `
      <div class="dashboard-detail-controls">
        <label class="dashboard-detail-search">
          <span class="sr-only">Find tickets</span>
          <input id="dashboard-detail-search" type="search" value="${html(dashboardSearchTerm)}" placeholder="Find tickets by name, phone, email, request number, vehicle, or plate">
        </label>
        <span class="dashboard-result-count">${resultCount} result${resultCount === 1 ? '' : 's'}</span>
      </div>
    `;
  }

  function viewAllButton() {
    return '<button class="button secondary dashboard-view-all" type="button">View all requests</button>';
  }

  function renderRequestsPanel(title, eyebrow, baseRequests, emptyMessage) {
    const panel = ensureDashboardPanel();
    if (!panel) return;
    const requests = applyDashboardFilters(baseRequests);
    panel.innerHTML = `
      <div class="dashboard-detail-heading">
        <div>
          <p class="eyebrow">${html(eyebrow)}</p>
          <h2>${html(title)}</h2>
        </div>
        ${viewAllButton()}
      </div>
      ${controlsMarkup(requests.length)}
      <div class="dashboard-detail-list">${requests.length ? requests.map(requestCard).join('') : emptyState(emptyMessage)}</div>
    `;
  }

  function renderWorkersPanel() {
    const panel = ensureDashboardPanel();
    if (!panel) return;
    const filters = currentFilters();
    const jobs = getRequests().filter(isRequestInProgress);
    let workers = getEmployees().filter((employee) => employee.active);
    if (filters.worker) workers = workers.filter((worker) => worker.id === filters.worker);
    if (filters.search) {
      workers = workers.filter((worker) => normalizeText(`${worker.full_name || worker.name || ''} ${worker.phone || ''} ${worker.email || ''}`).includes(normalizeText(filters.search)) || digitsOnly(worker.phone).includes(digitsOnly(filters.search)));
    }

    const body = workers.length
      ? workers.map((worker) => {
          const assignedJobs = jobs.filter((request) => request.assigned_employee_id === worker.id || request.assigned_worker_name === worker.full_name).length;
          return `
            <article class="dashboard-detail-request-card dashboard-worker-card">
              <div class="dashboard-detail-request-main">
                <div>
                  <span class="dashboard-detail-ticket">Active worker</span>
                  <h3>${html(worker.full_name || worker.name || 'Worker')}</h3>
                  <p>${html(phoneLabel(worker.phone))}</p>
                </div>
                <span class="status-badge success">Active</span>
              </div>
              <dl class="dashboard-detail-grid">
                <div><dt>Status</dt><dd>Active / online</dd></div>
                <div><dt>Assigned jobs</dt><dd>${assignedJobs}</dd></div>
                <div><dt>Email</dt><dd>${html(worker.email || 'Not provided')}</dd></div>
                <div><dt>Next action</dt><dd>Review worker profile</dd></div>
              </dl>
              <div class="dashboard-detail-actions">
                <button class="button secondary dashboard-open-worker" data-worker-id="${html(worker.id)}" type="button">View worker</button>
              </div>
            </article>
          `;
        }).join('')
      : emptyState('No active workers right now.');

    panel.innerHTML = `
      <div class="dashboard-detail-heading"><div><p class="eyebrow">Team</p><h2>Active Workers</h2></div>${viewAllButton()}</div>
      ${controlsMarkup(workers.length)}
      <div class="dashboard-detail-list">${body}</div>
    `;
  }

  function renderRevenuePanel() {
    const panel = ensureDashboardPanel();
    if (!panel) return;
    const metrics = revenueMetrics(currentRange());
    const title = `${metrics.hasActualPaymentFees ? 'Net Revenue' : 'Gross Revenue'} ${metrics.label === 'All Time' ? '' : metrics.label}`.trim();
    const filteredCaptured = applyDashboardFilters(metrics.captured);
    const rows = filteredCaptured.length
      ? filteredCaptured.map((request) => {
          const receipt = receiptTotalsFromRequest(request);
          const gross = amount(request.final_total ?? request.captured_amount ?? request.rounded_customer_total);
          const serviceFees = amount(request.displayed_fuel_service_fee) + amount(request.displayed_car_wash_service_fee);
          const addOns = amount(request.displayed_inspection_fee);
          return `
            <article class="dashboard-detail-request-card">
              <div class="dashboard-detail-request-main">
                <div>
                  <span class="dashboard-detail-ticket">${html(publicTicket(request.id))}</span>
                  <h3>${html(request.customer_name || 'Customer')}</h3>
                  <p>${html(serviceLabel(request))}</p>
                </div>
                <strong class="dashboard-money">${money(gross)}</strong>
              </div>
              <dl class="dashboard-detail-grid">
                <div><dt>Receipts</dt><dd>${money(receipt.fuel + receipt.wash)}</dd></div>
                <div><dt>Service fees</dt><dd>${money(serviceFees)}</dd></div>
                <div><dt>Add-ons</dt><dd>${money(addOns)}</dd></div>
                <div><dt>Payment recovery</dt><dd>${money(amount(request.payment_operating_recovery_amount))}</dd></div>
              </dl>
            </article>
          `;
        }).join('')
      : emptyState('No completed charges in this date range.');

    panel.innerHTML = `
      <div class="dashboard-detail-heading"><div><p class="eyebrow">Payments</p><h2>${html(title)}</h2></div>${viewAllButton()}</div>
      ${controlsMarkup(filteredCaptured.length)}
      <div class="dashboard-revenue-summary">
        <div><span>Completed charges:</span><strong>${money(metrics.gross)}</strong></div>
        <div><span>Receipt reimbursements:</span><strong>${money(metrics.receipts)}</strong></div>
        <div><span>Service fees:</span><strong>${money(metrics.serviceFees)}</strong></div>
        <div><span>Add-ons:</span><strong>${money(metrics.addOns)}</strong></div>
        <div><span>Refunds / reversals:</span><strong>${money(metrics.refundsTotal)}</strong></div>
        <div><span>${metrics.hasActualPaymentFees ? 'Payment fees:' : 'Payment fees unavailable:'}</span><strong>${money(metrics.paymentFees)}</strong></div>
        <div><span>Payment recovery:</span><strong>${money(metrics.paymentRecovery)}</strong></div>
        <div><span>${metrics.hasActualPaymentFees ? 'Net revenue:' : 'Estimated net before fees:'}</span><strong>${money(metrics.net)}</strong></div>
      </div>
      <div class="dashboard-detail-list">${rows}</div>
    `;
  }

  function titleForView() {
    const label = rangeLabel(currentRange());
    if (selectedDashboardView === 'completed') return label === 'Today' ? 'Completed Today' : (label === 'All Time' ? 'Completed' : `Completed ${label}`);
    if (selectedDashboardView === 'open') return 'Open Requests';
    if (selectedDashboardView === 'inprogress') return 'In Progress';
    return '';
  }

  function renderDashboardDetail() {
    if (rendering) return;
    rendering = true;
    try {
      if (!isDashboardPage()) {
        setDashboardMode(false);
        updateCardActiveState();
        return;
      }

      normalizeDashboardRangeSelect();
      ensureDashboardFilters();
      setDashboardMode(true);
      updateCardActiveState();
      updateMetricCards();

      if (selectedDashboardView === 'open') {
        renderRequestsPanel(titleForView(), 'Dashboard detail', baseRequestsForView('open'), 'No open requests right now.');
      } else if (selectedDashboardView === 'inprogress') {
        renderRequestsPanel(titleForView(), 'Dashboard detail', baseRequestsForView('inprogress'), 'No requests are currently in progress.');
      } else if (selectedDashboardView === 'completed') {
        renderRequestsPanel(titleForView(), 'Dashboard detail', baseRequestsForView('completed'), 'No requests completed today.');
      } else if (selectedDashboardView === 'workers') {
        renderWorkersPanel();
      } else if (selectedDashboardView === 'revenue') {
        renderRevenuePanel();
      }
    } finally {
      rendering = false;
    }
  }

  function setCardAction(card, action, label) {
    if (!card) return;
    card.dataset.dashboardCardAction = action;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', label);
  }

  function setupDashboardCards() {
    setCardAction(document.querySelector('#stat-open-requests')?.closest('.admin-stat-card'), 'open', 'Show open requests');
    setCardAction(document.querySelector('#stat-in-progress')?.closest('.admin-stat-card'), 'inprogress', 'Show in-progress requests');
    setCardAction(document.querySelector('#stat-completed-today')?.closest('.admin-stat-card'), 'completed', 'Show completed requests');
    setCardAction(document.querySelector('#stat-active-workers')?.closest('.admin-stat-card'), 'workers', 'Show active workers');
    setCardAction(document.querySelector('#stat-net-revenue')?.closest('.admin-stat-card'), 'revenue', 'Show revenue');
  }

  function normalizeQuickAction(card, title, subtitle) {
    if (!card) return;
    const strong = card.querySelector(':scope > strong');
    const span = card.querySelector(':scope > span');
    const stable = strong?.textContent.trim() === title && span?.textContent.trim() === subtitle;
    if (!stable || card.childElementCount < 2) card.innerHTML = `<strong>${title}</strong><span>${subtitle}</span>`;
    card.type = 'button';
  }

  function normalizeQuickActions() {
    QUICK_ACTIONS.forEach(({ selector, title, subtitle }) => normalizeQuickAction(document.querySelector(selector), title, subtitle));
  }

  function normalizeRefreshDuringWork(card) {
    const action = QUICK_ACTIONS.find((item) => item.selector === '#admin-side-refresh-btn');
    if (!action) return;
    card.classList.add('is-refreshing');
    card.setAttribute('aria-busy', 'true');
    const started = Date.now();
    const timer = setInterval(() => {
      normalizeQuickAction(card, action.title, action.subtitle);
      if (!card.disabled || Date.now() - started > 8000) {
        card.classList.remove('is-refreshing');
        card.removeAttribute('aria-busy');
        clearInterval(timer);
        renderDashboardDetail();
      }
    }, 80);
  }

  function openFullRequest(requestId) {
    document.querySelector('.admin-page-tab[data-page="requests"]')?.click();
    setTimeout(() => {
      document.querySelector('#show-all')?.click();
      setTimeout(() => document.querySelector(`.queue-row-toggle[data-id="${CSS.escape(requestId)}"]`)?.click(), 100);
    }, 100);
  }

  function openWorker(workerId) {
    document.querySelector('.admin-page-tab[data-page="workers"]')?.click();
    setTimeout(() => {
      const select = document.querySelector('#worker-profile-select-active') || document.querySelector('#worker-select');
      if (select) {
        select.value = workerId;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        select.focus?.();
      }
    }, 150);
  }

  function uniqueStatuses() {
    return [...new Set(getRequests().map((request) => request.status).filter(Boolean))].sort();
  }

  function uniquePaymentStatuses() {
    return [...new Set(getRequests().map((request) => request.payment_status).filter(Boolean))].sort();
  }

  function ensureDashboardFilters() {
    const panel = document.querySelector('#dashboard-filters-panel');
    if (!panel) return;

    if (!document.querySelector('#dashboard-filter-date-range')) {
      panel.insertAdjacentHTML('beforeend', `
        <label>Date range
          <select id="dashboard-filter-date-range">
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 Days</option>
            <option value="month">This Month</option>
            <option value="all">All Time</option>
          </select>
        </label>
        <label>Status
          <select id="dashboard-filter-status"><option value="">All statuses</option></select>
        </label>
        <label>Worker
          <select id="dashboard-filter-worker"><option value="">All workers</option></select>
        </label>
        <label>Payment status
          <select id="dashboard-filter-payment-status"><option value="">All payment statuses</option></select>
        </label>
      `);
    }

    const dateSelect = document.querySelector('#dashboard-filter-date-range');
    const mainRange = document.querySelector('#dashboard-range');
    if (dateSelect && mainRange && dateSelect.value !== normalizeRangeValue(mainRange.value)) dateSelect.value = normalizeRangeValue(mainRange.value);

    const statusSelect = document.querySelector('#dashboard-filter-status');
    if (statusSelect) {
      const current = statusSelect.value;
      statusSelect.innerHTML = '<option value="">All statuses</option>' + uniqueStatuses().map((status) => `<option value="${html(status)}">${html(statusLabel(status))}</option>`).join('');
      statusSelect.value = current;
    }

    const workerSelect = document.querySelector('#dashboard-filter-worker');
    if (workerSelect) {
      const current = workerSelect.value;
      workerSelect.innerHTML = '<option value="">All workers</option>' + getEmployees().filter((employee) => employee.active).map((employee) => `<option value="${html(employee.id)}">${html(employee.full_name || employee.name || 'Worker')}</option>`).join('');
      workerSelect.value = current;
    }

    const paymentSelect = document.querySelector('#dashboard-filter-payment-status');
    if (paymentSelect) {
      const current = paymentSelect.value;
      paymentSelect.innerHTML = '<option value="">All payment statuses</option>' + uniquePaymentStatuses().map((status) => `<option value="${html(status)}">${html(status.replaceAll('_', ' '))}</option>`).join('');
      paymentSelect.value = current;
    }
  }

  function clearDashboardFilters() {
    dashboardSearchTerm = '';
    ['#filter-service-type', '#filter-assignment', '#dashboard-filter-status', '#dashboard-filter-worker', '#dashboard-filter-payment-status'].forEach((selector) => {
      const el = document.querySelector(selector);
      if (el) el.value = '';
    });
    const range = document.querySelector('#dashboard-range');
    const detailRange = document.querySelector('#dashboard-filter-date-range');
    if (range) range.value = 'today';
    if (detailRange) detailRange.value = 'today';
    renderDashboardDetail();
  }

  function focusDashboardSearch() {
    if (!isDashboardPage()) return;
    renderDashboardDetail();
    setTimeout(() => document.querySelector('#dashboard-detail-search')?.focus(), 50);
  }

  function ensureStyles() {
    if (document.querySelector('#admin-dashboard-card-panel-style')) return;
    const style = document.createElement('style');
    style.id = 'admin-dashboard-card-panel-style';
    style.textContent = `
      .admin-queue-card.dashboard-card-driven-mode > .admin-toolbar,
      .admin-queue-card.dashboard-card-driven-mode > .admin-request-tabs,
      .admin-queue-card.dashboard-card-driven-mode > #request-list { display: none !important; }
      .admin-queue-card.dashboard-card-driven-mode > #dashboard-detail-panel { display: grid !important; }
      .admin-action-card > strong,
      .admin-action-card > span { display: block; }
      .admin-action-card.is-refreshing { position: relative; }
      .admin-action-card.is-refreshing::after { content: ''; position: absolute; right: 14px; top: 14px; width: 14px; height: 14px; border: 2px solid rgba(13,59,59,0.18); border-top-color: var(--sf-teal-dark, #0d3b3b); border-radius: 999px; animation: adminQuickActionSpin 0.7s linear infinite; }
      @keyframes adminQuickActionSpin { to { transform: rotate(360deg); } }
      .admin-stat-card[data-dashboard-card-action] { cursor: pointer; transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease, background 160ms ease; }
      .admin-stat-card[data-dashboard-card-action]:hover { transform: translateY(-2px); border-color: rgba(13,59,59,0.24); box-shadow: 0 16px 40px rgba(13,59,59,0.13); }
      .admin-stat-card[data-dashboard-card-action]:active { transform: translateY(0) scale(0.99); }
      .admin-stat-card[data-dashboard-card-action]:focus-visible { outline: 3px solid rgba(13,59,59,0.22); outline-offset: 3px; }
      .admin-stat-card.is-active-dashboard-card { border-color: rgba(13,59,59,0.42) !important; background: linear-gradient(180deg, #fff, rgba(234,242,234,0.92)); box-shadow: 0 18px 42px rgba(13,59,59,0.14); }
      .dashboard-detail-panel { display: grid; gap: 16px; }
      .dashboard-detail-heading { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 2px 0 8px; }
      .dashboard-detail-heading h2 { margin: 0; color: var(--sf-teal-dark, #0d3b3b); }
      .dashboard-detail-controls { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 12px; background: rgba(234,242,234,.72); border: 1px solid rgba(13,59,59,.08); border-radius: var(--sf-radius-sm, 14px); }
      .dashboard-detail-search { flex: 1 1 360px; margin: 0; }
      .dashboard-detail-search input { width: 100%; }
      .dashboard-result-count { color: var(--sf-muted, #60716d); font-size: .8rem; font-weight: 900; }
      .dashboard-detail-list { display: grid; gap: 12px; }
      .dashboard-detail-request-card { display: grid; gap: 14px; padding: 18px; background: #fff; border: 1px solid rgba(13,59,59,0.10); border-radius: var(--sf-radius-sm, 14px); box-shadow: 0 10px 28px rgba(13,59,59,0.06); }
      .dashboard-detail-request-main { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
      .dashboard-detail-request-main h3 { margin: 3px 0 2px; color: var(--sf-teal-dark, #0d3b3b); }
      .dashboard-detail-request-main p { margin: 0; color: var(--sf-muted, #60716d); }
      .dashboard-detail-ticket { color: var(--sf-muted, #60716d); font-size: 0.76rem; font-weight: 950; letter-spacing: .03em; text-transform: uppercase; }
      .dashboard-detail-grid, .dashboard-revenue-summary { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 10px; margin: 0; }
      .dashboard-detail-grid div, .dashboard-revenue-summary div { display: grid; gap: 4px; padding: 10px 12px; background: var(--sf-sage-light, #edf4ed); border: 1px solid rgba(13,59,59,0.08); border-radius: var(--sf-radius-sm, 14px); }
      .dashboard-detail-grid dt, .dashboard-revenue-summary span { color: var(--sf-muted, #60716d); font-size: .72rem; font-weight: 900; text-transform: uppercase; letter-spacing: .03em; }
      .dashboard-detail-grid dd, .dashboard-revenue-summary strong { margin: 0; color: var(--sf-teal-dark, #0d3b3b); font-weight: 900; }
      .dashboard-detail-actions { display: flex; justify-content: flex-end; }
      .dashboard-detail-empty { padding: 26px; background: linear-gradient(180deg, #fff, var(--sf-sage-light, #edf4ed)); border: 1px dashed rgba(13,59,59,0.18); border-radius: var(--sf-radius-sm, 14px); color: var(--sf-muted, #60716d); }
      .dashboard-detail-empty p { margin: 0; }
      .dashboard-money { color: var(--sf-teal-dark, #0d3b3b); font-size: 1.15rem; }
      .status-badge.success { background: rgba(34,197,94,.12); color: #166534; }
      @media (max-width: 980px) { .dashboard-detail-grid, .dashboard-revenue-summary { grid-template-columns: repeat(2, minmax(0,1fr)); } }
      @media (max-width: 640px) { .dashboard-detail-heading, .dashboard-detail-request-main { flex-direction: column; align-items: stretch; } .dashboard-detail-grid, .dashboard-revenue-summary { grid-template-columns: 1fr; } .dashboard-detail-actions .button, .dashboard-view-all { width: 100%; } }
    `;
    document.head.appendChild(style);
  }

  function patchDashboardStats() {
    ensureStyles();
    normalizeDashboardRangeSelect();
    ensureDashboardFilters();
    normalizeQuickActions();
    setupDashboardCards();
    updateMetricCards();
    renderDashboardDetail();

    try {
      if (typeof updateDashboardStatCards === 'function' && !dashboardPatched) {
        const original = updateDashboardStatCards;
        updateDashboardStatCards = function patchedUpdateDashboardStatCards(...args) {
          original.apply(this, args);
          normalizeDashboardRangeSelect();
          ensureDashboardFilters();
          updateMetricCards();
          setupDashboardCards();
          normalizeQuickActions();
          setTimeout(renderDashboardDetail, 0);
        };
        dashboardPatched = true;
        return true;
      }
    } catch (_) {}
    return false;
  }

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (patchDashboardStats() || attempts > 100) clearInterval(timer);
  }, 100);

  document.addEventListener('click', (event) => {
    const findButton = event.target.closest('#hero-find-tickets-btn');
    if (findButton && isDashboardPage()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      focusDashboardSearch();
      return;
    }

    const refreshCard = event.target.closest('#admin-side-refresh-btn');
    if (refreshCard) window.requestAnimationFrame(() => normalizeRefreshDuringWork(refreshCard));

    const metricCard = event.target.closest('.admin-stat-card[data-dashboard-card-action]');
    if (metricCard) {
      event.preventDefault();
      selectedDashboardView = metricCard.dataset.dashboardCardAction || 'open';
      renderDashboardDetail();
      return;
    }

    const manageRequest = event.target.closest('.dashboard-manage-request');
    if (manageRequest) {
      event.preventDefault();
      openFullRequest(manageRequest.dataset.requestId);
      return;
    }

    const viewAll = event.target.closest('.dashboard-view-all');
    if (viewAll) {
      event.preventDefault();
      document.querySelector('.admin-page-tab[data-page="requests"]')?.click();
      setTimeout(() => document.querySelector('#show-all')?.click(), 100);
      return;
    }

    const workerButton = event.target.closest('.dashboard-open-worker');
    if (workerButton) {
      event.preventDefault();
      openWorker(workerButton.dataset.workerId);
      return;
    }

    const clearButton = event.target.closest('#filter-clear-btn');
    if (clearButton && isDashboardPage()) {
      setTimeout(clearDashboardFilters, 0);
    }
  }, true);

  document.addEventListener('input', (event) => {
    if (event.target?.id === 'dashboard-detail-search') {
      dashboardSearchTerm = event.target.value;
      renderDashboardDetail();
    }
  });

  document.addEventListener('change', (event) => {
    if (event.target?.id === 'dashboard-range') {
      const range = normalizeRangeValue(event.target.value);
      const filterRange = document.querySelector('#dashboard-filter-date-range');
      if (filterRange) filterRange.value = range;
      setTimeout(() => { updateMetricCards(); renderDashboardDetail(); }, 0);
    }

    if (event.target?.id === 'dashboard-filter-date-range') {
      const range = normalizeRangeValue(event.target.value);
      const mainRange = document.querySelector('#dashboard-range');
      if (mainRange) {
        mainRange.value = range;
        try { dashboardRange = range; } catch (_) {}
      }
      setTimeout(() => { updateMetricCards(); renderDashboardDetail(); }, 0);
    }

    if (['filter-service-type', 'filter-assignment', 'dashboard-filter-status', 'dashboard-filter-worker', 'dashboard-filter-payment-status'].includes(event.target?.id)) {
      setTimeout(() => { updateMetricCards(); renderDashboardDetail(); }, 0);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const metricCard = event.target.closest?.('.admin-stat-card[data-dashboard-card-action]');
    if (!metricCard) return;
    event.preventDefault();
    selectedDashboardView = metricCard.dataset.dashboardCardAction || 'open';
    renderDashboardDetail();
  });

  document.addEventListener('click', (event) => {
    if (event.target.closest('.admin-page-tab')) setTimeout(renderDashboardDetail, 150);
  });
})();
