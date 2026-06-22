// Admin revenue label/calculation patch.
// Safe, display-only: does not change payment capture, Supabase writes, or request status logic.
(() => {
  if (!document.body?.classList.contains('admin-portal-page')) return;

  const MONEY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

  function amount(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }

  function money(value) {
    return MONEY.format(amount(value));
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
    if (savedFuel || savedWash) {
      return { fuel: savedFuel, wash: savedWash };
    }

    const notes = String(request.notes || '');
    const matches = Array.from(notes.matchAll(/\[receipt_totals fuel=([0-9.]+) wash=([0-9.]+)\]/g));
    const latest = matches.at(-1);
    return {
      fuel: latest ? amount(latest[1]) : 0,
      wash: latest ? amount(latest[2]) : 0,
    };
  }

  function getRequests() {
    try {
      if (typeof allRequests !== 'undefined' && Array.isArray(allRequests)) return allRequests;
    } catch (_) {}
    return [];
  }

  function calculateRevenueMetrics() {
    const range = currentRange();
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

    const net = gross - receipts - paymentRecovery;
    return { range, label: rangeLabel(range), gross, receipts, paymentRecovery, net };
  }

  function ensureBreakdown() {
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

  function ensureStyles() {
    if (document.querySelector('#admin-revenue-metrics-style')) return;
    const style = document.createElement('style');
    style.id = 'admin-revenue-metrics-style';
    style.textContent = `
      .admin-revenue-breakdown {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin-top: 14px;
      }
      .admin-revenue-breakdown div {
        display: grid;
        gap: 4px;
        padding: 13px 14px;
        background: rgba(255,255,255,0.92);
        border: 1px solid rgba(13,59,59,0.10);
        border-radius: var(--sf-radius-sm, 14px);
        box-shadow: 0 8px 22px rgba(13,59,59,0.06);
      }
      .admin-revenue-breakdown span {
        color: var(--sf-muted, #60716d);
        font-size: 0.72rem;
        font-weight: 900;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }
      .admin-revenue-breakdown strong {
        color: var(--sf-teal-dark, #0d3b3b);
        font-size: 1rem;
        font-weight: 950;
      }
      @media (max-width: 900px) {
        .admin-revenue-breakdown { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      }
      @media (max-width: 560px) {
        .admin-revenue-breakdown { grid-template-columns: 1fr; }
      }
    `;
    document.head.appendChild(style);
  }

  function updateRevenueDisplay() {
    const metrics = calculateRevenueMetrics();
    const label = document.querySelector('#stat-revenue-label');
    const value = document.querySelector('#stat-net-revenue');
    if (label) label.textContent = `Net Revenue ${metrics.label}`;
    if (value) value.textContent = money(metrics.net);

    ensureStyles();
    const breakdown = ensureBreakdown();
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

  function patchDashboardStats() {
    try {
      if (typeof updateDashboardStatCards === 'function' && !updateDashboardStatCards.__revenuePatched) {
        const original = updateDashboardStatCards;
        updateDashboardStatCards = function patchedUpdateDashboardStatCards(...args) {
          original.apply(this, args);
          updateRevenueDisplay();
        };
        updateDashboardStatCards.__revenuePatched = true;
        updateRevenueDisplay();
        return true;
      }
    } catch (_) {}
    return false;
  }

  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (patchDashboardStats() || attempts > 80) clearInterval(timer);
  }, 100);

  document.addEventListener('change', (event) => {
    if (event.target?.id === 'dashboard-range') setTimeout(updateRevenueDisplay, 0);
  });
})();
