// Quick Actions UI stability fix.
// Keeps admin action card title/subtitle structure intact during refresh/loading states.
(() => {
  if (!document.body?.classList.contains('admin-portal-page')) return;

  const ACTIONS = [
    { selector: '.admin-action-card[data-page-action="requests"][data-request-view="unassigned"]', title: 'Assign Worker', subtitle: 'Assign an available worker' },
    { selector: '.admin-action-card[data-page-action="requests"][data-request-view="all"]', title: 'Edit Request', subtitle: 'Update request details' },
    { selector: '.admin-action-card[data-page="create-request"]', title: 'Create Request', subtitle: 'Add a new customer request' },
    { selector: '#admin-side-refresh-btn', title: 'Refresh Dashboard', subtitle: 'Update all data' },
  ];

  function stableMarkup(title, subtitle) {
    return `<strong>${title}</strong><span>${subtitle}</span>`;
  }

  function normalizeCard(card, title, subtitle) {
    if (!card) return;
    const strong = card.querySelector(':scope > strong');
    const span = card.querySelector(':scope > span');
    const isStable = strong?.textContent.trim() === title && span?.textContent.trim() === subtitle;
    if (!isStable || card.childElementCount < 2) {
      card.innerHTML = stableMarkup(title, subtitle);
    }
    card.type = 'button';
  }

  function normalizeAllCards() {
    ACTIONS.forEach(({ selector, title, subtitle }) => {
      normalizeCard(document.querySelector(selector), title, subtitle);
    });
  }

  function normalizeRefreshDuringWork(card) {
    const refreshAction = ACTIONS.find((action) => action.selector === '#admin-side-refresh-btn');
    if (!refreshAction) return;
    card.classList.add('is-refreshing');
    card.setAttribute('aria-busy', 'true');

    const start = Date.now();
    const timer = setInterval(() => {
      normalizeCard(card, refreshAction.title, refreshAction.subtitle);
      if (!card.disabled || Date.now() - start > 8000) {
        card.classList.remove('is-refreshing');
        card.removeAttribute('aria-busy');
        clearInterval(timer);
      }
    }, 80);
  }

  function ensureStyles() {
    if (document.querySelector('#admin-quick-actions-fix-style')) return;
    const style = document.createElement('style');
    style.id = 'admin-quick-actions-fix-style';
    style.textContent = `
      .admin-action-card > strong,
      .admin-action-card > span {
        display: block;
      }
      .admin-action-card.is-refreshing {
        position: relative;
      }
      .admin-action-card.is-refreshing::after {
        content: '';
        position: absolute;
        right: 14px;
        top: 14px;
        width: 14px;
        height: 14px;
        border: 2px solid rgba(13, 59, 59, 0.18);
        border-top-color: var(--sf-coral, #ff6b5a);
        border-radius: 999px;
        animation: adminQuickActionSpin 0.7s linear infinite;
      }
      @keyframes adminQuickActionSpin {
        to { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  document.addEventListener('click', (event) => {
    const refreshCard = event.target.closest('#admin-side-refresh-btn');
    if (!refreshCard) return;
    window.requestAnimationFrame(() => normalizeRefreshDuringWork(refreshCard));
  }, true);

  const observer = new MutationObserver(() => normalizeAllCards());

  function start() {
    ensureStyles();
    normalizeAllCards();
    const side = document.querySelector('.admin-dashboard-side');
    if (side) observer.observe(side, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
