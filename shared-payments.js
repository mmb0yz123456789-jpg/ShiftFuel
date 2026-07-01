/**
 * shared-payments.js — payment-related pure helpers shared by client and server.
 *
 * `receiptTotalsFromNotes` is the important one: it parses the worker-recorded
 * receipt totals out of a request's free-text notes and MUST return the same
 * numbers on the customer/admin UI (client) and in the charge logic
 * (api/payments.js). It previously existed as separate copies in admin.js,
 * worker.js, track.js and api/payments.js — a client/server drift risk on money.
 *
 * It accepts either a raw notes string (server call style) or a request object
 * (client call style), so no existing call site has to change.
 *
 * UMD-style: browser global (window.SF.*) and CommonJS require.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SF = Object.assign(root.SF || {}, api);
})(typeof self !== 'undefined' ? self : this, function () {
  function receiptTotalsFromNotes(notesOrRequest) {
    const notes = typeof notesOrRequest === 'string'
      ? notesOrRequest
      : (notesOrRequest && notesOrRequest.notes) || '';
    const matches = Array.from(String(notes || '').matchAll(/\[receipt_totals fuel=([0-9.]+) wash=([0-9.]+)\]/g));
    const latest = matches.at(-1);

    return {
      fuel: latest ? Number(latest[1]) || 0 : 0,
      wash: latest ? Number(latest[2]) || 0 : 0,
    };
  }

  function requestNeedsFuel(request) {
    return String(request.service_type || '').includes('fuel');
  }

  function requestNeedsWash(request) {
    return String(request.service_type || '').includes('wash');
  }

  return { receiptTotalsFromNotes, requestNeedsFuel, requestNeedsWash };
});
