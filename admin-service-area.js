// Admin Settings → Service Area map editor.
// Reads/writes the DB-backed booking boundary (service_area_settings) via the
// public_get_service_area / admin_update_service_area RPCs, and generates
// drive-time/distance polygons through the /api/address isochrone proxy.
// Mapbox GL + Draw are loaded lazily the first time the editor is opened.

(function () {
  const SA_TOKEN = 'pk.eyJ1IjoibW1iMHl6MTIiLCJhIjoiY21xcXZiaGU4MGxubjJvcHpidnhidG55cyJ9.Ciss2gT76eC3Zt92_qhtGA';
  const DEFAULT_ANCHOR = { lat: 39.6789, lon: -75.6653 };

  const supa = () => window.ShiftFuelSupabase;
  const token = () => sessionStorage.getItem('shiftfuel_admin_token');
  const $ = (id) => document.getElementById(id);

  let map = null;
  let draw = null;
  let marker = null;
  let assetsPromise = null;
  let anchor = { ...DEFAULT_ANCHOR };

  // ── lazy asset loading ────────────────────────────────────────────────────
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }
  function loadCss(href) {
    if (document.querySelector(`link[href="${href}"]`)) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href;
    document.head.appendChild(l);
  }
  function loadAssets() {
    if (assetsPromise) return assetsPromise;
    assetsPromise = (async () => {
      loadCss('https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.css');
      loadCss('https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-draw/v1.4.3/mapbox-gl-draw.css');
      await loadScript('https://api.mapbox.com/mapbox-gl-js/v3.6.0/mapbox-gl.js');
      await loadScript('https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-draw/v1.4.3/mapbox-gl-draw.js');
    })();
    return assetsPromise;
  }

  // ── small helpers ─────────────────────────────────────────────────────────
  function status(msg, kind) { const el = $('sa-status'); if (el) { el.textContent = msg; el.className = 'sa-status' + (kind ? ' ' + kind : ''); } }
  function isMiles() { return $('sa-mode').value !== 'minutes'; }
  function syncValueLabel() { $('sa-value-label').textContent = isMiles() ? 'Miles' : 'Minutes'; }
  function readoutAnchor() { $('sa-anchor').textContent = `${anchor.lat.toFixed(5)}, ${anchor.lon.toFixed(5)}`; }

  function currentPolygonGeometry() {
    if (!draw) return null;
    const f = draw.getAll().features.find((x) => x.geometry && (x.geometry.type === 'Polygon' || x.geometry.type === 'MultiPolygon'));
    return f ? f.geometry : null;
  }
  function fitToGeometry(geometry) {
    const bounds = new mapboxgl.LngLatBounds();
    const rings = geometry.type === 'MultiPolygon' ? geometry.coordinates.flat() : geometry.coordinates;
    rings.forEach((ring) => ring.forEach((c) => bounds.extend(c)));
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 40, duration: 500 });
  }
  function loadGeometry(geometry) {
    draw.deleteAll();
    if (!geometry) return;
    draw.add({ type: 'Feature', properties: {}, geometry });
    fitToGeometry(geometry);
  }

  async function callApi(payload) {
    const res = await fetch('/api/address', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    return res.json();
  }

  // ── apply loaded state to the UI ──────────────────────────────────────────
  function applyState({ geometry, anchorLat, anchorLon, mode, value, profile, generalize }) {
    if (Number.isFinite(anchorLat) && Number.isFinite(anchorLon)) {
      anchor = { lat: anchorLat, lon: anchorLon };
      if (marker) marker.setLngLat([anchor.lon, anchor.lat]);
      readoutAnchor();
    }
    if (mode === 'minutes') { $('sa-mode').value = 'minutes'; } else { $('sa-mode').value = 'meters'; }
    if (Number.isFinite(value)) $('sa-value').value = value;
    if (profile) $('sa-profile').value = profile;
    if (Number.isFinite(generalize)) $('sa-generalize').value = generalize;
    syncValueLabel();
    if (geometry) loadGeometry(geometry);
  }

  // ── load current service area (DB first, file fallback) ───────────────────
  async function loadCurrent() {
    status('Loading current service area…');
    try {
      const { data, error } = await supa().rpc('public_get_service_area');
      if (!error && data && data.geometry) {
        applyState({
          geometry: data.geometry,
          anchorLat: Number(data.anchor_lat), anchorLon: Number(data.anchor_lon),
          mode: data.mode, value: Number(data.contour_value),
          profile: data.profile, generalize: Number(data.generalize),
        });
        status('Loaded the saved service area.', 'ok');
        return;
      }
    } catch (e) { /* fall through to file */ }

    try {
      const j = await callApi({ action: 'get_service_area' });
      const sa = j.serviceArea;
      if (sa && sa.geometry) {
        applyState({
          geometry: sa.geometry,
          anchorLat: Number(sa.anchor?.lat), anchorLon: Number(sa.anchor?.lon),
          mode: sa.mode, value: Number(sa.contour_miles ?? sa.contour_minutes),
          profile: sa.profile, generalize: 500,
        });
        status('No saved area yet — showing the bundled default. Save to make it editable.', 'ok');
        return;
      }
    } catch (e) { /* ignore */ }
    status('No service area set yet. Generate one to begin.', 'ok');
  }

  // ── generate / save ───────────────────────────────────────────────────────
  async function generate() {
    status('Generating area from Mapbox…');
    $('sa-generate').disabled = true;
    try {
      const data = await callApi({
        action: 'isochrone',
        lat: anchor.lat, lon: anchor.lon,
        profile: $('sa-profile').value,
        mode: $('sa-mode').value,
        value: Number($('sa-value').value),
        generalize: Number($('sa-generalize').value),
      });
      if (!data.ok || !data.geometry) { status(data.message || 'Could not generate area.', 'err'); return; }
      loadGeometry(data.geometry);
      status('Area generated. Drag vertices to fine-tune, then Save.', 'ok');
    } catch (e) {
      status('Generate failed: ' + e.message, 'err');
    } finally {
      $('sa-generate').disabled = false;
    }
  }

  async function save() {
    const geometry = currentPolygonGeometry();
    if (!geometry) { status('No polygon to save — generate or draw one first.', 'err'); return; }
    const tok = token();
    if (!tok) { status('Your admin session expired — reload and sign in again.', 'err'); return; }
    status('Saving service area…');
    $('sa-save').disabled = true;
    try {
      const { error } = await supa().rpc('admin_update_service_area', {
        p_token: tok,
        p_geometry: geometry,
        p_anchor_lat: anchor.lat,
        p_anchor_lon: anchor.lon,
        p_mode: $('sa-mode').value,
        p_contour_value: Number($('sa-value').value),
        p_profile: $('sa-profile').value,
        p_generalize: Number($('sa-generalize').value),
      });
      if (error) { status('Save failed: ' + error.message, 'err'); return; }
      status('Saved — this is now the live booking boundary.', 'ok');
      updateSummary();
    } catch (e) {
      status('Save failed: ' + e.message, 'err');
    } finally {
      $('sa-save').disabled = false;
    }
  }

  // ── map init (once) ───────────────────────────────────────────────────────
  function initMap() {
    mapboxgl.accessToken = SA_TOKEN;
    map = new mapboxgl.Map({
      container: 'sa-map',
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [anchor.lon, anchor.lat],
      zoom: 9,
    });
    map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');
    map.on('error', (e) => {
      const m = String((e && e.error && (e.error.status || e.error.message)) || '');
      if (/401|403|unauthor|forbidden/i.test(m)) $('sa-token-banner').style.display = 'block';
    });

    draw = new MapboxDraw({ displayControlsDefault: false, controls: { polygon: true, trash: true } });
    map.addControl(draw, 'top-right');

    marker = new mapboxgl.Marker({ draggable: true, color: '#1F7A45' })
      .setLngLat([anchor.lon, anchor.lat]).addTo(map);
    marker.on('dragend', () => {
      const ll = marker.getLngLat();
      anchor = { lat: ll.lat, lon: ll.lng };
      readoutAnchor();
    });
    readoutAnchor();

    $('sa-mode').addEventListener('change', syncValueLabel);
    $('sa-generate').addEventListener('click', generate);
    $('sa-save').addEventListener('click', save);

    map.on('load', loadCurrent);
  }

  // ── inline init (called when Settings tab becomes visible) ───────────────
  let inited = false;
  async function openEditor() {
    if (inited) { if (map) { map.resize(); loadCurrent(); } return; }
    inited = true;
    status('Loading map…');
    try {
      await loadAssets();
    } catch (e) {
      status('Could not load the map library: ' + e.message, 'err');
      inited = false;
      return;
    }
    initMap();
    setTimeout(() => map && map.resize(), 80);
  }

  // Expose so switchPageTab can trigger it directly.
  window._saOpenEditor = openEditor;

  $('open-service-area-editor')?.addEventListener('click', openEditor);

  // ── settings card summary (no Mapbox needed) ──────────────────────────────
  async function updateSummary() {
    const el = $('service-area-summary');
    if (!el) return;
    try {
      const { data, error } = await supa().rpc('public_get_service_area');
      if (!error && data && data.geometry) {
        const unit = data.mode === 'minutes' ? `${data.contour_value}-min drive` : `${data.contour_value}-mile drive`;
        el.textContent = `Active: ${unit} (${data.profile}). Last updated ${String(data.last_updated_at || '').slice(0, 10)}.`;
        return;
      }
    } catch (e) { /* ignore */ }
    el.textContent = 'Using the bundled default area. Open the editor to customize.';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateSummary);
  } else {
    updateSummary();
  }
})();
