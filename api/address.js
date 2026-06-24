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

const { setCorsHeaders } = require('./_auth');

const SERVICE_ANCHOR_LAT = 39.6789; // 132 Christiana Mall, Newark DE 19702
const SERVICE_ANCHOR_LON = -75.6653;
const SERVICE_MAX_MILES = 20;

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

function haversineMiles(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Drive-distance service-area polygon, precomputed from the Mapbox Isochrone API
// (driving profile, 20-mile contour). Checking a point against this polygon is
// far more accurate than a straight-line radius near water/state lines — e.g. a
// crow-flies 20-mile circle reaches into NJ across the Delaware, but no one can
// actually drive there in 20 miles, so the polygon correctly excludes it.
// Regenerate with: node api/generate-service-area.js  (see that file).
let SERVICE_AREA = null;
try {
  SERVICE_AREA = require('./service-area.json');
} catch (e) {
  console.warn('[address] service-area.json missing — falling back to radius check.');
}

// Ray-casting point-in-ring test. ring = array of [lon, lat] pairs.
function pointInRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersects = (yi > lat) !== (yj > lat) &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// polygon = array of rings: [0] is the outer ring, any others are holes.
function pointInPolygon(lon, lat, polygon) {
  if (!polygon.length || !pointInRing(lon, lat, polygon[0])) return false;
  for (let i = 1; i < polygon.length; i++) {
    if (pointInRing(lon, lat, polygon[i])) return false; // inside a hole = outside
  }
  return true;
}

// Returns true/false if the polygon is available, or null if it isn't (so the
// caller can fall back to the straight-line radius check).
function pointInServiceArea(lat, lon) {
  const geom = SERVICE_AREA?.geometry;
  if (!geom) return null;
  if (geom.type === 'Polygon') return pointInPolygon(lon, lat, geom.coordinates);
  if (geom.type === 'MultiPolygon') return geom.coordinates.some((poly) => pointInPolygon(lon, lat, poly));
  return null;
}

// Single source of truth for "do we serve this point?": prefers the drive-time
// polygon, falls back to the straight-line radius if the polygon isn't loaded.
function checkServiceArea(lat, lon) {
  const distanceMiles = Math.round(haversineMiles(SERVICE_ANCHOR_LAT, SERVICE_ANCHOR_LON, lat, lon) * 10) / 10;
  const inPolygon = pointInServiceArea(lat, lon);
  if (inPolygon === null) {
    return { inArea: distanceMiles <= SERVICE_MAX_MILES, distanceMiles, method: 'radius' };
  }
  return { inArea: inPolygon, distanceMiles, method: 'drive' };
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
function respondForCoords(res, lat, lon, canonicalAddress) {
  const { inArea, distanceMiles } = checkServiceArea(lat, lon);
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
    return respondForCoords(res, lat, lon, canonicalAddress);
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

    const { inArea, distanceMiles } = checkServiceArea(Number(result.lat), Number(result.lon));

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

const HANDLERS = {
  validate_service_area: handleValidateServiceArea,
  address_suggest: handleAddressSuggest,
  address_retrieve: handleAddressRetrieve,
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

  try {
    return await handler(body, res);
  } catch (err) {
    console.error(`[address/${action}] Unhandled error:`, err.message);
    return res.status(200).json({ valid: false, message: 'We could not verify this address. Please check your address and try again.' });
  }
};
