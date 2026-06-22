// Track page: split cancelled requests out of denied requests.
// Request-result sections with at least one request open automatically.
(function () {
  if (!document.body || !document.body.className.includes('track-page')) return;
  const cancelledStatuses = new Set(['customer_canceled', 'canceled', 'cancelled', 'canceled_return_completed']);
  const deniedStatuses = new Set(['denied', 'unable_to_complete', 'auto_reversed', 'closed_no_charge']);

  function isCancelledRequest(request) {
    return cancelledStatuses.has(request && request.status);
  }

  function isDeniedRequest(request) {
    return deniedStatuses.has(request && request.status);
  }

  function detailsOpenAttr(items) {
    return items.length > 0 ? ' open' : '';
  }

  const install = function () {
    if (typeof window.renderAllRequests !== 'function') return false;
    window.renderAllRequests = async function (requests, phone, email) {
      const terminal = window.terminalStatuses || ['complete','denied','customer_canceled','canceled','cancelled','unable_to_complete','auto_reversed','closed_no_charge','canceled_return_completed'];
      const inProgress = (requests || []).filter(function (r) { return !terminal.includes(r.status); });
      const completed = (requests || []).filter(function (r) { return r.status === 'complete'; });
      const cancelled = (requests || []).filter(isCancelledRequest);
      const denied = (requests || []).filter(isDeniedRequest);

      let html = '<div class="track-sections">';
      html += '<details class="track-section"' + detailsOpenAttr(inProgress) + '><summary class="track-section-header">Requests in progress <span class="track-section-count">' + inProgress.length + '</span></summary><div class="track-section-body">';
      if (!inProgress.length) html += '<p class="track-empty-msg">No requests in progress.</p>';
      else for (const request of inProgress) {
        const photos = typeof loadRequestPhotos === 'function' ? await loadRequestPhotos(request.id, phone, email) : [];
        const review = typeof loadRequestReview === 'function' ? await loadRequestReview(request.id, phone, email) : null;
        html += renderRequestCard(request, photos, review);
      }
      html += '</div></details>';

      html += '<details class="track-section"' + detailsOpenAttr(completed) + '><summary class="track-section-header">Completed requests <span class="track-section-count">' + completed.length + '</span></summary><div class="track-section-body">';
      if (!completed.length) html += '<p class="track-empty-msg">No completed requests available.</p>';
      else for (const request of completed) {
        const photos = typeof loadRequestPhotos === 'function' ? await loadRequestPhotos(request.id, phone, email) : [];
        const review = typeof loadRequestReview === 'function' ? await loadRequestReview(request.id, phone, email) : null;
        html += renderRequestCard(request, photos, review);
      }
      html += '</div></details>';

      html += '<details class="track-section"' + detailsOpenAttr(cancelled) + '><summary class="track-section-header">Cancelled requests <span class="track-section-count">' + cancelled.length + '</span></summary><div class="track-section-body">';
      if (!cancelled.length) html += '<p class="track-empty-msg">No cancelled requests found.</p>';
      else for (const request of cancelled) html += renderDeniedCard(request);
      html += '</div></details>';

      html += '<details class="track-section"' + detailsOpenAttr(denied) + '><summary class="track-section-header">Denied requests <span class="track-section-count">' + denied.length + '</span></summary><div class="track-section-body">';
      if (!denied.length) html += '<p class="track-empty-msg">No denied requests found.</p>';
      else for (const request of denied) html += renderDeniedCard(request);
      html += '</div></details></div>';

      trackingResult.innerHTML = html;
      trackingResult.querySelectorAll('.track-request-details').forEach(function (details) {
        details.addEventListener('toggle', function () {
          if (details.open && typeof mountVisibleCustomerPayCards === 'function') mountVisibleCustomerPayCards(details);
        });
      });
      trackingResult.querySelectorAll('.track-section[open] .track-request-details[open]').forEach(function (details) {
        if (typeof mountVisibleCustomerPayCards === 'function') mountVisibleCustomerPayCards(details);
      });
    };
    return true;
  };

  if (!install()) setTimeout(install, 300);
})();
