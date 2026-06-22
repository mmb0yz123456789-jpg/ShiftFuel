// Worker portal visual polish and emergency text cleanup.
// Loaded after worker.js so it can fix generated worker job panels.
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

    /* Keep checkboxes normal sized inside worker panels. */
    .worker-portal-page .checkbox-label {
      display: grid !important;
      grid-template-columns: 22px 1fr !important;
      align-items: start !important;
      gap: 10px !important;
      margin: 14px 0 !important;
      line-height: 1.45 !important;
    }
    .worker-portal-page .checkbox-label input[type="checkbox"] {
      width: 18px !important;
      height: 18px !important;
      min-width: 18px !important;
      min-height: 18px !important;
      max-width: 18px !important;
      max-height: 18px !important;
      margin: 3px 0 0 !important;
      padding: 0 !important;
      appearance: auto !important;
      -webkit-appearance: checkbox !important;
      accent-color: #073233;
      transform: none !important;
      box-shadow: none !important;
    }
    .worker-portal-page .checkbox-label span {
      display: block !important;
      width: auto !important;
    }
    .worker-portal-page .service-unable-charge-fee:disabled + span {
      color: #667674 !important;
    }
  `;
  document.head.appendChild(style);

  const textFixes = [
    [/â€”/g, '—'],
    [/â†’/g, '→'],
    [/âš\s*/g, '⚠ '],
  ];

  function fixTextNode(node) {
    let value = node.nodeValue;
    let next = value;
    textFixes.forEach(([bad, good]) => { next = next.replace(bad, good); });
    if (next !== value) node.nodeValue = next;
  }

  function cleanupBrokenCharacters(root = document.body) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) fixTextNode(node);
  }

  function selectedReason(panel) {
    return String(panel?.querySelector('.service-unable-reason')?.value || '').trim().toLowerCase();
  }

  function applyServiceUnableFeeRules(panel) {
    if (!panel) return;
    const feeBox = panel.querySelector('.service-unable-charge-fee');
    if (!feeBox) return;

    const reason = selectedReason(panel);
    const mustWaive = reason === 'customer requested cancellation';

    if (mustWaive) {
      feeBox.checked = false;
      feeBox.disabled = true;
      const text = feeBox.closest('.checkbox-label')?.querySelector('span');
      if (text) {
        text.textContent = 'Service fee waived because the customer requested cancellation for this service. No fuel/wash cost is charged without a receipt.';
      }
    } else {
      feeBox.disabled = false;
      const text = feeBox.closest('.checkbox-label')?.querySelector('span');
      if (text && text.textContent.includes('Service fee waived because')) {
        text.textContent = "Charge the service fee anyway (e.g. work was attempted). No fuel/wash cost is ever charged when there's no receipt — leave unchecked to waive the fee entirely.";
      }
    }
  }

  function applyServiceUnableFeeRulesEverywhere() {
    document.querySelectorAll('.service-unable-panel').forEach(applyServiceUnableFeeRules);
  }

  function applyCancelledStatusPolish() {
    cleanupBrokenCharacters();
    applyServiceUnableFeeRulesEverywhere();

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

  document.addEventListener('change', (event) => {
    if (event.target.matches('.service-unable-reason')) {
      applyServiceUnableFeeRules(event.target.closest('.service-unable-panel'));
    }
  }, true);

  // Run before worker.js save handler reads the checkbox.
  document.addEventListener('click', (event) => {
    const button = event.target.closest('.save-service-unable');
    if (!button) return;
    const panel = button.closest('.service-unable-panel');
    if (selectedReason(panel) === 'customer requested cancellation') {
      const feeBox = panel?.querySelector('.service-unable-charge-fee');
      if (feeBox) {
        feeBox.checked = false;
        feeBox.disabled = true;
      }
    }
  }, true);

  document.addEventListener('DOMContentLoaded', applyCancelledStatusPolish);
  const observer = new MutationObserver(applyCancelledStatusPolish);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
})();
