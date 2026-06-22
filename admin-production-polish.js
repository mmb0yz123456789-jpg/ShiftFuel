// Admin dashboard polish.
// Safe display/navigation layer only. Does not change Supabase writes, payment capture, or status logic.
(() => {
  if (!document.body?.classList.contains('admin-portal-page')) return;

  const MONEY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  const QUICK_ACTIONS = [
    { selector: '.admin-action-card[data-page-action="requests"][data-request-view="unassigned"]', title: 'Assign Worker', subtitle: 'Assign an available worker' },
    { selector: '.admin-action-card[data-page-action="requests"][data-request-view="all"]', title: 'Edit Request', subtitle: 'Update request details' },
    { selector: '.admin-action-card[data-page="create-request"]', title: 'Create Request', subtitle: 'Add a new customer request' },
    { selector: '#admin-side-refresh-btn', title: 'Refresh Dashboard', subtitle: 'Update all data' },
  ];

  function amount(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  function money(value) {
    return MONEY.format(amount(value));
  }

  function getRequests() {
    try {
      if (typeof allRequests !== 'undefined' && Array.isArray(allRequests)) return allRequests;
    } catch (_) {}
    return [];
  }

  function currentRange() {
    try {
      return typeof dashboardRange !== 'undefined' ? dashboardRange : (document.querySelector('#dashboard-range')?.value || 'today');
    } catch (_) {
      return document.querySelector('#dashboard-range')?.value || 'today';
    }
  }

  function rangeLabel(range) {
    return { today: 'Today', week: 'This Week', month: 'This Month', all: 'All Time' }[range] || 'Today';
  }

  function isInRange(request, range) {
    try {
      if (typeof isInDashboardRange === 'function') return isInDashboardRange(request, range);
    } catch (_) {}
    if (range === 'all') return true;
    const stamp = new Date(request.updated_at || request.created_at || 0);
    const now = new Date();
    let start = new Date(now);
    if (range === 'today') {
      start.setHours(0, 0, 0, 0);
    } else if (range === 'week') {
      const dayIndex = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - dayIndex);
      start.setHours(0, 0, 0, 0);
    } else if (range === 'month') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    return stamp >= start;
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

  function calculateRevenueMetrics(range = currentRange()) {
    const captured = getRequests().filter((request) => request.payment_status === 'captured' && isInRange(request, range));
    let gross = 0;
    let receipts = 0;
    let paymentRecovery = 0;

    captured.forEach((request) => {
      gross += amount(request.final_total ?? request.captured_amount ?? request.rounded_customer_total);
      const receipt = receiptTotalsFromRequest(request);
      receipts += receipt.fuel + receipt.wash;
      paymentRecovery += amount(request.payment_operating_recovery_amount);
    });

    return {
      range,
      label: rangeLabel(range),
      gross,
      receipts,
      paymentRecovery,
      net: gross - receipts - paymentRecovery,
      captured,
    };
  }

  function normalizeQuickAction(card, title, subtitle) {
    if (!card) return;
    const strong = card.querySelector(':scope > strong');
    const span = card.querySelector(':scope > span');
    const stable = strong?.textContent.trim() === title && span?.textContent.trim() === subtitle;
    if (!stable || card.childElementCount < 2) {
      card.innerHTML = `<strong>${title}</strong><span>${subtitle}</span>`;
    }
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
      }
    }, 80);
  }

  function ensureRevenueBreakdown() {
    const statGrid = document.querySelector('.admin-stat-grid');
    if (!statGrid) return null;
    let breakdown = document.querySelector('#admin-revenue-breakdown');
    if (!breakdown) {
      breakdown = document.createElement('div');
      breakdown.id = 'admin-revenue-breakdown';
      breakdown.className = 'admin-revenue-breakdown';
      breakdown.innerHTML = `
        <div><span data-label="gross">Gross Revenue Today</span><strong data-value="gross">$0.00</strong></div>
        <div><span data-label="receipts">Receipt Reimbursements Today</span><strong data-value="receipts">$0.00</strong></div>
        <div><span data-label="fees">Payment Recovery Today</span><strong data-value="fees">$0.00</strong></div>
        <div><span data-label="net">Net Revenue Today</span><strong data-value="net">$0.00</strong></div>
      `;
      statGrid.insertAdjacentElement('afterend', breakdown);
    }
    return breakdown;
  }

  function updateRevenueDisplay() {
    const metrics = calculateRevenueMetrics();
    const label = document.querySelector('#stat-revenue-label');
    const value = document.querySelector('#stat-net-revenue');
    if (label) label.textContent = `Net Revenue ${metrics.label}`;
    if (value) value.textContent = money(metrics.net);

    const breakdown = ensureRevenueBreakdown();
    if (!breakdown) return;
    breakdown.querySelector('[data-label="gross"]').textContent = `Gross Revenue ${metrics.label}`;
    breakdown.querySelector('[data-label="receipts"]').textContent = `Receipt Reimbursements ${metrics.label}`;
    breakdown.querySelector('[data-label="fees"]').textContent = `Payment Recovery ${metrics.label}`;
    breakdown.querySelector('[data-label="net"]').textContent = `Net Revenue ${metrics.label}`;
    breakdown.querySelector('[data-value="gross"]').textContent = money(metrics.gross);
    breakdown.querySelector('[data-value="receipts"]').textContent = money(metrics.receipts);
    breakdown.querySelector('[data-value="fees"]').textContent = money(metrics.paymentRecovery);
    breakdown.querySelector('[data-value="net"]').textContent = money(metrics.net);
  }

  function setCardAction(card, action, label) {
    if (!card) return;
    card.dataset.dashboardCardAction = action;
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', label);
    if (!card.querySelector('.dashboard-card-hint')) {
      const hint = document.createElement('span');
      hint.className = 'dashboard-card-hint';
      hint.textContent = 'Click to view';
      card.querySelector('div')?.appendChild(hint);
    }
  }

  function setupDashboardCards() {
    setCardAction(document.querySelector('#stat-open-requests')?.closest('.admin-stat-card'), 'open', 'Show open requests');
    setCardAction(document.querySelector('#stat-in-progress')?.closest('.admin-stat-card'), 'inprogress', 'Show in-progress requests');
    setCardAction(document.querySelector('#stat-completed-today')?.closest('.admin-stat-card'), 'completed', 'Show completed requests');
    setCardAction(document.querySelector('#stat-active-workers')?.closest('.admin-stat-card'), 'workers', 'Open active workers');
    setCardAction(document.querySelector('#stat-net-revenue')?.closest('.admin-stat-card'), 'revenue', 'Show revenue summary');
  }

  function scrollToRequests() {
    const section = document.querySelector('.admin-queue-section') || document.querySelector('#request-list');
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function clickFilter(selector) {
    document.querySelector(selector)?.click();
    scrollToRequests();
  }

  function openWorkers() {
    document.querySelector('.admin-page-tab[data-page="workers"]')?.click();
    setTimeout(() => {
      const activeSelect = document.querySelector('#worker-profile-select-active') || document.querySelector('#worker-select');
      activeSelect?.focus?.();
      activeSelect?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    }, 150);
  }

  function requestName(request) {
    const vehicle = [request.vehicle_year, request.vehicle_make, request.vehicle_model].filter(Boolean).join(' ');
    return request.customer_name || vehicle || String(request.id || '').slice(0, 8).toUpperCase();
  }

  function showRevenueModal() {
    document.querySelector('#admin-revenue-modal-overlay')?.remove();
    const metrics = calculateRevenueMetrics('today');
    const rows = metrics.captured.length
      ? metrics.captured.map((request) => {
          const receipt = receiptTotalsFromRequest(request);
          const gross = amount(request.final_total ?? request.captured_amount ?? request.rounded_customer_total);
          const net = gross - receipt.fuel - receipt.wash - amount(request.payment_operating_recovery_amount);
          return `
            <div class="admin-revenue-row">
              <div>
                <strong>${requestName(request)}</strong>
                <span>${String(request.id || '').slice(0, 8).toUpperCase()} · Receipts ${money(receipt.fuel + receipt.wash)}</span>
              </div>
              <strong>${money(net)}</strong>
            </div>
          `;
        }).join('')
      : '<p class="field-help">No captured customer charges today.</p>';

    const overlay = document.createElement('div');
    overlay.id = 'admin-revenue-modal-overlay';
    overlay.className = 'admin-revenue-modal-overlay';
    overlay.innerHTML = `
      <section class="admin-revenue-modal" role="dialog" aria-modal="true" aria-labelledby="admin-revenue-modal-title">
        <div class="admin-revenue-modal-header">
          <div>
            <h3 id="admin-revenue-modal-title">Today’s Revenue Summary</h3>
            <p>Captured customer charges minus receipt reimbursements and payment recovery.</p>
          </div>
          <button class="admin-revenue-modal-close" type="button" aria-label="Close">&times;</button>
        </div>
        <div class="admin-revenue-modal-body">
          <div class="admin-revenue-modal-grid">
            <div><span>Gross Revenue</span><strong>${money(metrics.gross)}</strong></div>
            <div><span>Receipt Reimbursements</span><strong>${money(metrics.receipts)}</strong></div>
            <div><span>Payment Recovery</span><strong>${money(metrics.paymentRecovery)}</strong></div>
            <div><span>Net Revenue</span><strong>${money(metrics.net)}</strong></div>
          </div>
          <div class="admin-revenue-list">${rows}</div>
        </div>
      </section>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.admin-revenue-modal-close')?.focus();
  }

  function handleDashboardCardAction(action) {
    if (action === 'open') clickFilter('#show-open');
    if (action === 'inprogress') clickFilter('#show-inprogress');
    if (action === 'completed') {
      const range = document.querySelector('#dashboard-range');
      if (range) {
        range.value = 'today';
        range.dispatchEvent(new Event('change', { bubbles: true }));
      }
      clickFilter('#show-complete');
    }
    if (action === 'workers') openWorkers();
    if (action === 'revenue') showRevenueModal();
  }

  function patchDashboardStats() {
    normalizeQuickActions();
    setupDashboardCards();
    try {
      if (typeof updateDashboardStatCards === 'function' && !updateDashboardStatCards.__revenuePatched) {
        const original = updateDashboardStatCards;
        updateDashboardStatCards = function patchedUpdateDashboardStatCards(...args) {
          original.apply(this, args);
          updateRevenueDisplay();
          setupDashboardCards();
          normalizeQuickActions();
        };
        updateDashboardStatCards.__revenuePatched = true;
        updateRevenueDisplay();
        return true;
      }
    } catch (_) {}
    return false;
  }

  function ensureStyles() {
    if (document.querySelector('#admin-dashboard-polish-style')) return;
    const style = document.createElement('style');
    style.id = 'admin-dashboard-polish-style';
    style.textContent = `
      .admin-action-card > strong,
      .admin-action-card > span { display: block; }
      .admin-action-card.is-refreshing { position: relative; }
      .admin-action-card.is-refreshing::after {
        content: '';
        position: absolute;
        right: 14px;
        top: 14px;
        width: 14px;
        height: 14px;
        border: 2px solid rgba(13,59,59,0.18);
        border-top-color: var(--sf-coral, #ff6b5a);
        border-radius: 999px;
        animation: adminQuickActionSpin 0.7s linear infinite;
      }
      @keyframes adminQuickActionSpin { to { transform: rotate(360deg); } }
      .admin-stat-card[data-dashboard-card-action] { cursor: pointer; transition: transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease; }
      .admin-stat-card[data-dashboard-card-action]:hover { transform: translateY(-2px); border-color: rgba(255,107,90,0.32); box-shadow: 0 16px 40px rgba(13,59,59,0.13); }
      .admin-stat-card[data-dashboard-card-action]:active { transform: translateY(0) scale(0.99); box-shadow: 0 8px 22px rgba(13,59,59,0.10); }
      .admin-stat-card[data-dashboard-card-action]:focus-visible { outline: 3px solid rgba(255,107,90,0.28); outline-offset: 3px; }
      .admin-stat-card .dashboard-card-hint { display: block; margin-top: 4px; color: var(--sf-muted, #60716d); font-size: 0.72rem; font-weight: 800; }
      .admin-revenue-breakdown { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-top: 14px; }
      .admin-revenue-breakdown div, .admin-revenue-modal-grid div, .admin-revenue-row { padding: 12px; background: rgba(255,255,255,0.92); border: 1px solid rgba(13,59,59,0.10); border-radius: var(--sf-radius-sm, 14px); box-shadow: 0 8px 22px rgba(13,59,59,0.06); }
      .admin-revenue-breakdown span, .admin-revenue-modal-grid span, .admin-revenue-row span { display: block; color: var(--sf-muted, #60716d); font-size: 0.72rem; font-weight: 900; text-transform: uppercase; letter-spacing: 0.03em; }
      .admin-revenue-breakdown strong, .admin-revenue-modal-grid strong, .admin-revenue-row strong { color: var(--sf-teal-dark, #0d3b3b); font-size: 1rem; font-weight: 950; }
      .admin-revenue-modal-overlay { position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center; padding: 20px; background: rgba(13,59,59,0.48); }
      .admin-revenue-modal { width: min(720px, 100%); max-height: min(82vh, 760px); overflow: auto; background: #fff; border-radius: var(--sf-radius-md, 24px); box-shadow: 0 28px 90px rgba(13,59,59,0.28); }
      .admin-revenue-modal-header, .admin-revenue-modal-body { padding: 22px; }
      .admin-revenue-modal-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; border-bottom: 1px solid rgba(13,59,59,0.10); }
      .admin-revenue-modal-header h3 { margin: 0 0 4px; color: var(--sf-teal-dark, #0d3b3b); }
      .admin-revenue-modal-header p { margin: 0; color: var(--sf-muted, #60716d); }
      .admin-revenue-modal-close { border: 0; background: transparent; color: var(--sf-teal-dark, #0d3b3b); font-size: 1.6rem; cursor: pointer; }
      .admin-revenue-modal-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 16px; }
      .admin-revenue-list { display: grid; gap: 8px; }
      .admin-revenue-row { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; background: #fff; }
      @media (max-width: 900px) { .admin-revenue-breakdown, .admin-revenue-modal-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 560px) { .admin-revenue-breakdown, .admin-revenue-modal-grid { grid-template-columns: 1fr; } .admin-revenue-row { grid-template-columns: 1fr; } }
    `;
    document.head.appendChild(style);
  }

  ensureStyles();
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (patchDashboardStats() || attempts > 80) clearInterval(timer);
  }, 100);

  document.addEventListener('click', (event) => {
    const refreshCard = event.target.closest('#admin-side-refresh-btn');
    if (refreshCard) {
      window.requestAnimationFrame(() => normalizeRefreshDuringWork(refreshCard));
    }

    const modalOverlay = event.target.closest('#admin-revenue-modal-overlay');
    if (event.target.matches('.admin-revenue-modal-close') || event.target.id === 'admin-revenue-modal-overlay') {
      modalOverlay?.remove();
      return;
    }

    const card = event.target.closest('.admin-stat-card[data-dashboard-card-action]');
    if (!card) return;
    event.preventDefault();
    handleDashboardCardAction(card.dataset.dashboardCardAction);
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      document.querySelector('#admin-revenue-modal-overlay')?.remove();
      return;
    }

    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target.closest?.('.admin-stat-card[data-dashboard-card-action]');
    if (!card) return;
    event.preventDefault();
    handleDashboardCardAction(card.dataset.dashboardCardAction);
  });

  document.addEventListener('change', (event) => {
    if (event.target?.id === 'dashboard-range') setTimeout(updateRevenueDisplay, 0);
  });

  const side = document.querySelector('.admin-dashboard-side');
  if (side) {
    new MutationObserver(() => normalizeQuickActions()).observe(side, { childList: true, subtree: true, characterData: true });
  }
})();
