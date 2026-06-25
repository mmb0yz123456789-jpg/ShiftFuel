/**
 * /api/address.js
 *
 * Vercel Serverless Function for server-side address/service-area validation.
 * Moves Nominatim geocoding off the browser to avoid CORS/rate-limit issues
 * and keep the service-area radius logic in one place.
 *
 * Actions (all POST):
 *   validate_service_area – Geocode an address and check it's within the
 *                            service radius of the anchor point. Accepts an
 *                            optional lat/lon (from a Mapbox selection) to skip
 *                            the geocode and just run the radius check.
 *   address_suggest       – Proxy Mapbox Search Box "suggest" for type-ahead
 *                            address autocomplete (session-based billing).
 *   address_retrieve      – Proxy Mapbox Search Box "retrieve" to resolve a
 *                            chosen suggestion into structured fields + coords.
 */

const fs = require('fs');
const path = require('path');
const { setCorsHeaders } = require('./_auth');
const {
  checkServiceArea,
  SERVICE_ANCHOR_LAT,
  SERVICE_ANCHOR_LON,
} = require('./_service-area');
const { computeStationOptions, computeTypedStationOptions } = require('./_gas-stations');
const { enforceRateLimit } = require('./_rate-limit');

// Per-IP rate limits for the actions that call paid third-party APIs. Tuned so
// normal interactive use is never blocked, but scripted abuse hits a wall.
// Typeahead (suggest) is the most frequent legitimately, so it gets more room.
const RATE_LIMITS = {
  address_suggest:       { limit: 80, windowSeconds: 60 },
  address_retrieve:      { limit: 40, windowSeconds: 60 },
  validate_service_area: { limit: 60, windowSeconds: 60 },
  nearby_gas_stations:   { limit: 40, windowSeconds: 60 },
  gas_station_search:    { limit: 20, windowSeconds: 60 },
  isochrone:             { limit: 20, windowSeconds: 60 },
  geocode:               { limit: 40, windowSeconds: 60 },
  route_eta:             { limit: 40, windowSeconds: 60 },
};

// Short-lived in-memory cache for station lookups, keyed by rounded coords (and
// query). Repeated identical lookups (re-renders, nearby users, retries) reuse
// the result instead of re-hitting Mapbox — cuts cost and softens abuse.
const STATION_CACHE_TTL_MS = 5 * 60 * 1000;
const stationCache = new Map(); // key -> { at, data }

function stationCacheGet(key) {
  const entry = stationCache.get(key);
  if (entry && Date.now() - entry.at < STATION_CACHE_TTL_MS) return entry.data;
  if (entry) stationCache.delete(key);
  return null;
}
function stationCacheSet(key, data) {
  if (stationCache.size > 2000) stationCache.clear();
  stationCache.set(key, { at: Date.now(), data });
}

// Public Mapbox token. Prefer an env var; fall back to the same public pk.*
// token the live-tracking map already ships in the browser. Search Box API
// works fine with a public token, so this stays a safe no-secret default.
const MAPBOX_TOKEN =
  process.env.MAPBOX_TOKEN ||
  process.env.MAPBOX_ACCESS_TOKEN ||
  process.env.SHIFTFUEL_MAPBOX_TOKEN ||
  'pk.eyJ1IjoibW1iMHl6MTIiLCJhIjoiY21xcXZiaGU4MGxubjJvcHpidnhidG55cyJ9.Ciss2gT76eC3Zt92_qhtGA';

const SEARCHBOX_BASE = 'https://api.mapbox.com/search/searchbox/v1';

// The public Mapbox token is URL-restricted to our domain (an allowlist Mapbox
// enforces via the Referer header). Server-side calls send no browser Referer,
// so we set it explicitly to our own allowed origin — this is our token, our
// server, our domain. Override with MAPBOX_REFERER if the allowlist changes.
const MAPBOX_REFERER = process.env.MAPBOX_REFERER || 'https://shift-fuel.vercel.app/';
const MAPBOX_FETCH_HEADERS = { Referer: MAPBOX_REFERER };

// Bundled fallback polygon, kept here only so the local service-area editor's
// get_service_area / save_service_area handlers can read and rewrite the file.
// The actual coverage check lives in ./_service-area (DB → this file → radius).
let SERVICE_AREA = null;
try {
  SERVICE_AREA = require('./service-area.json');
} catch (e) {
  console.warn('[address] service-area.json missing — falling back to radius check.');
}

async function nominatimSearch(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(query)}&limit=1`;
  const response = await fetch(url, {
    headers: { 'Accept-Language': 'en', 'User-Agent': 'ShiftFuelConcierge/1.0 (server)' },
  });
  if (!response.ok) return null;
  const results = await response.json();
  return results?.length ? results[0] : null;
}

// Run the service-area check against a known lat/lon and return the standard
// valid/invalid response. Shared by the geocode path and the Mapbox-coords
// fast path (which skips geocoding entirely).
async function respondForCoords(res, lat, lon, canonicalAddress) {
  const { inArea, distanceMiles } = await checkServiceArea(lat, lon);
  if (!inArea) {
    return res.status(200).json({
      valid: false,
      message: 'We currently do not serve this area.',
      distanceMiles,
    });
  }
  return res.status(200).json({
    valid: true,
    message: 'Address verified.',
    canonicalAddress: canonicalAddress || undefined,
    distanceMiles,
  });
}

async function handleValidateServiceArea(body, res) {
  const street = String(body.street || '').trim();
  const city = String(body.city || '').trim();
  const state = String(body.state || '').trim();
  const zip = String(body.zip || '').trim();
  // Apt/Suite/Unit is intentionally never included in the geocoding query —
  // Nominatim frequently can't resolve unit numbers and that caused
  // otherwise-valid addresses to fail verification.

  // Fast path: a Mapbox suggestion was selected, so we already have exact
  // coordinates. Skip the Nominatim round-trip and check the service area.
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)) {
    const canonicalAddress = [street, city, state, zip].filter(Boolean).join(', ');
    return await respondForCoords(res, lat, lon, canonicalAddress);
  }

  const query = [street, city, state, zip].filter(Boolean).join(', ');
  if (!query) {
    return res.status(400).json({ valid: false, message: 'Please enter a service address.' });
  }

  try {
    let result = await nominatimSearch(query);

    if (!result) {
      const fallback = [city, state, zip].filter(Boolean).join(', ');
      if (fallback && fallback !== query) result = await nominatimSearch(fallback);
    }

    if (!result) {
      return res.status(200).json({
        valid: false,
        message: 'We could not verify this address. Please check your address and try again.',
      });
    }

    const { inArea, distanceMiles } = await checkServiceArea(Number(result.lat), Number(result.lon));

    if (!inArea) {
      return res.status(200).json({
        valid: false,
        message: 'We currently do not serve this area.',
        distanceMiles,
      });
    }

    const a = result.address || {};
    const canonicalAddress = [
      [a.house_number, a.road].filter(Boolean).join(' '),
      a.city || a.town || a.village || a.county,
      a.state,
      a.postcode,
    ].filter(Boolean).join(', ');

    return res.status(200).json({
      valid: true,
      message: 'Address verified.',
      canonicalAddress,
      distanceMiles,
    });
  } catch (err) {
    console.error('[address/validate_service_area] Error:', err.message);
    return res.status(200).json({
      valid: false,
      message: 'We could not verify this address. Please check your address and try again.',
    });
  }
}

// ---------------------------------------------------------------------------
// Mapbox Search Box autocomplete (proxied so the browser never needs a token
// and we can swap providers in one place). Sessions: the client generates a
// UUID session_token, reuses it across suggest calls, then spends it on one
// retrieve — that's how Mapbox groups a session into a single billable unit.
// ---------------------------------------------------------------------------

async function handleAddressSuggest(body, res) {
  const q = String(body.q || body.query || '').trim();
  const sessionToken = String(body.session_token || '').trim();
  if (q.length < 3 || !sessionToken) {
    return res.status(200).json({ suggestions: [] });
  }

  const params = new URLSearchParams({
    q,
    access_token: MAPBOX_TOKEN,
    session_token: sessionToken,
    country: 'us',
    types: 'address',
    language: 'en',
    limit: '6',
    proximity: `${SERVICE_ANCHOR_LON},${SERVICE_ANCHOR_LAT}`,
  });

  try {
    const response = await fetch(`${SEARCHBOX_BASE}/suggest?${params.toString()}`, { headers: MAPBOX_FETCH_HEADERS });
    if (!response.ok) return res.status(200).json({ suggestions: [] });
    const data = await response.json();
    const suggestions = (data.suggestions || []).map((s) => ({
      mapbox_id: s.mapbox_id,
      name: s.name || s.address || '',
      place: s.place_formatted || s.full_address || '',
    }));
    return res.status(200).json({ suggestions });
  } catch (err) {
    console.error('[address/address_suggest] Error:', err.message);
    return res.status(200).json({ suggestions: [] });
  }
}

async function handleAddressRetrieve(body, res) {
  const mapboxId = String(body.mapbox_id || '').trim();
  const sessionToken = String(body.session_token || '').trim();
  if (!mapboxId || !sessionToken) {
    return res.status(400).json({ ok: false, message: 'Missing mapbox_id or session_token.' });
  }

  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    session_token: sessionToken,
  });

  try {
    const response = await fetch(`${SEARCHBOX_BASE}/retrieve/${encodeURIComponent(mapboxId)}?${params.toString()}`, { headers: MAPBOX_FETCH_HEADERS });
    if (!response.ok) return res.status(200).json({ ok: false, message: 'Could not load that address.' });
    const data = await response.json();
    const feature = data.features?.[0];
    if (!feature) return res.status(200).json({ ok: false, message: 'Could not load that address.' });

    const props = feature.properties || {};
    const ctx = props.context || {};
    const coords = feature.geometry?.coordinates || [];
    const lon = props.coordinates?.longitude ?? coords[0];
    const lat = props.coordinates?.latitude ?? coords[1];

    return res.status(200).json({
      ok: true,
      address: {
        street: props.address || ctx.address?.name || props.name || '',
        city: ctx.place?.name || '',
        state: ctx.region?.region_code || ctx.region?.name || '',
        zip: ctx.postcode?.name || '',
        lat: Number.isFinite(lat) ? Number(lat) : null,
        lon: Number.isFinite(lon) ? Number(lon) : null,
        full_address: props.full_address || props.place_formatted || '',
      },
    });
  } catch (err) {
    console.error('[address/address_retrieve] Error:', err.message);
    return res.status(200).json({ ok: false, message: 'Could not load that address.' });
  }
}

// ---------------------------------------------------------------------------
// Service-area editor support (service-area-editor.html). These power the local
// admin tool for visually building/saving the drive-time service polygon.
// ---------------------------------------------------------------------------

function isMilesMode(mode) {
  return mode !== 'minutes';
}

// Build the service-area.json shape from editor inputs (shared by save).
function buildServiceAreaDoc(body) {
  const miles = isMilesMode(body.mode);
  const value = Number(body.value);
  return {
    generated: new Date().toISOString().slice(0, 10),
    description: body.description ||
      (miles
        ? `${value || 20}-mile driving-distance service area (edited in service-area-editor.html).`
        : `${value || 30}-minute driving-time service area (edited in service-area-editor.html).`),
    profile: body.profile || 'driving',
    mode: miles ? 'meters' : 'minutes',
    contour_meters: miles ? Math.round((value || 20) * 1609.34) : null,
    contour_miles: miles ? (value || 20) : null,
    contour_minutes: miles ? null : (value || 30),
    anchor: { lat: Number(body.anchor?.lat), lon: Number(body.anchor?.lon) },
    geometry: body.geometry,
  };
}

// Proxy the Mapbox Isochrone API for the editor's "Generate" button.
async function handleIsochrone(body, res) {
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ ok: false, message: 'Missing lat/lon.' });
  }
  const profile = ['driving', 'walking', 'cycling', 'driving-traffic'].includes(body.profile) ? body.profile : 'driving';
  const generalize = Math.max(0, Number(body.generalize) || 500);
  let contourParam;
  if (isMilesMode(body.mode)) {
    const miles = Math.max(1, Math.min(60, Number(body.value) || 20));
    contourParam = `contours_meters=${Math.round(miles * 1609.34)}`;
  } else {
    const minutes = Math.max(1, Math.min(60, Number(body.value) || 30));
    contourParam = `contours_minutes=${minutes}`;
  }
  const url =
    `https://api.mapbox.com/isochrone/v1/mapbox/${profile}/${lon},${lat}` +
    `?${contourParam}&polygons=true&denoise=1&generalize=${generalize}&access_token=${MAPBOX_TOKEN}`;
  try {
    const r = await fetch(url, { headers: MAPBOX_FETCH_HEADERS });
    if (!r.ok) return res.status(200).json({ ok: false, message: `Mapbox Isochrone ${r.status}` });
    const data = await r.json();
    const geometry = data.features?.[0]?.geometry;
    if (!geometry) return res.status(200).json({ ok: false, message: 'No polygon returned.' });
    return res.status(200).json({ ok: true, geometry });
  } catch (err) {
    console.error('[address/isochrone] Error:', err.message);
    return res.status(200).json({ ok: false, message: err.message });
  }
}

// Return the currently-enforced service area so the editor can load it.
async function handleGetServiceArea(body, res) {
  return res.status(200).json({ ok: true, serviceArea: SERVICE_AREA || null });
}

// Write the edited polygon back to api/service-area.json. Local/dev only —
// production filesystems are read-only/ephemeral, so the editor falls back to a
// JSON download there.
async function handleSaveServiceArea(body, res) {
  if (process.env.VERCEL_ENV === 'production') {
    return res.status(403).json({ ok: false, message: 'Saving is disabled in production. Use Download and commit the file.' });
  }
  const geometry = body.geometry;
  if (!geometry || !geometry.type || !Array.isArray(geometry.coordinates)) {
    return res.status(400).json({ ok: false, message: 'Missing or invalid geometry.' });
  }
  const doc = buildServiceAreaDoc(body);
  try {
    const target = path.join(process.cwd(), 'api', 'service-area.json');
    fs.writeFileSync(target, JSON.stringify(doc));
    SERVICE_AREA = doc; // refresh the in-memory copy so checks use it immediately
    return res.status(200).json({ ok: true, path: target });
  } catch (err) {
    console.error('[address/save_service_area] Error:', err.message);
    return res.status(200).json({ ok: false, message: err.message });
  }
}

// Return nearby gas stations + the choose-this surcharge for each, so the
// booking flow can offer "customer choice" station selection. The closest
// station is the free default; farther ones cost $0.75/extra round-trip mile.
async function handleNearbyGasStations(body, res) {
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
    return res.status(400).json({ ok: false, message: 'Missing service address coordinates.' });
  }
  const cacheKey = `n:${lat.toFixed(3)},${lon.toFixed(3)}`;
  const cached = stationCacheGet(cacheKey);
  if (cached) return res.status(200).json(cached);
  try {
    const { stations, closest, per_mile_rate } = await computeStationOptions(lat, lon);
    const payload = { ok: true, stations, closest, per_mile_rate };
    stationCacheSet(cacheKey, payload);
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[address/nearby_gas_stations] Error:', err.message);
    return res.status(200).json({ ok: false, message: 'Could not load nearby stations.', stations: [] });
  }
}

// Free-text station search for the "don't see your station?" box. Returns the
// same option shape as nearby_gas_stations, with surcharges on the same scale.
async function handleGasStationSearch(body, res) {
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  const q = String(body.q || '').trim();
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
    return res.status(400).json({ ok: false, message: 'Missing service address coordinates.' });
  }
  if (q.length < 2) {
    return res.status(200).json({ ok: true, stations: [] });
  }
  const cacheKey = `s:${lat.toFixed(3)},${lon.toFixed(3)}:${q.toLowerCase()}`;
  const cached = stationCacheGet(cacheKey);
  if (cached) return res.status(200).json(cached);
  try {
    const { stations } = await computeTypedStationOptions(lat, lon, q);
    const payload = { ok: true, stations };
    stationCacheSet(cacheKey, payload);
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[address/gas_station_search] Error:', err.message);
    return res.status(200).json({ ok: false, message: 'Could not search stations.', stations: [] });
  }
}

// Geocode a service address to coordinates (used as a fallback by the worker
// route map for requests booked before address_lat/lon were stored).
async function handleGeocode(body, res) {
  const query = [body.street, body.city, body.state, body.zip].map((v) => String(v || '').trim()).filter(Boolean).join(', ');
  if (!query) return res.status(400).json({ ok: false, message: 'Missing address.' });
  try {
    let result = await nominatimSearch(query);
    if (!result) {
      const fallback = [body.city, body.state, body.zip].map((v) => String(v || '').trim()).filter(Boolean).join(', ');
      if (fallback && fallback !== query) result = await nominatimSearch(fallback);
    }
    if (!result) return res.status(200).json({ ok: false, message: 'Could not locate address.' });
    return res.status(200).json({ ok: true, lat: Number(result.lat), lon: Number(result.lon) });
  } catch (err) {
    console.error('[address/geocode] Error:', err.message);
    return res.status(200).json({ ok: false, message: 'Could not locate address.' });
  }
}

// Driving ETA between two points (worker → service address) for the customer's
// "how far out is my specialist" banner. Returns minutes + miles.
async function handleRouteEta(body, res) {
  const oLat = Number(body.origin_lat), oLon = Number(body.origin_lon);
  const dLat = Number(body.dest_lat), dLon = Number(body.dest_lon);
  if (![oLat, oLon, dLat, dLon].every(Number.isFinite)) {
    return res.status(400).json({ ok: false, message: 'Missing coordinates.' });
  }
  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${oLon},${oLat};${dLon},${dLat}?access_token=${MAPBOX_TOKEN}&overview=false`;
    const r = await fetch(url, { headers: MAPBOX_FETCH_HEADERS });
    if (!r.ok) return res.status(200).json({ ok: false });
    const data = await r.json();
    const route = data.routes && data.routes[0];
    if (!route) return res.status(200).json({ ok: false });
    return res.status(200).json({
      ok: true,
      minutes: Math.max(1, Math.round(route.duration / 60)),
      miles: Math.round((route.distance / 1609.34) * 10) / 10,
    });
  } catch (err) {
    console.error('[address/route_eta] Error:', err.message);
    return res.status(200).json({ ok: false });
  }
}

const HANDLERS = {
  validate_service_area: handleValidateServiceArea,
  address_suggest: handleAddressSuggest,
  address_retrieve: handleAddressRetrieve,
  nearby_gas_stations: handleNearbyGasStations,
  gas_station_search: handleGasStationSearch,
  geocode: handleGeocode,
  route_eta: handleRouteEta,
  isochrone: handleIsochrone,
  get_service_area: handleGetServiceArea,
  save_service_area: handleSaveServiceArea,
};

module.exports = async (req, res) => {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action, ...body } = req.body || {};
  if (!action) {
    return res.status(400).json({ error: 'Missing required field: action' });
  }

  const handler = HANDLERS[action];
  if (!handler) {
    return res.status(400).json({ error: `Unknown action: ${action}` });
  }

  const rl = RATE_LIMITS[action];
  if (rl && await enforceRateLimit(req, res, action, rl)) return;

  try {
    return await handler(body, res);
  } catch (err) {
    console.error(`[address/${action}] Unhandled error:`, err.message);
    return res.status(200).json({ valid: false, message: 'We could not verify this address. Please check your address and try again.' });
  }
};
