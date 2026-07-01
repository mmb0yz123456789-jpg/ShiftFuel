/**
 * shared-format.js — shared display formatters.
 *
 * Single source of truth for the USD currency formatter and HTML escaping used by
 * admin.js, worker.js and track.js (previously identical copies in each). Booking
 * flow keeps its own lighter `formatMoney` (no thousands separators) on purpose.
 *
 * UMD-style: browser global (window.SF.*) and CommonJS require.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SF = Object.assign(root.SF || {}, api);
})(typeof self !== 'undefined' ? self : this, function () {
  function formatCurrency(value) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(Number(value || 0));
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  return { formatCurrency, escapeHtml };
});
