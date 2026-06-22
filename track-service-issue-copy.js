// Track page: customer-facing wording for service-specific unable reasons.
// This overrides the default service issue banner copy from track.js.
function renderServiceIssueBanner(request) {
  const unableReasons = typeof serviceUnableReasonsFromNotes === 'function'
    ? serviceUnableReasonsFromNotes(request)
    : { fuel: '', wash: '' };

  const parts = [];
  if (unableReasons.fuel) parts.push({ service: 'Fuel Service', reason: unableReasons.fuel });
  if (unableReasons.wash) parts.push({ service: 'Car Wash Service', reason: unableReasons.wash });
  if (!parts.length && request && request.status === 'unable_to_complete') {
    parts.push({ service: 'Service', reason: request.cancellation_reason || 'A service issue was reported.' });
  }
  if (!parts.length) return '';

  return parts.map((p) => `
    <div class="service-issue-banner">
      <strong>⚠ Unable to do ${escapeHtml(p.service)} — ${escapeHtml(p.reason)}</strong>
    </div>
  `).join('');
}
