// Track page lookup safety: require at least two identifiers.
// Valid identifiers are phone number, email address, and request/ticket number.
(() => {
  if (!document.body?.classList.contains('track-page')) return;

  function cleanPhone(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function cleanRequestId(value) {
    return String(value || '').trim();
  }

  function criteriaCount() {
    const phone = cleanPhone(document.querySelector('#tracking-phone')?.value || '');
    const email = String(document.querySelector('#tracking-email')?.value || '').trim();
    const requestId = cleanRequestId(document.querySelector('#tracking-id')?.value || '');
    return [phone, email, requestId].filter(Boolean).length;
  }

  function showCriteriaMessage() {
    const trackMessage = document.querySelector('#track-message');
    if (trackMessage) {
      trackMessage.textContent = 'Please enter at least two pieces of information to track your request, such as phone + email, phone + request number, or email + request number.';
    }
  }

  function install() {
    const form = document.querySelector('#track-form');
    if (!form || form.dataset.twoCriteriaBound) return;
    form.dataset.twoCriteriaBound = '1';

    form.addEventListener('submit', (event) => {
      if (criteriaCount() >= 2) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      showCriteriaMessage();
    }, true);

    document.querySelector('#refresh-status-btn')?.addEventListener('click', (event) => {
      if (criteriaCount() >= 2) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      showCriteriaMessage();
    }, true);
  }

  document.addEventListener('DOMContentLoaded', install);
  install();
})();
