// In-app route + live turn-by-turn navigation for worker jobs.
//
// Opening the map shows the worker's live position, the destination, the driving
// route, a live ETA, and a next-turn banner that advances as they drive — all
// INSIDE the installed PWA. That's deliberate: handing off to Apple/Google Maps
// backgrounds the app, which pauses the customer's live GPS tracking and drops the
// screen wake lock. Navigating in-app keeps both alive. "Open in Maps" stays as a
// fallback for anyone who prefers native turn-by-turn (accepting the tracking pause).
//
// Cost control (Mapbox is billed per request): we call the Directions API once per
// leg and again ONLY when the worker strays off-route (rate-limited), never on every
// GPS tick; and we keep a single map instance per open rather than recreating it.
(() => {
  if (!document.body?.classList.contains('worker-portal-page')) return;

  const MAPBOX_TOKEN = 'pk.eyJ1IjoibW1iMHl6MTIiLCJhIjoiY21xcXZiaGU4MGxubjJvcHpidnhidG55cyJ9.Ciss2gT76eC3Zt92_qhtGA';
  const METERS_PER_MILE = 1609.34;
  const OFF_ROUTE_METERS = 60;            // re-route once the worker strays this far from the line
  const ADVANCE_STEP_METERS = 28;         // advance the next-turn banner within this radius of a maneuver
  const REROUTE_MIN_INTERVAL_MS = 12000;  // never re-request Directions more often than this

  let assetsPromise = null;
  let map = null;
  let destMarker = null;
  let workerMarker = null;
  let navWatchId = null;
  // Active navigation state for the open map: destination, the route's turn steps,
  // which step is next, the route polyline (for off-route detection), and the last
  // time we re-requested directions.
  let nav = null;

  function getJobs() {
    try { if (typeof allWorkerJobs !== 'undefined' && Array.isArray(allWorkerJobs)) return allWorkerJobs; } catch (_) {}
    return [];
  }
  function findRequest(id) { return getJobs().find((j) => j.id === id) || null; }

  function addressText(r) {
    if (r.address_street) {
      return [r.address_street, r.address_apt, r.address_city, r.address_state, r.address_zip].filter(Boolean).join(', ');
    }
    return r.hospital || '';
  }

  function isRealCoord(v) {
    const n = Number(v);
    return Number.isFinite(n) && n !== 0;
  }

  // Great-circle distance in metres between two {lat, lon} points.
  function haversine(a, b) {
    if (!a || !b) return Infinity;
    const earth = 6371000;
    const toRad = (d) => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 2 * earth * Math.asin(Math.sqrt(h));
  }

  function formatDistance(metres) {
    if (!Number.isFinite(metres)) return '';
    if (metres >= METERS_PER_MILE * 0.19) return `${(metres / METERS_PER_MILE).toFixed(1)} mi`;
    return `${Math.max(0, Math.round(metres / 0.3048))} ft`;
  }

  // Native-maps deep link (Apple Maps on iOS, Google Maps elsewhere).
  function navUrl(dest, address) {
    const d = dest ? `${dest.lat},${dest.lon}` : String(address || '').trim();
    if (!d) return '';
    const enc = encodeURIComponent(d);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent || '');
    return isIOS ? `https://maps.apple.com/?daddr=${enc}` : `https://www.google.com/maps/dir/?api=1&destination=${enc}`;
  }

  function loadAssets() {
    if (assetsPromise) return assetsPromise;
    assetsPromise = new Promise((resolve, reject) => {
      if (!document.querySelector('link[data-mapbox-gl]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css';
        link.dataset.mapboxGl = '1';
        document.head.appendChild(link);
      }
      if (window.mapboxgl) { resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load the map library.'));
      document.head.appendChild(s);
    });
    return assetsPromise;
  }

  function ensureModal() {
    let modal = document.getElementById('worker-route-modal');
    if (modal) return modal;
    ensureStyles();
    modal = document.createElement('div');
    modal.id = 'worker-route-modal';
    modal.className = 'wrm-overlay';
    modal.hidden = true;
    modal.innerHTML = `
      <div class="wrm-dialog">
        <div class="wrm-header">
          <div class="wrm-heading">
            <strong class="wrm-title">Directions</strong>
            <span class="wrm-eta"></span>
          </div>
          <button class="wrm-close" type="button" aria-label="Close">&times;</button>
        </div>
        <div class="wrm-banner" hidden>
          <span class="wrm-banner-instruction"></span>
          <span class="wrm-banner-distance"></span>
        </div>
        <div class="wrm-map"></div>
        <div class="wrm-actions">
          <a class="button secondary wrm-open-native" target="_blank" rel="noopener noreferrer">Open in Maps (turn-by-turn)</a>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('.wrm-close').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    return modal;
  }

  function closeModal() {
    stopNavWatch();
    nav = null;
    const modal = document.getElementById('worker-route-modal');
    if (modal) modal.hidden = true;
  }

  function getWorkerLocation() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
      );
    });
  }

  // ── Destination resolution ──────────────────────────────────────────────────
  // The service-address destination (pickup / return drives).
  async function resolveAddressDest(request) {
    if (isRealCoord(request.address_lat) && isRealCoord(request.address_lon)) {
      return { lat: Number(request.address_lat), lon: Number(request.address_lon), label: addressText(request) };
    }
    try {
      const res = await fetch('/api/address', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'geocode',
          street: request.address_street, city: request.address_city,
          state: request.address_state, zip: request.address_zip,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok && isRealCoord(data.lat)) return { lat: Number(data.lat), lon: Number(data.lon), label: addressText(request) };
    } catch (_) {}
    return null;
  }

  // The gas-station destination (fuel service drive): the customer's chosen station
  // if one exists, otherwise the nearest gas station to the worker via a Mapbox POI
  // category search ("Closest station to the vehicle").
  async function resolveStationDest(request, workerLoc) {
    if (isRealCoord(request.gas_station_lat) && isRealCoord(request.gas_station_lon)) {
      return { lat: Number(request.gas_station_lat), lon: Number(request.gas_station_lon), label: request.gas_station_name || 'Gas station' };
    }
    if (request.gas_station_address) {
      try {
        const res = await fetch('/api/address', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'geocode', street: request.gas_station_address }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.ok && isRealCoord(data.lat)) return { lat: Number(data.lat), lon: Number(data.lon), label: request.gas_station_name || request.gas_station_address };
      } catch (_) {}
    }
    // Closest station — one POI search near the worker's current spot.
    if (workerLoc) {
      try {
        const url = `https://api.mapbox.com/search/searchbox/v1/category/gas_station?proximity=${workerLoc.lon},${workerLoc.lat}&limit=1&access_token=${MAPBOX_TOKEN}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          const feature = data.features && data.features[0];
          const coords = feature?.geometry?.coordinates;
          if (Array.isArray(coords) && coords.length === 2) {
            return { lat: Number(coords[1]), lon: Number(coords[0]), label: feature.properties?.name || 'Nearest gas station' };
          }
        }
      } catch (_) {}
    }
    return null;
  }

  // ── Directions + route drawing ───────────────────────────────────────────────
  async function fetchDirections(origin, dest) {
    const coords = `${origin.lon},${origin.lat};${dest.lon},${dest.lat}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?access_token=${MAPBOX_TOKEN}&geometries=geojson&overview=full&steps=true`;
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      const data = await r.json();
      return (data.routes && data.routes[0]) || null;
    } catch (_) { return null; }
  }

  function setRouteOnMap(route) {
    const geojson = { type: 'Feature', geometry: route.geometry };
    if (map.getSource('wrm-route')) {
      map.getSource('wrm-route').setData(geojson);
    } else {
      map.addSource('wrm-route', { type: 'geojson', data: geojson });
      map.addLayer({
        id: 'wrm-route', type: 'line', source: 'wrm-route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#1f7a45', 'line-width': 6, 'line-opacity': 0.85 },
      });
    }
  }

  function setEta(route) {
    const etaEl = document.querySelector('#worker-route-modal .wrm-eta');
    if (!etaEl) return;
    const minutes = Math.max(1, Math.round(route.duration / 60));
    const miles = (route.distance / METERS_PER_MILE).toFixed(1);
    etaEl.textContent = `${minutes} min · ${miles} mi`;
  }

  function adoptRoute(route, dest) {
    nav = {
      dest,
      steps: (route.legs && route.legs[0] && route.legs[0].steps) || [],
      stepIndex: 0,
      routeCoords: (route.geometry.coordinates || []).map((c) => ({ lon: c[0], lat: c[1] })),
      lastReroute: Date.now(),
    };
  }

  // Update the next-turn banner: advance past any maneuver we've reached, then show
  // the upcoming instruction and the live distance to it.
  function updateBanner(workerLoc) {
    const modal = document.getElementById('worker-route-modal');
    if (!modal) return;
    const banner = modal.querySelector('.wrm-banner');
    const instrEl = modal.querySelector('.wrm-banner-instruction');
    const distEl = modal.querySelector('.wrm-banner-distance');
    if (!nav || !nav.steps.length) { banner.hidden = true; return; }
    banner.hidden = false;

    if (workerLoc) {
      while (nav.stepIndex < nav.steps.length - 1) {
        const m = nav.steps[nav.stepIndex].maneuver?.location;
        if (!m) break;
        if (haversine(workerLoc, { lon: m[0], lat: m[1] }) <= ADVANCE_STEP_METERS) nav.stepIndex++;
        else break;
      }
    }

    const step = nav.steps[nav.stepIndex];
    instrEl.textContent = step?.maneuver?.instruction || 'Continue to the destination';
    const m = step?.maneuver?.location;
    distEl.textContent = (workerLoc && m) ? formatDistance(haversine(workerLoc, { lon: m[0], lat: m[1] })) : '';
  }

  function minDistanceToRoute(point) {
    if (!nav?.routeCoords?.length) return Infinity;
    let min = Infinity;
    for (const c of nav.routeCoords) {
      const d = haversine(point, c);
      if (d < min) min = d;
    }
    return min;
  }

  // Re-request directions only when the worker has clearly left the route, and no
  // more often than REROUTE_MIN_INTERVAL_MS — this keeps Directions usage tiny.
  async function maybeReroute(workerLoc) {
    if (!nav) return;
    if (Date.now() - nav.lastReroute < REROUTE_MIN_INTERVAL_MS) return;
    if (minDistanceToRoute(workerLoc) <= OFF_ROUTE_METERS) return;
    nav.lastReroute = Date.now();
    const route = await fetchDirections(workerLoc, nav.dest);
    if (route) {
      setRouteOnMap(route);
      setEta(route);
      adoptRoute(route, nav.dest);
      updateBanner(workerLoc);
    }
  }

  function startNavWatch() {
    if (navWatchId != null || !navigator.geolocation) return;
    navWatchId = navigator.geolocation.watchPosition((pos) => {
      const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      if (workerMarker) workerMarker.setLngLat([loc.lon, loc.lat]);
      if (map) map.easeTo({ center: [loc.lon, loc.lat], duration: 600 });
      updateBanner(loc);
      maybeReroute(loc);
    }, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
  }

  function stopNavWatch() {
    if (navWatchId != null && navigator.geolocation) navigator.geolocation.clearWatch(navWatchId);
    navWatchId = null;
  }

  // ── Open the map for a job ────────────────────────────────────────────────────
  // destType: 'address' (pickup / return) or 'station' (fuel service drive).
  async function openRouteMap(request, destType) {
    const isStation = destType === 'station';
    const modal = ensureModal();
    const titleEl = modal.querySelector('.wrm-title');
    const etaEl = modal.querySelector('.wrm-eta');
    const nativeBtn = modal.querySelector('.wrm-open-native');
    const banner = modal.querySelector('.wrm-banner');
    titleEl.textContent = isStation ? 'Drive to gas station' : 'Directions to service address';
    etaEl.textContent = 'Loading map…';
    banner.hidden = true;
    stopNavWatch();
    nav = null;
    modal.hidden = false;

    try {
      await loadAssets();
    } catch (e) {
      etaEl.textContent = 'Could not load the map.';
      return;
    }

    // Worker location first — needed as the route origin and for the closest-station search.
    const workerLoc = await getWorkerLocation();
    const dest = isStation ? await resolveStationDest(request, workerLoc) : await resolveAddressDest(request);
    if (!dest) {
      etaEl.textContent = isStation ? 'Could not find a gas station nearby.' : 'Could not locate the service address.';
      nativeBtn.href = navUrl(null, isStation ? (request.gas_station_address || request.gas_station_name) : addressText(request));
      return;
    }
    nativeBtn.href = navUrl(dest, dest.label);

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const mapEl = modal.querySelector('.wrm-map');
    if (map) { map.remove(); map = null; }
    map = new mapboxgl.Map({
      container: mapEl,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [dest.lon, dest.lat],
      zoom: 13,
    });
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');

    map.on('load', async () => {
      map.resize();
      destMarker = new mapboxgl.Marker({ color: '#b42318' }).setLngLat([dest.lon, dest.lat])
        .setPopup(new mapboxgl.Popup().setText(dest.label || (isStation ? 'Gas station' : 'Service address'))).addTo(map);

      if (!workerLoc) {
        etaEl.textContent = 'Turn on location to navigate.';
        map.flyTo({ center: [dest.lon, dest.lat], zoom: 13 });
        return;
      }

      workerMarker = new mapboxgl.Marker({ color: '#1f7a45' }).setLngLat([workerLoc.lon, workerLoc.lat]).addTo(map);
      const route = await fetchDirections(workerLoc, dest);
      if (!route) {
        etaEl.textContent = 'On the way — directions unavailable right now.';
        map.flyTo({ center: [workerLoc.lon, workerLoc.lat], zoom: 13 });
        return;
      }

      setRouteOnMap(route);
      setEta(route);
      adoptRoute(route, dest);
      updateBanner(workerLoc);

      const bounds = new mapboxgl.LngLatBounds();
      route.geometry.coordinates.forEach((c) => bounds.extend(c));
      map.fitBounds(bounds, { padding: 60, duration: 500 });

      startNavWatch(); // live position + banner advance + off-route reroute
    });
  }

  function ensureStyles() {
    if (document.getElementById('worker-route-map-style')) return;
    const style = document.createElement('style');
    style.id = 'worker-route-map-style';
    style.textContent = `
      .wrm-overlay { position: fixed; inset: 0; z-index: 1000; background: rgba(0,0,0,.55);
        display: flex; align-items: center; justify-content: center; padding: 16px; }
      .wrm-overlay[hidden] { display: none; }
      .wrm-dialog { background: #fff; border-radius: 16px; width: min(680px, 96vw);
        max-height: 92vh; display: flex; flex-direction: column; overflow: hidden; }
      .wrm-header { display: flex; align-items: center; justify-content: space-between;
        padding: 14px 16px; border-bottom: 1px solid #eef2ef; }
      .wrm-title { display: block; color: #0d3b3b; }
      .wrm-eta { font-size: .85rem; color: #1f7a45; font-weight: 700; }
      .wrm-close { border: none; background: none; font-size: 1.8rem; line-height: 1; cursor: pointer; color: #6b7280; }
      .wrm-banner { display: flex; align-items: center; justify-content: space-between; gap: 12px;
        padding: 14px 16px; background: #0d3b3b; color: #fff; }
      .wrm-banner[hidden] { display: none; }
      .wrm-banner-instruction { font-weight: 800; font-size: 1.02rem; line-height: 1.3; }
      .wrm-banner-distance { font-weight: 800; font-size: .95rem; color: #bfe3cf; white-space: nowrap; }
      .wrm-map { width: 100%; height: min(60vh, 460px); background: #1a1a2e; }
      .wrm-actions { padding: 14px 16px; }
      .wrm-actions .button { display: block; width: 100%; text-align: center; text-decoration: none; }
    `;
    document.head.appendChild(style);
  }

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-route-map]');
    if (!btn) return;
    event.preventDefault();
    const request = findRequest(btn.dataset.id);
    if (request) openRouteMap(request, btn.dataset.routeDest || 'address');
  });
})();
