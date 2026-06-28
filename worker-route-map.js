// In-app route + live turn-by-turn navigation for worker jobs.
//
// Opening the map shows a follow-the-car navigation view (Uber/Lyft style): the
// worker's live position as a direction arrow, a close zoomed + tilted camera that
// rotates to their heading, the route, a live ETA, and a next-turn banner that
// advances as they drive — all INSIDE the installed PWA. That's deliberate: handing
// off to Apple/Google Maps backgrounds the app, which pauses the customer's live
// GPS tracking and drops the screen wake lock. Navigating in-app keeps both alive,
// so the app IS the GPS — there's no native "Open in Maps" handoff.
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
  // The car wash we currently use — geocoded on demand for the wash service leg.
  const CAR_WASH = { name: 'The Car Spa', address: '602 Main St, Wilmington, DE 19804' };
  const NAV_ZOOM = 16.7;                  // close, street-level follow zoom
  const NAV_PITCH = 62;                   // 3D tilt for the driving view
  const ARRIVE_METERS = 45;               // auto "arrived" radius at the destination

  // Every leg is the same full-screen nav with ONE bottom button = the only exit
  // (no close). The label is the action for that leg; tapping it runs the matching
  // transition in worker.js (window.ShiftFuelOnNavAction) and closes the map.
  const LEG_BUTTON = {
    address: 'Key received',
    wash: 'Start service',
    station: 'Start service',
    return: 'Vehicle returned',
    handoff: 'Keys returned',
  };

  let assetsPromise = null;
  let map = null;
  let destMarker = null;
  let workerMarker = null;
  let navWatchId = null;
  // Active navigation state for the open map: destination, the route's turn steps,
  // which step is next, the route polyline (off-route detection), whether the camera
  // is following the worker, and the last known position/heading.
  let nav = null;

  // Screen wake lock held WHILE THE NAV MAP IS OPEN (any leg). The worker is actively
  // driving with directions up, so the screen must stay on — this also keeps the app
  // foregrounded so GPS keeps streaming, which powers the customer's live ETA on the
  // drive to them (separate from the key-in-hand tracking lock).
  let navWakeLock = null;
  async function acquireNavWakeLock() {
    if (navWakeLock || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try {
      navWakeLock = await navigator.wakeLock.request('screen');
      navWakeLock.addEventListener('release', () => { navWakeLock = null; });
    } catch (_) { navWakeLock = null; }
  }
  async function releaseNavWakeLock() {
    if (!navWakeLock) return;
    try { await navWakeLock.release(); } catch (_) {}
    navWakeLock = null;
  }

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

  // Compass bearing in degrees from point a to point b (0 = north, 90 = east).
  function bearing(a, b) {
    if (!a || !b) return NaN;
    const toRad = (d) => d * Math.PI / 180;
    const toDeg = (r) => r * 180 / Math.PI;
    const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
    const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat))
      - Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  function formatDistance(metres) {
    if (!Number.isFinite(metres)) return '';
    if (metres >= METERS_PER_MILE * 0.19) return `${(metres / METERS_PER_MILE).toFixed(1)} mi`;
    return `${Math.max(0, Math.round(metres / 0.3048))} ft`;
  }

  // Mapbox Standard light preset chosen from the worker's local clock, so the map
  // is bright in the day and dark at night automatically.
  function lightPresetForNow() {
    const h = new Date().getHours();
    if (h >= 5 && h < 7) return 'dawn';
    if (h >= 7 && h < 17) return 'day';
    if (h >= 17 && h < 19) return 'dusk';
    return 'night';
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

  // Direction-arrow "puck" element for the worker's live position.
  function makePuckElement() {
    const el = document.createElement('div');
    el.className = 'wrm-puck';
    el.innerHTML = `<svg viewBox="0 0 24 24" width="36" height="36" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#2f6bef" opacity="0.2"/>
      <path d="M12 3 L19 20 L12 15.5 L5 20 Z" fill="#2f6bef" stroke="#ffffff" stroke-width="1.6" stroke-linejoin="round"/>
    </svg>`;
    return el;
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
        <div class="wrm-map-wrap">
          <div class="wrm-map"></div>

          <div class="wrm-banner" hidden>
            <span class="wrm-banner-icon" aria-hidden="true"></span>
            <div class="wrm-banner-text">
              <span class="wrm-banner-distance"></span>
              <span class="wrm-banner-instruction"></span>
            </div>
          </div>

          <div class="wrm-speed" hidden>
            <div class="wrm-speed-limit" hidden>
              <b class="wrm-spd-limit"></b><span>mph</span>
            </div>
            <div class="wrm-speed-now"><b class="wrm-spd-now">0</b><span>mph</span></div>
          </div>

          <button class="wrm-close" type="button" aria-label="Close" hidden>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>

          <button class="wrm-recenter" type="button" hidden>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
            Re-center
          </button>

          <div class="wrm-bottom">
            <span class="wrm-eta"></span>
            <button class="wrm-start-service" type="button" hidden>Start service</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('.wrm-close').addEventListener('click', closeModal);
    modal.querySelector('.wrm-recenter').addEventListener('click', () => {
      if (nav) { nav.follow = true; if (nav.lastLoc) applyNavCamera(nav.lastLoc, nav.lastBearing); }
      toggleRecenter(false);
    });
    // Manual "I'm here, start" — closes the map and advances to service (same guarded
    // hook the auto-arrival uses, so it's a no-op if service already started).
    modal.querySelector('.wrm-start-service').addEventListener('click', () => {
      const rid = nav?.requestId;
      const dt = nav?.destType;
      closeModal();
      if (rid && typeof window.ShiftFuelOnNavAction === 'function') window.ShiftFuelOnNavAction(rid, dt);
    });
    return modal;
  }

  function toggleRecenter(show) {
    const btn = document.querySelector('#worker-route-modal .wrm-recenter');
    if (btn) btn.hidden = !show;
  }

  function closeModal() {
    stopNavWatch();
    releaseNavWakeLock();
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
  // A spot captured into the request notes as [<tag> lat,lon] (pickup_coords = the
  // car's parking spot; handoff_coords = where the worker met the customer).
  function parseSpotCoords(request, tag) {
    const m = String(request?.notes || '').match(new RegExp('\\[' + tag + ' (-?\\d+(?:\\.\\d+)?),(-?\\d+(?:\\.\\d+)?)\\]'));
    if (!m) return null;
    const lat = Number(m[1]), lon = Number(m[2]);
    return (Number.isFinite(lat) && Number.isFinite(lon)) ? { lat, lon } : null;
  }

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

  // The car wash facility (The Car Spa) — geocode its address once per open.
  async function resolveWashDest() {
    try {
      const res = await fetch('/api/address', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'geocode', street: CAR_WASH.address }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.ok && isRealCoord(data.lat)) return { lat: Number(data.lat), lon: Number(data.lon), label: CAR_WASH.name };
    } catch (_) {}
    return null;
  }

  // ── Directions + route drawing ───────────────────────────────────────────────
  async function fetchDirections(origin, dest) {
    const coords = `${origin.lon},${origin.lat};${dest.lon},${dest.lat}`;
    // driving-traffic: live-traffic-aware ETA + routing for in-app navigation
    // (same Directions API + price tier as plain driving).
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coords}?access_token=${MAPBOX_TOKEN}&geometries=geojson&overview=full&steps=true&annotations=maxspeed`;
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
      // Bright-blue route with a darker casing, like the native nav line. `slot`
      // tucks it under labels/3D on the Standard style (ignored on other styles).
      map.addLayer({
        id: 'wrm-route-casing', type: 'line', source: 'wrm-route', slot: 'middle',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#1b4fc4', 'line-width': 11, 'line-opacity': 0.9 },
      });
      map.addLayer({
        id: 'wrm-route', type: 'line', source: 'wrm-route', slot: 'middle',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#4a90ff', 'line-width': 7, 'line-opacity': 1 },
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
    nav = nav || {};
    nav.dest = dest;
    nav.steps = (route.legs && route.legs[0] && route.legs[0].steps) || [];
    nav.stepIndex = 0;
    nav.routeCoords = (route.geometry.coordinates || []).map((c) => ({ lon: c[0], lat: c[1] }));
    nav.maxspeed = (route.legs && route.legs[0] && route.legs[0].annotation && route.legs[0].annotation.maxspeed) || [];
    nav.lastReroute = Date.now();
    if (nav.follow === undefined) nav.follow = true;
  }

  // Follow-camera: center on the worker, zoom in, tilt, and rotate the map so the
  // direction of travel points up — the Uber/Lyft driving view.
  function applyNavCamera(loc, bearingDeg) {
    if (!map || !loc) return;
    // Push the puck into the lower third so the road ahead fills the screen — the
    // way a car GPS frames the drive.
    const h = map.getContainer()?.clientHeight || 0;
    map.easeTo({
      center: [loc.lon, loc.lat],
      zoom: NAV_ZOOM,
      pitch: NAV_PITCH,
      bearing: Number.isFinite(bearingDeg) ? bearingDeg : map.getBearing(),
      padding: { top: Math.round(h * 0.55), bottom: 0, left: 0, right: 0 },
      duration: 700,
      essential: true,
    });
  }

  // Turn-arrow for the banner: an up-arrow rotated to the maneuver direction, or a
  // destination pin on arrival — the way a car GPS shows the next turn.
  function maneuverRotation(step) {
    const mod = (step?.maneuver?.modifier || '').toLowerCase();
    const angles = { 'sharp left': -135, left: -90, 'slight left': -40, straight: 0, 'slight right': 40, right: 90, 'sharp right': 135, uturn: 180 };
    return mod in angles ? angles[mod] : 0;
  }
  function setBannerIcon(iconEl, step) {
    if (!iconEl) return;
    if ((step?.maneuver?.type || '').toLowerCase() === 'arrive') {
      iconEl.style.transform = '';
      iconEl.innerHTML = `<svg viewBox="0 0 24 24" width="30" height="30" fill="#fff" aria-hidden="true"><path d="M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11z"/><circle cx="12" cy="10" r="2.4" fill="#2f6bef"/></svg>`;
      return;
    }
    iconEl.innerHTML = `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20V6M6 12l6-6 6 6"/></svg>`;
    iconEl.style.transform = `rotate(${maneuverRotation(step)}deg)`;
  }

  // Posted speed limit for the worker's current segment, from the route's maxspeed
  // annotation. Best-effort: null when Mapbox has no data for that road.
  function currentSpeedLimit(loc) {
    if (!loc || !nav?.maxspeed?.length || !nav?.routeCoords?.length) return null;
    let min = Infinity, idx = 0;
    for (let i = 0; i < nav.routeCoords.length; i++) {
      const d = haversine(loc, nav.routeCoords[i]);
      if (d < min) { min = d; idx = i; }
    }
    const seg = nav.maxspeed[Math.min(idx, nav.maxspeed.length - 1)];
    if (!seg || seg.none || seg.unknown || seg.speed == null) return null;
    const mph = seg.unit === 'km/h' ? Math.round(seg.speed * 0.621371) : Math.round(seg.speed);
    return mph > 0 ? mph : null;
  }

  // Update the speed widget: current speed from the device GPS + posted limit.
  function updateSpeed(speedMps, loc) {
    const modal = document.getElementById('worker-route-modal');
    if (!modal) return;
    const nowEl = modal.querySelector('.wrm-spd-now');
    const limitWrap = modal.querySelector('.wrm-speed-limit');
    const limitEl = modal.querySelector('.wrm-spd-limit');
    if (nowEl && Number.isFinite(speedMps) && speedMps >= 0) {
      nowEl.textContent = String(Math.round(speedMps * 2.23694));
    }
    const lim = currentSpeedLimit(loc);
    if (lim && limitWrap && limitEl) { limitEl.textContent = String(lim); limitWrap.hidden = false; }
    else if (limitWrap) limitWrap.hidden = true;
  }

  // Update the next-turn banner: advance past any maneuver we've reached, then show
  // the upcoming instruction and the live distance to it.
  function updateBanner(workerLoc) {
    const modal = document.getElementById('worker-route-modal');
    if (!modal) return;
    const banner = modal.querySelector('.wrm-banner');
    const instrEl = modal.querySelector('.wrm-banner-instruction');
    const distEl = modal.querySelector('.wrm-banner-distance');
    if (!nav || !nav.steps || !nav.steps.length) { banner.hidden = true; return; }
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
    setBannerIcon(modal.querySelector('.wrm-banner-icon'), step);
    const m = step?.maneuver?.location;
    // Distance to the next maneuver leads (big); the road/instruction sits below.
    distEl.textContent = (workerLoc && m) ? formatDistance(haversine(workerLoc, { lon: m[0], lat: m[1] })) : '';
    instrEl.textContent = step?.name || step?.maneuver?.instruction || 'Continue to the destination';
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

      // Auto-arrival: reached the destination on an auto step (drive to station →
      // start service, or drive back → vehicle returned).
      if (nav && nav.autoArrive && !nav.arrived && nav.dest && haversine(loc, nav.dest) <= ARRIVE_METERS) {
        nav.arrived = true;
        handleArrival();
        return;
      }

      // Heading from the device when moving, else inferred from the last position.
      let heading = Number.isFinite(pos.coords.heading) ? pos.coords.heading : NaN;
      if (!Number.isFinite(heading) && nav?.lastLoc) heading = bearing(nav.lastLoc, loc);
      if (nav) {
        if (Number.isFinite(heading)) nav.lastBearing = heading;
        nav.lastLoc = loc;
        if (nav.follow) applyNavCamera(loc, nav.lastBearing);
      }
      updateBanner(loc);
      updateSpeed(pos.coords.speed, loc);
      maybeReroute(loc);
    }, () => {}, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
  }

  function stopNavWatch() {
    if (navWatchId != null && navigator.geolocation) navigator.geolocation.clearWatch(navWatchId);
    navWatchId = null;
  }

  // Reached the gas station on the "drive to station" step: show a brief arrival
  // note, then close the map and hand off to the worker portal to auto-advance the
  // job to "service in progress" (so they don't tap Start service — they're here).
  function handleArrival() {
    const requestId = nav?.requestId;
    const destType = nav?.destType;
    const isReturn = destType === 'return';
    const modal = document.getElementById('worker-route-modal');
    if (modal) {
      const banner = modal.querySelector('.wrm-banner');
      const instrEl = modal.querySelector('.wrm-banner-instruction');
      const distEl = modal.querySelector('.wrm-banner-distance');
      if (banner) banner.hidden = false;
      if (instrEl) instrEl.textContent = isReturn
        ? "Back at the car's spot — marking the vehicle returned…"
        : `Arrived at ${destType === 'wash' ? 'the car wash' : 'the gas station'} — starting service…`;
      if (distEl) distEl.textContent = '';
    }
    stopNavWatch();
    setTimeout(() => {
      closeModal();
      if (requestId && typeof window.ShiftFuelOnNavArrive === 'function') window.ShiftFuelOnNavArrive(requestId, destType);
    }, 1600);
  }

  // ── Open the map for a job ────────────────────────────────────────────────────
  // destType: 'address' (pickup / return) or 'station' (fuel service drive).
  async function openRouteMap(request, destType) {
    const isStation = destType === 'station';
    const isWash = destType === 'wash';
    const isReturn = destType === 'return';
    const isHandoff = destType === 'handoff';
    const modal = ensureModal();
    const etaEl = modal.querySelector('.wrm-eta');
    const banner = modal.querySelector('.wrm-banner');
    const startBtn = modal.querySelector('.wrm-start-service');
    const closeBtn = modal.querySelector('.wrm-close');
    etaEl.textContent = 'Loading map…';
    banner.hidden = true;
    // The leg's contextual button is the ONLY exit (shown immediately, even before
    // the route loads); no ✕ on any leg.
    const legLabel = LEG_BUTTON[destType] || '';
    if (startBtn) { startBtn.textContent = legLabel || 'Done'; startBtn.hidden = !legLabel; }
    if (closeBtn) closeBtn.hidden = !!legLabel;
    const speedWidget = modal.querySelector('.wrm-speed');
    if (speedWidget) {
      speedWidget.hidden = true;
      const spdNow = speedWidget.querySelector('.wrm-spd-now');
      if (spdNow) spdNow.textContent = '0';
      const spdLimit = speedWidget.querySelector('.wrm-speed-limit');
      if (spdLimit) spdLimit.hidden = true;
    }
    if (startBtn) startBtn.hidden = true;
    toggleRecenter(false);
    stopNavWatch();
    nav = null;
    acquireNavWakeLock(); // keep the screen on while navigating (within this tap)
    modal.hidden = false;

    try {
      await loadAssets();
    } catch (e) {
      etaEl.textContent = 'Could not load the map.';
      return;
    }

    // Worker location first — needed as the route origin and for the closest-station search.
    const workerLoc = await getWorkerLocation();
    let dest;
    if (isStation) {
      dest = await resolveStationDest(request, workerLoc);
    } else if (isWash) {
      dest = await resolveWashDest();
    } else if (isReturn) {
      const spot = parseSpotCoords(request, 'pickup_coords');
      dest = spot ? { ...spot, label: "Vehicle's spot" } : await resolveAddressDest(request);
    } else if (isHandoff) {
      const spot = parseSpotCoords(request, 'handoff_coords');
      dest = spot ? { ...spot, label: 'Meeting spot' } : await resolveAddressDest(request);
    } else {
      dest = await resolveAddressDest(request);
    }
    if (!dest) {
      etaEl.textContent = isStation ? 'Could not find a gas station nearby.' : 'Could not locate the destination.';
      return;
    }

    // Remember the resolved service destination so the customer's "heading to the
    // station / car wash" ETA has a target (covers "closest station" jobs and the
    // geocoded car wash).
    if (isStation && typeof window.ShiftFuelSaveDest === 'function') {
      window.ShiftFuelSaveDest(request.id, 'fuel_dest_coords', dest);
    } else if (isWash && typeof window.ShiftFuelSaveDest === 'function') {
      window.ShiftFuelSaveDest(request.id, 'wash_dest_coords', dest);
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const mapEl = modal.querySelector('.wrm-map');
    // Light by day, dark at night (matches the basemap preset below) so the brief
    // pre-tiles flash doesn't fight the map.
    const preset = lightPresetForNow();
    mapEl.style.background = (preset === 'day' || preset === 'dawn') ? '#e6eae6' : '#11131a';
    if (map) { map.remove(); map = null; }
    map = new mapboxgl.Map({
      container: mapEl,
      // Mapbox Standard renders real 3D buildings at a tilt; the time-of-day light
      // preset (set on load) gives the day/night look. This is the closest a web
      // map gets to the native Navigation SDK view.
      style: 'mapbox://styles/mapbox/standard',
      center: [dest.lon, dest.lat],
      zoom: 13,
      pitch: 0,
    });
    // No default zoom/compass control — the floating recenter button handles it.
    // Pause auto-follow when the worker pans the map; show a Re-center button.
    map.on('dragstart', () => { if (nav) { nav.follow = false; toggleRecenter(true); } });

    map.on('load', async () => {
      map.resize();
      // Day/night basemap by the local clock + real 3D buildings (both built into
      // Standard); POI labels off for a clean driving view.
      try { map.setConfigProperty('basemap', 'lightPreset', preset); } catch (_) {}
      try { map.setConfigProperty('basemap', 'showPointOfInterestLabels', false); } catch (_) {}
      destMarker = new mapboxgl.Marker({ color: '#b42318' }).setLngLat([dest.lon, dest.lat])
        .setPopup(new mapboxgl.Popup().setText(dest.label || (isStation ? 'Gas station' : 'Service address'))).addTo(map);

      if (!workerLoc) {
        etaEl.textContent = 'Turn on location to navigate.';
        map.flyTo({ center: [dest.lon, dest.lat], zoom: 13 });
        return;
      }

      workerMarker = new mapboxgl.Marker({ element: makePuckElement() }).setLngLat([workerLoc.lon, workerLoc.lat]).addTo(map);
      const route = await fetchDirections(workerLoc, dest);
      if (!route) {
        etaEl.textContent = 'On the way — directions unavailable right now.';
        map.flyTo({ center: [workerLoc.lon, workerLoc.lat], zoom: NAV_ZOOM });
        return;
      }

      setRouteOnMap(route);
      setEta(route);
      adoptRoute(route, dest);
      nav.requestId = request.id;
      nav.destType = destType;
      // Auto-action only on the leg where the worker hasn't done the step yet:
      // station drive at vehicle_picked_up → start service; return drive at
      // receipts_recorded → vehicle returned. Reopening later won't auto-fire.
      nav.autoArrive = ((isStation || isWash) && request.status === 'vehicle_picked_up')
        || (isReturn && request.status === 'receipts_recorded');
      nav.arrived = false;
      // The leg button + ✕-hidden are already set on open; nav.autoArrive (above)
      // only governs the GPS auto-advance for the wash/return legs.
      updateBanner(workerLoc);
      const speedWidget = modal.querySelector('.wrm-speed');
      if (speedWidget) speedWidget.hidden = false;

      // Enter the follow-camera facing the start of the route.
      const ahead = nav.routeCoords[1] || nav.routeCoords[0];
      nav.lastLoc = workerLoc;
      nav.lastBearing = ahead ? bearing(workerLoc, ahead) : 0;
      applyNavCamera(workerLoc, nav.lastBearing);

      startNavWatch(); // live position + heading follow + banner advance + off-route reroute
    });
  }

  function ensureStyles() {
    if (document.getElementById('worker-route-map-style')) return;
    const style = document.createElement('style');
    style.id = 'worker-route-map-style';
    style.textContent = `
      .wrm-overlay { position: fixed; inset: 0; z-index: 1000; background: #11131a; display: flex; }
      .wrm-overlay[hidden] { display: none; }
      .wrm-dialog { width: 100%; height: 100%; position: relative; overflow: hidden; background: #11131a; }
      /* Full-bleed: the map fills the screen; everything else floats over it. */
      .wrm-map-wrap { position: absolute; inset: 0; }
      .wrm-map { width: 100%; height: 100%; background: #11131a; }
      .wrm-puck { width: 36px; height: 36px; }
      /* Floating maneuver banner (top). */
      .wrm-banner { position: absolute; top: calc(env(safe-area-inset-top) + 12px); left: 12px; right: 12px; z-index: 4;
        display: flex; align-items: center; gap: 16px; padding: 18px 20px;
        background: #2f6bef; color: #fff; border-radius: 18px; box-shadow: 0 10px 30px rgba(0,0,0,.42); }
      .wrm-banner[hidden] { display: none; }
      .wrm-banner-icon { flex: 0 0 auto; width: 42px; height: 42px;
        display: inline-flex; align-items: center; justify-content: center; transition: transform .2s ease; }
      .wrm-banner-text { display: flex; flex-direction: column; line-height: 1.12; min-width: 0; }
      .wrm-banner-distance { font-weight: 800; font-size: 2rem; }
      .wrm-banner-instruction { font-weight: 600; font-size: 1.05rem; color: rgba(255,255,255,.92);
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      /* Speed widget: posted-limit sign + current-speed pill, top-left under banner. */
      .wrm-speed { position: absolute; left: 14px; top: calc(env(safe-area-inset-top) + 108px); z-index: 3;
        display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
      .wrm-speed[hidden] { display: none; }
      .wrm-speed-limit { background: #fff; border: 3px solid #15151a; border-radius: 12px;
        padding: 4px 12px 6px; text-align: center; line-height: 1; box-shadow: 0 4px 14px rgba(0,0,0,.32); }
      .wrm-speed-limit[hidden] { display: none; }
      .wrm-speed-limit b { display: block; font-size: 1.5rem; font-weight: 900; color: #111; }
      .wrm-speed-limit span { font-size: .6rem; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; color: #444; }
      .wrm-speed-now { background: rgba(18,18,22,.9); color: #fff; border-radius: 12px;
        padding: 5px 14px 6px; text-align: center; line-height: 1; box-shadow: 0 4px 14px rgba(0,0,0,.32); }
      .wrm-speed-now b { display: block; font-size: 1.4rem; font-weight: 900; }
      .wrm-speed-now span { font-size: .58rem; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: rgba(255,255,255,.7); }
      /* Close (info-only legs) — round button, top-right under banner. */
      .wrm-close { position: absolute; right: 14px; top: calc(env(safe-area-inset-top) + 108px); z-index: 4;
        width: 46px; height: 46px; border-radius: 50%; border: none; cursor: pointer;
        background: rgba(20,20,26,.85); color: #fff; display: inline-flex; align-items: center; justify-content: center;
        box-shadow: 0 4px 14px rgba(0,0,0,.35); }
      .wrm-close[hidden] { display: none; }
      /* Recenter — round-ish floating button on the right, above the bottom bar. */
      .wrm-recenter { position: absolute; right: 14px; bottom: calc(env(safe-area-inset-bottom) + 116px); z-index: 4;
        display: inline-flex; align-items: center; gap: 6px; padding: 11px 16px; border-radius: 999px; border: none;
        background: #fff; color: #0d3b3b; font-weight: 800; font-size: .85rem;
        box-shadow: 0 4px 14px rgba(0,0,0,.3); cursor: pointer; }
      .wrm-recenter[hidden] { display: none; }
      /* Bottom floating area: ETA pill + the always-present Start button. */
      .wrm-bottom { position: absolute; left: 12px; right: 12px; bottom: calc(env(safe-area-inset-bottom) + 14px); z-index: 4;
        display: flex; flex-direction: column; align-items: stretch; gap: 10px; }
      .wrm-eta { align-self: flex-start; background: rgba(20,20,26,.85); color: #fff; font-weight: 700;
        font-size: .85rem; padding: 7px 14px; border-radius: 999px; box-shadow: 0 4px 14px rgba(0,0,0,.3); }
      .wrm-start-service { width: 100%; padding: 17px; border: none; border-radius: 16px;
        background: #1f7a45; color: #fff; font-weight: 800; font-size: 1.08rem;
        box-shadow: 0 10px 28px rgba(0,0,0,.42); cursor: pointer; }
      .wrm-start-service:active { transform: scale(.99); }
      .wrm-start-service[hidden] { display: none; }
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

  // iOS drops the wake lock when the app backgrounds — re-acquire it when the worker
  // returns while the nav map is still open.
  document.addEventListener('visibilitychange', () => {
    const modal = document.getElementById('worker-route-modal');
    if (document.visibilityState === 'visible' && modal && !modal.hidden) acquireNavWakeLock();
  });

  // Let the worker portal open navigation programmatically (e.g. straight after the
  // pickup photos upload, to send the worker to the gas station).
  window.ShiftFuelRouteMap = { open: openRouteMap };
})();
