// Track progress tracker accuracy patch.
// Visual/rendering only: does not change Supabase lookups, payment logic, or workflow status updates.
(() => {
  if (!document.body?.classList.contains('track-page')) return;
  if (typeof buildStatusSteps !== 'function' || typeof timelineStatus !== 'function') return;

  const FINAL_COMPLETE_STATUSES = new Set(['complete', 'completed', 'finalized']);
  const originalIsStepDone = typeof isStepDone === 'function' ? isStepDone : null;
  const originalRenderTimeline = typeof renderTimeline === 'function' ? renderTimeline : null;

  function isFinalRequestComplete(request) {
    return FINAL_COMPLETE_STATUSES.has(String(request?.status || '').toLowerCase());
  }

  function normalizeReason(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function serviceFailureReasons(request) {
    const notes = String(request?.notes || '');
    const reasons = { fuel: '', wash: '' };

    if (typeof serviceUnableReasonsFromNotes === 'function') {
      const parsed = serviceUnableReasonsFromNotes(request) || {};
      reasons.fuel = normalizeReason(parsed.fuel);
      reasons.wash = normalizeReason(parsed.wash);
    }

    // Extra protection for older notes/copy formats.
    for (const match of notes.matchAll(/\[service_unable\s+(fuel|wash)\][^\n:]*:\s*([^\n]+)/gi)) {
      reasons[match[1].toLowerCase()] = normalizeReason(match[2]);
    }
    for (const match of notes.matchAll(/(fuel|gas|car wash|wash)[^\n.]*?(?:could not be completed|not completed|unavailable|unable)[^\n:]*:?\s*([^\n]*)/gi)) {
      const rawType = match[1].toLowerCase();
      const type = rawType.includes('wash') ? 'wash' : 'fuel';
      const fallback = type === 'wash' ? 'Car wash unavailable' : 'Fuel service unavailable';
      reasons[type] = normalizeReason(match[2] || fallback);
    }

    const cancellationReason = normalizeReason(request?.cancellation_reason);
    if (cancellationReason) {
      const lower = cancellationReason.toLowerCase();
      if (!reasons.wash && /car wash|wash/.test(lower) && /unavailable|unable|not completed|cannot be completed|could not be completed/.test(lower)) {
        reasons.wash = cancellationReason;
      }
      if (!reasons.fuel && /fuel|gas/.test(lower) && /unavailable|unable|not completed|cannot be completed|could not be completed/.test(lower)) {
        reasons.fuel = cancellationReason;
      }
    }

    return reasons;
  }

  function failedReasonForStep(step, request) {
    const reasons = serviceFailureReasons(request);
    if (['fueling', 'fuel_receipt_recorded'].includes(step.key) && reasons.fuel) return reasons.fuel;
    if (['vehicle_cleaning', 'car_wash_receipt_recorded'].includes(step.key) && reasons.wash) return reasons.wash;
    return '';
  }

  function fixedIsStepDone(stepKey, request) {
    if (stepKey === 'complete') return isFinalRequestComplete(request);
    return originalIsStepDone ? originalIsStepDone(stepKey, request) : false;
  }

  try {
    isStepDone = fixedIsStepDone;
  } catch (_) {}

  function renderFixedTimeline(request) {
    // Preserve original behavior for closed/terminal non-complete statuses.
    if (typeof closedStatuses !== 'undefined' && closedStatuses.includes(request.status)) return '';
    if (request.status === 'cancelled_pending_key_return') {
      return `<p class="timeline-status-message">Cancellation received — awaiting key/vehicle return.</p>`;
    }

    const steps = buildStatusSteps(request);
    const finalComplete = isFinalRequestComplete(request);

    steps.forEach((step) => {
      step.failedReason = failedReasonForStep(step, request);
      step.failed = Boolean(step.failedReason);
      step.done = !step.failed && fixedIsStepDone(step.key, request);
    });

    const firstIncompleteIdx = finalComplete ? -1 : steps.findIndex((step) => !step.done && !step.failed);
    const activeKey = firstIncompleteIdx >= 0 ? steps[firstIncompleteIdx].key : null;
    const total = steps.length;
    const currentStepNum = firstIncompleteIdx >= 0 ? firstIncompleteIdx + 1 : total;
    const statusMsg = typeof getStatusMessage === 'function' ? getStatusMessage(request) : '';
    const firstIncompleteChildClaimed = {};

    let html = '';
    if (statusMsg) html += `<p class="timeline-status-message">${escapeHtml(statusMsg)}</p>`;
    html += `<div class="timeline-progress-label">Step ${currentStepNum} of ${total}</div>`;
    html += '<ol class="customer-timeline">';

    steps.forEach((step) => {
      const done = step.done;
      const failed = step.failed;
      const isActive = !finalComplete && step.key === activeKey;

      let isActiveChild = false;
      if (!finalComplete && step.nested && step.parentKey && !done && !failed) {
        const parentActive = activeKey === step.parentKey;
        if (parentActive && !firstIncompleteChildClaimed[step.parentKey]) {
          isActiveChild = true;
          firstIncompleteChildClaimed[step.parentKey] = true;
        }
      }

      let cls = 'future';
      let icon = '○';
      if (failed) {
        cls = 'failed';
        icon = '×';
      } else if (done) {
        cls = 'done';
        icon = '✓';
      } else if (isActive || isActiveChild) {
        cls = 'active';
        icon = '➜';
      }

      const nestedCls = step.nested ? ' timeline-step-nested' : '';
      const reasonTitle = failed ? ` title="${escapeHtml(step.failedReason)}" aria-label="${escapeHtml(`${step.label}: ${step.failedReason}`)}"` : '';
      const reasonText = failed ? `<small class="timeline-failure-reason">${escapeHtml(step.failedReason)}</small>` : '';
      html += `<li class="timeline-step ${cls}${nestedCls}"${reasonTitle}><span class="timeline-icon">${icon}</span><p>${escapeHtml(step.label)}</p>${reasonText}</li>`;
    });

    html += '</ol>';
    return html;
  }

  try {
    renderTimeline = renderFixedTimeline;
  } catch (_) {
    if (originalRenderTimeline) window.renderTimeline = renderFixedTimeline;
  }

  const style = document.createElement('style');
  style.textContent = `
    .timeline-step.failed::before {
      background: #dc2626;
    }
    .timeline-step.failed .timeline-icon {
      color: #fff;
      background: #dc2626;
      border-color: #dc2626;
      box-shadow: 0 0 0 5px rgba(220, 38, 38, 0.12);
    }
    .timeline-step.failed p {
      color: #991b1b;
    }
    .timeline-failure-reason {
      display: block;
      max-width: 120px;
      color: #991b1b;
      font-size: 0.68rem;
      font-weight: 800;
      line-height: 1.2;
    }
  `;
  document.head.appendChild(style);
})();
