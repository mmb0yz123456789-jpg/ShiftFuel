// Embedded route map for worker jobs. The "Start — open map" button opens an
// in-app Mapbox map showing the worker's current location, the service-address
// destination, the driving route between them, and the ETA — without leaving the
// installed PWA. An "Open in Maps" button hands off to Apple/Google Maps for real
// turn-by-turn navigation when the worker is ready to drive.
(() => {
  if (!document.body?.classList.contains('worker-portal-page')) return;

  const MAPBOX_TOKEN = 'pk.eyJ1IjoibW1iMHl6MTIiLCJhIjoiY21xcXZiaGU4MGxubjJvcHpidnhidG55cyJ9.Ciss2gT76eC3Zt92_qhtGA';
  const METERS_PER_MILE = 1609.34;

  let assetsPromise = null;
  let map = null;
  let destMarker = null;
  let workerMarker = null;

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
            <strong class="wrm-title">Directions to vehicle</strong>
            <span class="wrm-eta"></span>
          </div>
          <button class="wrm-close" type="button" aria-label="Close">&times;</button>
        </div>
        <div class="wrm-map"></div>
        <div class="wrm-actions">
          <a class="button primary wrm-open-native" target="_blank" rel="noopener noreferrer">Open in Maps (turn-by-turn)</a>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('.wrm-close').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    return modal;
  }

  function closeModal() {
    const modal = document.getElementById('worker-route-modal');
    if (modal) modal.hidden = true;
  }

  async function resolveDestination(request) {
    const lat = Number(request.address_lat);
    const lon = Number(request.address_lon);
    if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)) return { lat, lon };
    // Fallback: geocode the address for requests booked before coords were stored.
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
      if (data.ok && Number.isFinite(Number(data.lat))) return { lat: Number(data.lat), lon: Number(data.lon) };
    } catch (_) {}
    return null;
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

  async function drawRoute(origin, dest, etaEl) {
    const coords = `${origin.lon},${origin.lat};${dest.lon},${dest.lat}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${coords}?access_token=${MAPBOX_TOKEN}&geometries=geojson&overview=full`;
    let route = null;
    try {
      const r = await fetch(url);
      if (r.ok) { const data = await r.json(); route = data.routes && data.routes[0]; }
    } catch (_) {}

    if (route) {
      const minutes = Math.max(1, Math.round(route.duration / 60));
      const miles = (route.distance / METERS_PER_MILE).toFixed(1);
      if (etaEl) etaEl.textContent = `~${minutes} min · ${miles} mi away`;
      const geojson = { type: 'Feature', geometry: route.geometry };
      if (map.getSource('wrm-route')) {
        map.getSource('wrm-route').setData(geojson);
      } else {
        map.addSource('wrm-route', { type: 'geojson', data: geojson });
        map.addLayer({
          id: 'wrm-route', type: 'line', source: 'wrm-route',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#1f7a45', 'line-width': 5, 'line-opacity': 0.85 },
        });
      }
      const b = new mapboxgl.LngLatBounds();
      route.geometry.coordinates.forEach((c) => b.extend(c));
      map.fitBounds(b, { padding: 60, duration: 500 });
    } else {
      // No route (e.g. couldn't get worker location) — at least frame the destination.
      if (etaEl) etaEl.textContent = '';
      map.flyTo({ center: [dest.lon, dest.lat], zoom: 13 });
    }
  }

  async function openRouteMap(request) {
    const modal = ensureModal();
    const titleEl = modal.querySelector('.wrm-title');
    const etaEl = modal.querySelector('.wrm-eta');
    const nativeBtn = modal.querySelector('.wrm-open-native');
    titleEl.textContent = 'Directions to vehicle';
    etaEl.textContent = 'Loading map…';
    modal.hidden = false;

    try {
      await loadAssets();
    } catch (e) {
      etaEl.textContent = 'Could not load the map.';
      return;
    }

    const dest = await resolveDestination(request);
    if (!dest) {
      etaEl.textContent = 'Could not locate the service address.';
      nativeBtn.href = navUrl(null, addressText(request));
      return;
    }
    nativeBtn.href = navUrl(dest, addressText(request));

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
        .setPopup(new mapboxgl.Popup().setText('Vehicle / service address')).addTo(map);
      etaEl.textContent = 'Finding your location…';
      const worker = await getWorkerLocation();
      if (worker) {
        workerMarker = new mapboxgl.Marker({ color: '#1f7a45' }).setLngLat([worker.lon, worker.lat]).addTo(map);
        await drawRoute(worker, dest, etaEl);
      } else {
        etaEl.textContent = 'Turn on location to see your ETA.';
        map.flyTo({ center: [dest.lon, dest.lat], zoom: 13 });
      }
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
    if (request) openRouteMap(request);
  });
})();
