// Worker portal production fix:
// 1) Customer-cancelled/unable service never adds that service fee.
// 2) After final payment/totals, worker must document key return before the job is complete.
(() => {
  if (!document.body?.classList.contains('worker-portal-page')) return;

  function normalized(value) {
    return String(value || '').trim().toLowerCase();
  }

  function serviceUnableReason(request, type) {
    const notes = String(request?.notes || '');
    const matches = Array.from(notes.matchAll(new RegExp(`\\[service_unable ${type}\\] [^:]+: ([^\\n]+)`, 'g')));
    return matches.length ? matches[matches.length - 1][1].trim() : '';
  }

  function isCustomerCancelledUnableService(request, type) {
    const reason = normalized(serviceUnableReason(request, type));
    return reason.includes('customer requested cancellation')
      || reason.includes('customer cancelled')
      || reason.includes('customer canceled')
      || reason.includes('customer requested cancel');
  }

  if (typeof serviceUnableFeeCharged === 'function') {
    const originalServiceUnableFeeCharged = serviceUnableFeeCharged;
    serviceUnableFeeCharged = function patchedServiceUnableFeeCharged(request, type) {
      if (isCustomerCancelledUnableService(request, type)) return false;
      return originalServiceUnableFeeCharged(request, type);
    };
  }

  function forceUnableFeeCheckboxRules(panel) {
    if (!panel) return;
    const reason = normalized(panel.querySelector('.service-unable-reason')?.value || '');
    const feeBox = panel.querySelector('.service-unable-charge-fee');
    const labelText = feeBox?.closest('.checkbox-label')?.querySelector('span');
    const isCustomerCancel = reason.includes('customer requested cancellation')
      || reason.includes('customer cancelled')
      || reason.includes('customer canceled')
      || reason.includes('customer requested cancel');

    if (feeBox && isCustomerCancel) {
      feeBox.checked = false;
      feeBox.disabled = true;
      if (labelText) labelText.textContent = 'Service fee waived because the customer cancelled this service. No fuel/wash cost is charged without a receipt.';
    } else if (feeBox) {
      feeBox.disabled = false;
    }
  }

  document.addEventListener('change', (event) => {
    if (event.target.matches('.service-unable-reason')) {
      forceUnableFeeCheckboxRules(event.target.closest('.service-unable-panel'));
    }
  }, true);

  document.addEventListener('click', (event) => {
    const saveButton = event.target.closest('.save-service-unable');
    if (saveButton) {
      forceUnableFeeCheckboxRules(saveButton.closest('.service-unable-panel'));
    }
  }, true);

  // After successful Stripe capture, do NOT leave the job completed yet.
  // Move it to awaiting_key_return so the worker gets the key handoff panel.
  if (typeof sendWorkerToCustomerPayment === 'function') {
    sendWorkerToCustomerPayment = async function patchedSendWorkerToCustomerPayment(button) {
      const validated = workerCompleteValidation(button);
      if (!validated) return;
      const { id, request, receiptTotals } = validated;

      button.disabled = true;
      button.textContent = 'Capturing payment...';

      const finalTotal = finalTotalFromSavedReceipts(request, receiptTotals);

      const { error: updateErr } = await workerDb.rpc('worker_update_request', {
        p_token: SESSION_WORKER_TOKEN,
        p_request_id: id,
        p_data: { final_total: finalTotal, ...pricingAuditFields(request, receiptTotals) },
      });

      if (updateErr) {
        console.error('[complete] Failed to save final total before capture:', updateErr);
        button.disabled = false;
        button.textContent = 'Complete & Capture Payment';
        alert('Could not save the final total. Please try again.');
        return;
      }

      try {
        const res = await fetch('/api/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'worker_capture', worker_token: SESSION_WORKER_TOKEN, request_id: id }),
        });
        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          button.disabled = false;
          button.textContent = 'Complete & Capture Payment';
          if (data.capture_failed) {
            alert(`Payment capture issue: ${data.error}\n\nThe customer's tracking page will prompt them to update their payment method.`);
          } else {
            alert(`Could not capture payment: ${data.error || 'Unknown error. Please try again.'}`);
          }
          await loadWorkerJobs();
          await loadWorkerReviews();
          return;
        }

        const timestamp = new Date().toISOString();
        const keyReturnNote = `[payment_captured_key_return_needed ${timestamp}] Final payment captured. Worker must return keys before the request is marked complete.`;
        const nextNotes = request.notes ? `${request.notes}\n${keyReturnNote}` : keyReturnNote;
        await workerDb.rpc('worker_update_request', {
          p_token: SESSION_WORKER_TOKEN,
          p_request_id: id,
          p_data: { status: 'awaiting_key_return', notes: nextNotes, updated_at: timestamp },
        });
      } catch (err) {
        console.error('[complete] worker-capture network error:', err);
        button.disabled = false;
        button.textContent = 'Complete & Capture Payment';
        alert('Network error capturing payment. Please check your connection and try again.');
        return;
      }

      await loadWorkerJobs();
      await loadWorkerReviews();
    };
  }

  // No-card/no-payment completion should also route to key return first.
  if (typeof completeWorkerRequest === 'function') {
    completeWorkerRequest = async function patchedCompleteWorkerRequest(button) {
      const validated = workerCompleteValidation(button);
      if (!validated) return;
      const { id, request, receiptTotals } = validated;

      button.disabled = true;
      button.textContent = 'Saving...';

      const finalTotal = finalTotalFromSavedReceipts(request, receiptTotals);
      const timestamp = new Date().toISOString();
      const note = `[totals_confirmed_key_return_needed ${timestamp}] Worker confirmed final totals. Keys must be returned before the request is marked complete.`;
      const notes = request.notes ? `${request.notes}\n${note}` : note;

      const updates = {
        status: 'awaiting_key_return',
        final_total: finalTotal,
        notes,
        updated_at: timestamp,
        ...pricingAuditFields(request, receiptTotals),
      };

      const { error: updateErr } = await workerDb.rpc('worker_update_request', {
        p_token: SESSION_WORKER_TOKEN,
        p_request_id: id,
        p_data: updates,
      });

      if (updateErr) {
        console.error('[complete] Failed to save key-return step:', updateErr);
        button.disabled = false;
        button.textContent = 'Proceed to key return';
        alert('Could not update the request. Please try again.');
        return;
      }

      await loadWorkerJobs();
      await loadWorkerReviews();
    };
  }

  // Keep the key return dropdown wording exactly aligned with operations.
  function polishKeyReturnPanels() {
    document.querySelectorAll('.keys-returned-panel').forEach((panel) => {
      const select = panel.querySelector('.key-returned-to-type');
      const otherWrap = panel.querySelector('.key-returned-other-wrap');
      if (!select || select.dataset.keyReturnPolished) return;
      select.dataset.keyReturnPolished = '1';
      const customerOption = Array.from(select.options).find((option) => option.value === 'customer');
      if (customerOption && !customerOption.textContent.startsWith('Customer - ')) {
        customerOption.textContent = customerOption.textContent.replace('Customer —', 'Customer -').replace('Customer –', 'Customer -');
      }
      select.addEventListener('change', () => {
        if (otherWrap) otherWrap.hidden = select.value !== 'other';
      });
    });
  }

  const observer = new MutationObserver(polishKeyReturnPanels);
  observer.observe(document.body, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', polishKeyReturnPanels);
})();
