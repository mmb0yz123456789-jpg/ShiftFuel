// Customer-facing optional live location panel.
// Shows the assigned worker phone GPS only while an active request is being serviced.
(() => {
  if (!document.body?.classList.contains('track-page')) return;

  const CLOSED_STATUSES = new Set([
    'complete', 'completed', 'finalized', 'denied', 'customer_canceled', 'canceled',
    'cancelled', 'unable_to_complete', 'auto_reversed', 'closed_no_charge', 'canceled_return_completed',
  ]);

  // Show the worker's live location for the whole time they hold the customer's
  // key/vehicle: from key pickup, through service, and across the return trip,
  // until the key/vehicle is physically handed back. (No 'accepted' — that's
  // before the key is picked up.)
  const ACTIVE_TRACKING_STATUSES = new Set([
    'key_received',
    'pickup_vehicle_photo_uploaded', 'pickup_odometer_photo_uploaded', 'pickup_fuel_gauge_photo_uploaded',
    'vehicle_picked_up', 'service_in_progress',
    'fueling_in_progress', 'car_wash_in_progress', 'partial_service_complete',
    'fueling_complete', 'car_wash_complete', 'fuel_and_wash_complete',
    'fuel_receipt_uploaded', 'wash_receipt_uploaded',
    'service_complete', 'receipts_recorded',
    // Return trip — keep showing the worker until the key/vehicle is returned.
    'returned_location_pending', 'return_location_recorded', 'return_photos_needed',
    'dropoff_vehicle_photo_uploaded', 'dropoff_odometer_photo_uploaded', 'dropoff_fuel_gauge_photo_uploaded',
    'vehicle_returned', 'inspection_needed', 'inspection_recorded', 'final_payment_processed',
    'awaiting_key_return',
    // Payment waits that happen before the key is returned.
    'pending_customer_payment', 'payment_issue', 'authorization_too_low',
    // Cancellation / return that still requires handing the key/vehicle back.
    'cancelled_pending_key_return', 'return_requested', 'customer_return_requested',
  ]);

  const liveState = new Map();
  let lastCardSignature = '';
  function db() {
    return window.ShiftFuelSupabase;
  }

  function cleanPhone(value) {
    return String(value || '').replace(/\D/g, '');
  }

  function emailValue() {
    // Prefer the verified contact set by track.js; fall back to the search input.
    return window._trackingContact?.email ||
      document.querySelector('#tracking-email')?.value.trim().toLowerCase() || '';
  }

  function phoneValue() {
    return cleanPhone(
      window._trackingContact?.phone ||
      document.querySelector('#tracking-phone')?.value || ''
    );
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
            <div class="track-live-map-canvas" aria-label="Approximate live vehicle service location"></div>
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

  // Load Leaflet once (CSS + JS) so we can show a live, smoothly-updating map
  // instead of a flickering iframe that reloads on every GPS update.
  let leafletPromise = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (leafletPromise) return leafletPromise;
    leafletPromise = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      js.onload = () => resolve();
      js.onerror = reject;
      document.head.appendChild(js);
    });
    return leafletPromise;
  }

  function liveMarkerIcon() {
    return window.L.divIcon({
      className: 'track-live-marker',
      html: '<span class="track-live-marker-pulse"></span><span class="track-live-marker-dot"></span>',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
  }

  // ── Map provider ──────────────────────────────────────────────────────────
  // Primary: Mapbox GL JS (billed per map LOAD, not per tile — best for long
  // live-tracking sessions). Set window.SHIFTFUEL_MAPBOX_TOKEN to enable it.
  // Fallback (no token): Leaflet + free OpenStreetMap tiles, so the map still
  // works during development before a Mapbox key is configured.
  function getMapboxToken() {
    try { return (window.SHIFTFUEL_MAPBOX_TOKEN || '').trim(); } catch (_) { return ''; }
  }

  let mapboxPromise = null;
  function loadMapbox() {
    if (window.mapboxgl) return Promise.resolve();
    if (mapboxPromise) return mapboxPromise;
    mapboxPromise = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.css';
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = 'https://api.mapbox.com/mapbox-gl-js/v3.7.0/mapbox-gl.js';
      js.onload = () => resolve();
      js.onerror = reject;
      document.head.appendChild(js);
    });
    return mapboxPromise;
  }

  function markerElement() {
    const el = document.createElement('div');
    el.className = 'track-live-marker';
    el.innerHTML = '<span class="track-live-marker-pulse"></span><span class="track-live-marker-dot"></span>';
    return el;
  }

  // Smoothly move an existing map+marker to the new point (no reload).
  function updateLiveMap(state, lat, lng) {
    if (state.engine === 'mapbox') {
      state.marker.setLngLat([lng, lat]);
      state.map.easeTo({ center: [lng, lat], duration: 800 });
    } else {
      state.map.invalidateSize(); // in case the container was just re-shown
      state.marker.setLatLng([lat, lng]);
      state.map.panTo([lat, lng], { animate: true, duration: 0.8 });
    }
  }

  async function createLiveMap(requestId, canvas, lat, lng) {
    const state = liveState.get(requestId) || {};
    const token = getMapboxToken();
    try {
      if (token) {
        await loadMapbox();
        window.mapboxgl.accessToken = token;
        const map = new window.mapboxgl.Map({
          container: canvas,
          style: 'mapbox://styles/mapbox/streets-v12',
          center: [lng, lat],
          zoom: 14,
        });
        map.scrollZoom.disable(); // let the page scroll over the map
        const marker = new window.mapboxgl.Marker({ element: markerElement() }).setLngLat([lng, lat]).addTo(map);
        map.on('load', () => map.resize());
        state.engine = 'mapbox';
        state.map = map;
        state.marker = marker;
      } else {
        await loadLeaflet();
        const map = window.L.map(canvas, {
          zoomControl: true,
          attributionControl: true,
          scrollWheelZoom: false,
        }).setView([lat, lng], 15);
        window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap contributors',
        }).addTo(map);
        state.engine = 'leaflet';
        state.map = map;
        state.marker = window.L.marker([lat, lng], { icon: liveMarkerIcon() }).addTo(map);
        setTimeout(() => map.invalidateSize(), 60);
      }
    } catch (err) {
      console.warn('Could not load the live map:', err);
    } finally {
      state.creatingMap = false;
      liveState.set(requestId, state);
    }
  }

  async function setLocation(panel, location) {
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

    const mapWrap = panel.querySelector('.track-live-location-map');
    const canvas = panel.querySelector('.track-live-map-canvas');
    if (mapWrap && canvas) {
      mapWrap.hidden = false;
      const requestId = panel.dataset.requestId;
      const state = liveState.get(requestId) || {};
      if (state.map) {
        updateLiveMap(state, lat, lng);
      } else if (!state.creatingMap) {
        // Reserve immediately so a concurrent update can't build a second map.
        state.creatingMap = true;
        liveState.set(requestId, state);
        await createLiveMap(requestId, canvas, lat, lng);
      }
    }

    const links = panel.querySelector('.track-live-location-links');
    if (links) {
      const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
      const appleUrl = `https://maps.apple.com/?ll=${encodeURIComponent(`${lat},${lng}`)}`;
      const wantedHtml = `<a class="button secondary" href="${mapsUrl}" target="_blank" rel="noopener">Open in Google Maps</a><a class="button secondary" href="${appleUrl}" target="_blank" rel="noopener">Open in Apple Maps</a>`;
      // Only rewrite the links when they actually change (avoids needless DOM churn).
      if (links.dataset.coords !== `${lat},${lng}`) {
        links.innerHTML = wantedHtml;
        links.dataset.coords = `${lat},${lng}`;
      }
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

    const state = liveState.get(requestId) || {};
    const isCurrentlyLive = panel?.classList.contains('is-live');

    try {
      const { data, error } = await db().rpc('public_track_request_location', {
        p_request_id: requestId,
        p_phone: phoneValue(),
        p_email: emailValue(),
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        // Allow 2 consecutive empty responses before hiding the map,
        // so a single slow poll doesn't flash the panel unavailable.
        state.missCount = (state.missCount || 0) + 1;
        liveState.set(requestId, state);
        if (!isCurrentlyLive || state.missCount >= 2) {
          setUnavailable(panel);
        }
        return;
      }
      state.missCount = 0;
      liveState.set(requestId, state);
      setLocation(panel, row);
    } catch (error) {
      console.warn('Live location lookup unavailable:', error);
      state.missCount = (state.missCount || 0) + 1;
      liveState.set(requestId, state);
      if (!isCurrentlyLive || state.missCount >= 2) {
        setUnavailable(panel, 'Live location is not currently available.');
      }
    }
  }

  function subscribeLocation(requestId) {
    const state = liveState.get(requestId) || {};
    if (state.subscribed) return; // already wired up — never re-subscribe (causes realtime errors)

    let channel = null;
    const realtime = db();
    if (realtime?.channel) {
      // Attach the postgres_changes handler to a FRESH channel BEFORE subscribing.
      channel = realtime.channel(`request-location-${requestId}`);
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
    liveState.set(requestId, { ...state, subscribed: true, channel, poll });
  }

  function clearOldSubscriptions(activeIds) {
    for (const [requestId, state] of liveState.entries()) {
      if (activeIds.has(requestId)) continue;
      if (state.poll) clearInterval(state.poll);
      if (state.channel && db()?.removeChannel) db().removeChannel(state.channel);
      if (state.map) {
        try { state.map.remove(); } catch (_) {}
      }
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
      .track-live-location-map { position: relative; }
      .track-live-map-canvas {
        width: 100%;
        height: 280px;
        border-radius: 14px;
        overflow: hidden;
        background: #e8eef0;
      }
      .track-live-map-canvas .leaflet-control-attribution { font-size: 10px; }
      /* Uber-style pulsing live marker */
      .track-live-marker { position: relative; width: 22px; height: 22px; }
      .track-live-marker-dot {
        position: absolute; left: 50%; top: 50%;
        width: 14px; height: 14px; margin: -7px 0 0 -7px;
        background: #16a34a; border: 2px solid #fff; border-radius: 50%;
        box-shadow: 0 1px 4px rgba(0,0,0,.35);
      }
      .track-live-marker-pulse {
        position: absolute; left: 50%; top: 50%;
        width: 14px; height: 14px; margin: -7px 0 0 -7px;
        background: rgba(22,163,74,.45); border-radius: 50%;
        animation: track-live-pulse 1.8s ease-out infinite;
      }
      @keyframes track-live-pulse {
        0% { transform: scale(1); opacity: .7; }
        100% { transform: scale(3.4); opacity: 0; }
      }
      .track-live-location-links { display: flex; flex-wrap: wrap; gap: 10px; }
    `;
    document.head.appendChild(style);
  }

  // Signature of the request cards currently on screen — used so the observer
  // only re-wires panels when a NEW lookup changes the set of cards, not when
  // Leaflet or a marker update mutates the DOM (which caused a refresh loop).
  function cardSignature() {
    return [...document.querySelectorAll('.track-request-card[data-request-id]')]
      .map((c) => c.dataset.requestId)
      .sort()
      .join(',');
  }

  function start() {
    ensureStyles();
    refreshLivePanels();
    lastCardSignature = cardSignature();
    const result = document.querySelector('#tracking-result');
    if (result) {
      let debounceTimer = null;
      new MutationObserver(() => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const sig = cardSignature();
          if (sig === lastCardSignature) return; // same cards — don't re-wire (no flicker, no re-subscribe)
          lastCardSignature = sig;
          refreshLivePanels();
        }, 400);
      }).observe(result, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
