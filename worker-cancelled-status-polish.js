// Worker portal: make cancellation/return-required status badges red instead of green.
(() => {
  if (!document.body?.classList.contains('worker-portal-page')) return;

  const style = document.createElement('style');
  style.textContent = `
    .status-pill.status-pill-cancelled,
    .guided-step.guided-step-cancelled {
      background: #fff1f2 !important;
      border-color: rgba(190, 18, 60, 0.35) !important;
      color: #9f1239 !important;
    }
    .guided-step.guided-step-cancelled h4,
    .guided-step.guided-step-cancelled .eyebrow,
    .guided-step.guided-step-cancelled .next-action-label {
      color: #9f1239 !important;
    }
  `;
  document.head.appendChild(style);

  function applyCancelledStatusPolish() {
    document.querySelectorAll('.status-pill').forEach((pill) => {
      const text = pill.textContent.trim().toLowerCase();
      const isCancelled = text.includes('cancellation received')
        || text.includes('cancelled')
        || text.includes('canceled');
      pill.classList.toggle('status-pill-cancelled', isCancelled);
    });

    document.querySelectorAll('.guided-step').forEach((panel) => {
      const text = panel.textContent.trim().toLowerCase();
      const isCancelled = text.includes('cancellation received')
        || text.includes('customer cancelled')
        || text.includes('customer canceled');
      panel.classList.toggle('guided-step-cancelled', isCancelled);
    });
  }

  document.addEventListener('DOMContentLoaded', applyCancelledStatusPolish);
  const observer = new MutationObserver(applyCancelledStatusPolish);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
})();
