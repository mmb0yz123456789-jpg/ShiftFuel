// Worker portal visual polish and safety fixes.
// Loaded after worker.js so it can patch generated worker job panels.
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
    let next = node.nodeValue;
    textFixes.forEach(([bad, good]) => { next = next.replace(bad, good); });
    if (next !== node.nodeValue) node.nodeValue = next;
  }

  function cleanupBrokenCharacters(root = document.body) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) fixTextNode(node);
  }

  function normalized(value) {
    return String(value || '').trim().toLowerCase();
  }

  function selectedReason(panel) {
    return normalized(panel?.querySelector('.service-unable-reason')?.value || '');
  }

  function isCustomerCancellationReason(reason) {
    const value = normalized(reason);
    return value.includes('customer requested cancellation')
      || value.includes('customer requested cancel')
      || value.includes('customer cancelled')
      || value.includes('customer canceled');
  }

  function serviceUnableReason(request, type) {
    const notes = String(request?.notes || '');
    const matches = Array.from(notes.matchAll(new RegExp(`\\[service_unable ${type}\\] [^:]+: ([^\\n]+)`, 'g')));
    return matches.length ? matches[matches.length - 1][1].trim() : '';
  }

  if (typeof serviceUnableFeeCharged === 'function') {
    const originalServiceUnableFeeCharged = serviceUnableFeeCharged;
    serviceUnableFeeCharged = function patchedServiceUnableFeeCharged(request, type) {
      if (isCustomerCancellationReason(serviceUnableReason(request, type))) return false;
      return originalServiceUnableFeeCharged(request, type);
    };
  }

  function applyServiceUnableFeeRules(panel) {
    if (!panel) return;
    const feeBox = panel.querySelector('.service-unable-charge-fee');
    if (!feeBox) return;

    const mustWaive = isCustomerCancellationReason(selectedReason(panel));

    if (mustWaive) {
      feeBox.checked = false;
      feeBox.disabled = true;
      const text = feeBox.closest('.checkbox-label')?.querySelector('span');
      if (text) {
        text.textContent = 'Service fee waived because the customer cancelled this service. No fuel/wash cost is charged without a receipt.';
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

  function polishKeyReturnPanels() {
    document.querySelectorAll('.keys-returned-panel').forEach((panel) => {
      const select = panel.querySelector('.key-returned-to-type');
      const otherWrap = panel.querySelector('.key-returned-other-wrap');
      if (!select || select.dataset.keyReturnPolished) return;
      select.dataset.keyReturnPolished = '1';
      const customerOption = Array.from(select.options).find((option) => option.value === 'customer');
      if (customerOption) {
        customerOption.textContent = customerOption.textContent.replace('Customer —', 'Customer -').replace('Customer –', 'Customer -');
      }
      select.addEventListener('change', () => {
        if (otherWrap) otherWrap.hidden = select.value !== 'other';
      });
    });
  }

  // After capturing payment, keep the job open for the worker until keys are documented returned.
  if (typeof sendWorkerToCustomerPayment === 'function') {
    const originalSendWorkerToCustomerPayment = sendWorkerToCustomerPayment;
    sendWorkerToCustomerPayment = async function patchedSendWorkerToCustomerPayment(button) {
      const id = button?.dataset?.id;
      const request = Array.isArray(allWorkerJobs) ? allWorkerJobs.find((item) => item.id === id) : null;
      await originalSendWorkerToCustomerPayment(button);

      // If the capture succeeded, worker.js reloads jobs. Move the row back into the worker queue as Awaiting key return.
      if (id && request && request.status !== 'awaiting_key_return') {
        const timestamp = new Date().toISOString();
        const note = `[payment_captured_key_return_needed ${timestamp}] Final payment captured. Worker must return keys before the request is marked complete.`;
        const notes = request.notes ? `${request.notes}\n${note}` : note;
        await workerDb.rpc('worker_update_request', {
          p_token: SESSION_WORKER_TOKEN,
          p_request_id: id,
          p_data: { status: 'awaiting_key_return', notes, updated_at: timestamp },
        }).catch((error) => console.warn('Could not move captured job to key return step:', error));
        await loadWorkerJobs().catch(() => {});
      }
    };
  }

  if (typeof completeWorkerRequest === 'function') {
    const originalCompleteWorkerRequest = completeWorkerRequest;
    completeWorkerRequest = async function patchedCompleteWorkerRequest(button) {
      const id = button?.dataset?.id;
      const request = Array.isArray(allWorkerJobs) ? allWorkerJobs.find((item) => item.id === id) : null;
      await originalCompleteWorkerRequest(button);

      if (id && request && request.status !== 'awaiting_key_return') {
        const timestamp = new Date().toISOString();
        const note = `[totals_confirmed_key_return_needed ${timestamp}] Worker confirmed final totals. Keys must be returned before the request is marked complete.`;
        const notes = request.notes ? `${request.notes}\n${note}` : note;
        await workerDb.rpc('worker_update_request', {
          p_token: SESSION_WORKER_TOKEN,
          p_request_id: id,
          p_data: { status: 'awaiting_key_return', notes, updated_at: timestamp },
        }).catch((error) => console.warn('Could not move completed job to key return step:', error));
        await loadWorkerJobs().catch(() => {});
      }
    };
  }

  function applyCancelledStatusPolish() {
    cleanupBrokenCharacters();
    applyServiceUnableFeeRulesEverywhere();
    polishKeyReturnPanels();

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

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.save-service-unable');
    if (!button) return;
    const panel = button.closest('.service-unable-panel');
    if (isCustomerCancellationReason(selectedReason(panel))) {
      const feeBox = panel?.querySelector('.service-unable-charge-fee');
      if (feeBox) {
        feeBox.checked = false;
        feeBox.disabled = true;
      }
    }
  }, true);

  document.addEventListener('DOMContentLoaded', applyCancelledStatusPolish);

  // All of the elements this polish touches (.status-pill, .guided-step,
  // .service-unable-panel, .keys-returned-panel) only ever render inside the
  // job list, which gets fully replaced on every refresh. Watching that
  // container instead of the whole document avoids re-scanning the entire
  // page (including unrelated things like typing in inputs) on every change.
  let observerTarget = null;
  const observer = new MutationObserver(applyCancelledStatusPolish);

  function attachObserver() {
    const jobList = document.querySelector('#worker-job-list');
    const target = jobList || document.body;
    if (target === observerTarget) return;
    observer.disconnect();
    observer.observe(target, { childList: true, subtree: true });
    observerTarget = target;
  }

  attachObserver();
  document.addEventListener('DOMContentLoaded', attachObserver);
})();

