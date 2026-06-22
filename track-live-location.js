// Customer-facing optional live location panel.
// Shows the assigned worker phone GPS only while an active request is being serviced.
(() => {
  if (!document.body?.classList.contains('track-page')) return;

  const CLOSED_STATUSES = new Set([
    'complete', 'completed', 'finalized', 'denied', 'customer_canceled', 'canceled',
    'cancelled', 'unable_to_complete', 'auto_reversed', 'closed_no_charge', 'canceled_return_completed',
  ]);

  const ACTIVE_TRACKING_STATUSES = new Set([
    'accepted', 'key_received', 'vehicle_picked_up', 'service_in_progress',
    'fueling_in_progress', 'car_wash_in_progress', 'partial_service_complete',
    'fueling_complete', 'car_wash_complete', 'fuel_receipt_uploaded', 'wash_receipt_uploaded',
    'service_complete', 'receipts_recorded', 'returned_location_pending',
    'return_location_recorded', 'return_photos_needed',
  ]);

  const liveState = new Map();

  function db() {
    return window.ShiftFuelSupabase;
  }

  function cleanPhone(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function emailValue() {
    return document.querySelector('#tracking-email')?.value.trim().toLowerCase() || '';
  }

  function phoneValue() {
    return cleanPhone(document.querySelector('#tracking-phone')?.value || '');
  }

  function requestList() {
    try {
      if (Array.isArray(window._trackingRequests)) return window._trackingRequests;
    } catch (_) {}
    return [];
  }

  function requestById(id) {
    return requestList().find((request) => request.id === id) || null;
  }

  function canShowLiveLocation(request) {
    if (!request || CLOSED_STATUSES.has(request.status)) return false;
    return ACTIVE_TRACKING_STATUSES.has(request.status);
  }

  function formatTime(value) {
    if (!value) return '';
    return new Date(value).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  function panelHtml(request) {
    const activeAllowed = canShowLiveLocation(request);
    return `
      <section class="track-live-location-panel" data-request-id="${request.id}">
        <div class="track-live-location-heading">
          <span class="track-live-dot" aria-hidden="true"></span>
          <div>
            <h3>Live location</h3>
            <p>${activeAllowed ? 'Live location available while your vehicle is being serviced.' : 'Live location is not currently available.'}</p>
          </div>
        </div>
        <div class="track-live-location-body">
          <p class="track-live-location-status">${activeAllowed ? 'Checking for live location...' : 'Live location is not currently available.'}</p>
          <div class="track-live-location-map" hidden>
            <iframe title="Approximate live vehicle service location" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
            <p class="field-help">Map data © OpenStreetMap contributors. Location is approximate and comes from the worker’s phone GPS.</p>
          </div>
          <div class="track-live-location-links" hidden></div>
        </div>
      </section>
    `;
  }

  function ensurePanel(card, request) {
    if (!card || !request) return null;
    let panel = card.querySelector('.track-live-location-panel');
    if (!panel) {
      const workerCard = card.querySelector('.assigned-worker-card');
      const timeline = card.querySelector('.customer-timeline')?.closest('.timeline-status-message, .customer-timeline') || card.querySelector('.customer-timeline');
      const body = card.querySelector('.track-request-body') || card;
      if (workerCard) workerCard.insertAdjacentHTML('afterend', panelHtml(request));
      else if (timeline) timeline.insertAdjacentHTML('beforebegin', panelHtml(request));
      else body.insertAdjacentHTML('afterbegin', panelHtml(request));
      panel = card.querySelector('.track-live-location-panel');
    }
    panel.hidden = false;
    return panel;
  }

  function setUnavailable(panel, message = 'Live location is not currently available.') {
    if (!panel) return;
    panel.classList.remove('is-live');
    panel.querySelector('.track-live-location-status').textContent = message;
    const map = panel.querySelector('.track-live-location-map');
    const links = panel.querySelector('.track-live-location-links');
    if (map) map.hidden = true;
    if (links) {
      links.hidden = true;
      links.innerHTML = '';
    }
  }

  function setLocation(panel, location) {
    const lat = Number(location.latitude);
    const lng = Number(location.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setUnavailable(panel);
      return;
    }

    const accuracy = location.accuracy ? ` Accuracy: about ${Math.round(location.accuracy)} meters.` : '';
    const updated = location.created_at ? ` Last updated ${formatTime(location.created_at)}.` : '';
    panel.classList.add('is-live');
    panel.querySelector('.track-live-location-status').textContent = `Worker GPS is active.${updated}${accuracy}`;

    const map = panel.querySelector('.track-live-location-map');
    const frame = map?.querySelector('iframe');
    if (map && frame) {
      const delta = 0.006;
      const bbox = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
      frame.src = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik&marker=${encodeURIComponent(`${lat},${lng}`)}`;
      map.hidden = false;
    }

    const links = panel.querySelector('.track-live-location-links');
    if (links) {
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
      const appleUrl = `https://maps.apple.com/?ll=${encodeURIComponent(`${lat},${lng}`)}`;
      links.innerHTML = `<a class="button secondary" href="${mapsUrl}" target="_blank" rel="noopener">Open in Google Maps</a><a class="button secondary" href="${appleUrl}" target="_blank" rel="noopener">Open in Apple Maps</a>`;
      links.hidden = false;
    }
  }

  async function loadLocation(requestId) {
    const request = requestById(requestId);
    const panel = document.querySelector(`.track-live-location-panel[data-request-id="${CSS.escape(requestId)}"]`);
    if (!canShowLiveLocation(request)) {
      setUnavailable(panel);
      return;
    }

    try {
      const { data, error } = await db().rpc('public_track_request_location', {
        p_request_id: requestId,
        p_phone: phoneValue(),
        p_email: emailValue(),
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        setUnavailable(panel);
        return;
      }
      setLocation(panel, row);
    } catch (error) {
      console.warn('Live location lookup unavailable:', error);
      setUnavailable(panel, 'Live location is not currently available.');
    }
  }

  function subscribeLocation(requestId) {
    if (liveState.get(requestId)?.subscribed) return;
    const channel = db()?.channel?.(`request-location-${requestId}`);
    if (channel?.on) {
      channel
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'request_locations',
          filter: `request_id=eq.${requestId}`,
        }, () => loadLocation(requestId))
        .subscribe();
    }

    const poll = setInterval(() => loadLocation(requestId), 20000);
    liveState.set(requestId, { subscribed: true, channel, poll });
  }

  function clearOldSubscriptions(activeIds) {
    for (const [requestId, state] of liveState.entries()) {
      if (activeIds.has(requestId)) continue;
      if (state.poll) clearInterval(state.poll);
      if (state.channel && db()?.removeChannel) db().removeChannel(state.channel);
      liveState.delete(requestId);
    }
  }

  function refreshLivePanels() {
    const activeIds = new Set();
    document.querySelectorAll('.track-request-card[data-request-id]').forEach((card) => {
      const requestId = card.dataset.requestId;
      const request = requestById(requestId);
      if (!request) return;
      const panel = ensurePanel(card, request);
      if (!canShowLiveLocation(request)) {
        setUnavailable(panel);
        return;
      }
      activeIds.add(requestId);
      subscribeLocation(requestId);
      loadLocation(requestId);
    });
    clearOldSubscriptions(activeIds);
  }

  function ensureStyles() {
    if (document.querySelector('#track-live-location-style')) return;
    const style = document.createElement('style');
    style.id = 'track-live-location-style';
    style.textContent = `
      .track-live-location-panel {
        margin: 18px 0;
        padding: 18px;
        background: linear-gradient(180deg, #fff, rgba(234,242,234,.82));
        border: 1px solid rgba(13,59,59,.12);
        border-radius: var(--sf-radius-md, 18px);
        box-shadow: 0 10px 28px rgba(13,59,59,.06);
      }
      .track-live-location-heading {
        display: flex;
        gap: 12px;
        align-items: flex-start;
      }
      .track-live-location-heading h3 { margin: 0 0 3px; color: var(--sf-teal-dark, #0d3b3b); }
      .track-live-location-heading p,
      .track-live-location-status { margin: 0; color: var(--sf-muted, #60716d); }
      .track-live-dot {
        width: 12px;
        height: 12px;
        margin-top: 6px;
        border-radius: 50%;
        background: #94a3b8;
        box-shadow: 0 0 0 5px rgba(148,163,184,.14);
      }
      .track-live-location-panel.is-live .track-live-dot {
        background: #16a34a;
        box-shadow: 0 0 0 5px rgba(22,163,74,.14);
      }
      .track-live-location-body { display: grid; gap: 12px; margin-top: 12px; }
      .track-live-location-map iframe {
        width: 100%;
        min-height: 260px;
        border: 0;
        border-radius: 14px;
      }
      .track-live-location-links { display: flex; flex-wrap: wrap; gap: 10px; }
    `;
    document.head.appendChild(style);
  }

  function start() {
    ensureStyles();
    refreshLivePanels();
    const result = document.querySelector('#tracking-result');
    if (result) new MutationObserver(() => setTimeout(refreshLivePanels, 0)).observe(result, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
