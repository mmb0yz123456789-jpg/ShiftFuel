// Keeps Dashboard card details out of the Requests tab.
// Layout-only safety patch. Does not change request data, Supabase, payments, or status logic.
(() => {
  if (!document.body?.classList.contains('admin-portal-page')) return;

  function activeAdminPage() {
    return document.querySelector('.admin-page-tab.active[data-page]')?.dataset.page || 'dashboard';
  }

  function queueCard() {
    return document.querySelector('.admin-queue-card[data-tab-panel="requests"]');
  }

  function setVisible(el, visible, displayValue = '') {
    if (!el) return;
    el.hidden = !visible;
    if (visible) {
      el.style.removeProperty('display');
      el.style.removeProperty('visibility');
      if (displayValue) el.style.display = displayValue;
    } else {
      el.style.display = 'none';
      el.style.visibility = 'hidden';
    }
  }

  function forceRequestsQueueView() {
    const card = queueCard();
    if (!card) return;

    card.classList.remove('dashboard-card-driven-mode');
    card.dataset.activeAdminView = 'requests';

    const dashboardPanel = card.querySelector(':scope > #dashboard-detail-panel');
    setVisible(dashboardPanel, false);

    setVisible(card.querySelector(':scope > .admin-toolbar'), true, 'flex');
    setVisible(card.querySelector(':scope > .admin-request-tabs'), true, 'flex');
    setVisible(card.querySelector(':scope > #request-list'), true, 'block');

    const eyebrow = document.querySelector('#request-queue-eyebrow');
    const heading = document.querySelector('#request-queue-heading');
    if (eyebrow) eyebrow.textContent = 'Request management';
    if (heading) heading.textContent = 'All Requests';
  }

  function allowDashboardDetailView() {
    const card = queueCard();
    if (!card) return;
    card.dataset.activeAdminView = 'dashboard';
    const dashboardPanel = card.querySelector(':scope > #dashboard-detail-panel');
    if (dashboardPanel) {
      dashboardPanel.style.removeProperty('display');
      dashboardPanel.style.removeProperty('visibility');
    }
  }

  function syncAdminView() {
    if (activeAdminPage() === 'requests') {
      forceRequestsQueueView();
    } else if (activeAdminPage() === 'dashboard') {
      allowDashboardDetailView();
    }
  }

  function ensureStyles() {
    if (document.querySelector('#admin-requests-tab-fix-style')) return;
    const style = document.createElement('style');
    style.id = 'admin-requests-tab-fix-style';
    style.textContent = `
      .admin-queue-card[data-active-admin-view="requests"] > #dashboard-detail-panel {
        display: none !important;
        visibility: hidden !important;
      }
      .admin-queue-card[data-active-admin-view="requests"] > .admin-toolbar {
        display: flex !important;
        visibility: visible !important;
      }
      .admin-queue-card[data-active-admin-view="requests"] > .admin-request-tabs {
        display: flex !important;
        visibility: visible !important;
      }
      .admin-queue-card[data-active-admin-view="requests"] > #request-list {
        display: block !important;
        visibility: visible !important;
      }
    `;
    document.head.appendChild(style);
  }

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.admin-page-tab')) return;
    setTimeout(syncAdminView, 0);
    setTimeout(syncAdminView, 80);
    setTimeout(syncAdminView, 250);
  }, true);

  function start() {
    ensureStyles();
    syncAdminView();
    const tabs = document.querySelector('.admin-page-tabs');
    if (tabs) {
      new MutationObserver(syncAdminView).observe(tabs, {
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      });
    }
    const card = queueCard();
    if (card) {
      new MutationObserver(() => {
        if (activeAdminPage() === 'requests') forceRequestsQueueView();
      }).observe(card, { childList: true, subtree: false, attributes: true, attributeFilter: ['class', 'hidden', 'style'] });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
