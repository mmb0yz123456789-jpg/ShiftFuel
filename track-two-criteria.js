// Track page lookup safety: require at least two identifiers.
// Customer-facing ticket numbers use SF-XXXXXXXX.
// The full UUID remains internal.
(() => {
  if (!document.body?.classList.contains('track-page')) return;

  function cleanPhone(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function cleanRequestId(value) {
    return String(value || '').trim();
  }

  function ticketInfo(value) {
    const raw = cleanRequestId(value);
    const upper = raw.toUpperCase().replaceAll(' ', '');
    const compact = upper.startsWith('SF-') ? upper.slice(3) : upper;
    const isShortTicket = compact.length === 8 && /^[A-F0-9]+$/.test(compact);
    return {
      raw,
      isShortTicket,
      shortPrefix: isShortTicket ? compact.toLowerCase() : '',
    };
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

  function formatTicketInput() {
    const input = document.querySelector('#tracking-id');
    if (!input || input.dataset.sfTicketFormatBound) return;
    input.dataset.sfTicketFormatBound = '1';
    input.placeholder = 'SF-DDDFBBC5';
    input.addEventListener('blur', () => {
      const info = ticketInfo(input.value);
      if (info.isShortTicket) input.value = `SF-${info.shortPrefix.toUpperCase()}`;
    });
  }

  async function directShortTicketLookup(ticket) {
    const db = window.ShiftFuelSupabase;
    if (!db) return { data: [], error: new Error('Supabase is not ready.') };

    // UUID columns cannot always be searched with ilike through PostgREST.
    // Pull the most recent rows allowed by RLS, then match the public SF prefix.
    let { data, error } = await db
      .from('service_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(250);

    if (error) return { data: [], error };
    return {
      data: (data || []).filter((request) => String(request.id || '').toLowerCase().startsWith(ticket.shortPrefix)),
      error: null,
    };
  }

  async function handleShortTicketLookup(event) {
    const form = event.target.closest('#track-form');
    if (!form) return false;

    const trackingId = document.querySelector('#tracking-id');
    const ticket = ticketInfo(trackingId?.value || '');
    if (!ticket.isShortTicket) return false;

    const phone = cleanPhone(document.querySelector('#tracking-phone')?.value || '');
    const email = String(document.querySelector('#tracking-email')?.value || '').trim().toLowerCase();
    if (!phone && !email) return false;

    event.preventDefault();
    event.stopImmediatePropagation();

    const trackMessage = document.querySelector('#track-message');
    const trackingResult = document.querySelector('#tracking-result');
    const refreshStatusBtn = document.querySelector('#refresh-status-btn');
    const submitButton = form.querySelector('button[type="submit"]');
    const originalSubmitText = submitButton?.textContent || 'Track Request';

    if (trackingResult) trackingResult.innerHTML = '';
    if (trackMessage) trackMessage.textContent = 'Looking up requests...';
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = 'Searching...';
    }

    try {
      // First try the public RPC by contact, then fall back to a prefix match.
      // The fallback is what makes SF-DDDFBBC5 work when the database id is the
      // full UUID dddfbbc5-cff0-4bf4-a8ce-6849dff8be26.
      let data = [];
      const rpcResult = await window.ShiftFuelSupabase.rpc('public_track_request', {
        p_request_id: null,
        p_phone: phone,
        p_email: email,
      });

      if (!rpcResult.error) {
        data = (rpcResult.data || []).filter((request) => String(request.id || '').toLowerCase().startsWith(ticket.shortPrefix));
      }

      if (!data.length) {
        const directResult = await directShortTicketLookup(ticket);
        if (directResult.error) {
          console.warn('Short ticket fallback blocked:', directResult.error);
        } else {
          data = directResult.data || [];
        }
      }

      if (!data.length) {
        if (trackMessage) trackMessage.textContent = 'We could not find a matching request. Please check your phone number, email, or request number and try again.';
        return true;
      }

      if (typeof verifiedTrackingContact !== 'undefined') verifiedTrackingContact = { phone, email };
      if (trackMessage) trackMessage.textContent = '';
      if (refreshStatusBtn) refreshStatusBtn.hidden = false;
      window._trackingRequests = typeof sortTrackedRequests === 'function' ? sortTrackedRequests(data) : data;
      if (typeof renderAllRequests === 'function') await renderAllRequests(window._trackingRequests, phone, email);
      return true;
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalSubmitText;
      }
    }
  }

  function install() {
    const form = document.querySelector('#track-form');
    if (!form || form.dataset.twoCriteriaBound) return;
    form.dataset.twoCriteriaBound = '1';
    formatTicketInput();

    form.addEventListener('submit', async (event) => {
      if (criteriaCount() < 2) {
        event.preventDefault();
        event.stopImmediatePropagation();
        showCriteriaMessage();
        return;
      }
      await handleShortTicketLookup(event);
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
