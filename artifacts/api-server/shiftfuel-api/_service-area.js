/**
 * /api/_service-area.js
 *
 * Single source of truth for "do we serve this point?". Resolves the booking
 * boundary in priority order:
 *   1. Database polygon  (service_area_settings, edited from the admin portal)
 *   2. Bundled file       (api/service-area.json, the checked-in default)
 *   3. Straight-line radius (last-resort fallback if neither is available)
 *
 * Used by both the client-facing validator (api/address.js) and the server-side
 * booking guard (api/payments.js) so the two can never disagree about coverage.
 */

const { getSupabaseAdmin } = require('./_auth');

const SERVICE_ANCHOR_LAT = 39.6789; // 132 Christiana Mall, Newark DE 19702
const SERVICE_ANCHOR_LON = -75.6653;
const SERVICE_MAX_MILES = 20;

// Bundled fallback polygon. Present in the repo; may be absent in some deploys.
let FILE_AREA = null;
try {
  FILE_AREA = require('./service-area.json');
} catch (e) {
  console.warn('[service-area] service-area.json missing — DB or radius only.');
}

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

// Returns true/false if the geometry covers the point, or null if there's no
// usable polygon (so the caller can fall back to the radius check).
function pointInGeometry(geometry, lat, lon) {
  if (!geometry) return null;
  if (geometry.type === 'Polygon') return pointInPolygon(lon, lat, geometry.coordinates);
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.some((poly) => pointInPolygon(lon, lat, poly));
  return null;
}

// Cache the resolved polygon so we don't hit the DB on every check. 60s TTL
// keeps admin edits propagating within about a minute. `geometry === undefined`
// is the "not loaded yet" sentinel (null is a valid "no polygon" result).
const TTL_MS = 60 * 1000;
let cache = { at: 0, geometry: undefined, anchor: null };

async function resolveArea() {
  const now = Date.now();
  if (cache.geometry !== undefined && now - cache.at < TTL_MS) return cache;

  let geometry;
  let anchor = null;
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db.rpc('public_get_service_area');
    if (!error && data && data.geometry) {
      geometry = data.geometry;
      if (data.anchor_lat != null && data.anchor_lon != null) {
        anchor = { lat: Number(data.anchor_lat), lon: Number(data.anchor_lon) };
      }
    }
  } catch (e) {
    // DB unavailable / migration not applied — fall through to the file.
  }

  if (geometry === undefined) geometry = FILE_AREA?.geometry || null;
  cache = { at: now, geometry, anchor };
  return cache;
}

// Core check against a known lat/lon. Prefers the polygon, falls back to radius.
async function checkServiceArea(lat, lon) {
  const { geometry, anchor } = await resolveArea();
  const aLat = anchor?.lat ?? SERVICE_ANCHOR_LAT;
  const aLon = anchor?.lon ?? SERVICE_ANCHOR_LON;
  const distanceMiles = Math.round(haversineMiles(aLat, aLon, lat, lon) * 10) / 10;
  const inPoly = pointInGeometry(geometry, lat, lon);
  if (inPoly === null) {
    return { inArea: distanceMiles <= SERVICE_MAX_MILES, distanceMiles, method: 'radius' };
  }
  return { inArea: inPoly, distanceMiles, method: 'drive' };
}

// Geocode an address to coords via Nominatim (used only as a server-side
// fallback when the caller didn't supply coordinates). Returns null on failure.
async function geocodeAddress({ street, city, state, zip } = {}) {
  const query = [street, city, state, zip].filter(Boolean).join(', ');
  if (!query) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
    const r = await fetch(url, {
      headers: { 'Accept-Language': 'en', 'User-Agent': 'ShiftFuelConcierge/1.0 (server)' },
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j?.length) return null;
    return { lat: Number(j[0].lat), lon: Number(j[0].lon) };
  } catch (e) {
    return null;
  }
}

// Defense-in-depth verifier for the booking endpoints. Uses caller-supplied
// coords when present, otherwise geocodes the address. Returns { checked:false }
// when coordinates can't be resolved at all — callers should fail-open in that
// case so a transient geocode outage never strands a paid-for booking.
async function verifyServiceArea({ lat, lon, street, city, state, zip } = {}) {
  let aLat = Number(lat);
  let aLon = Number(lon);
  const hasCoords = Number.isFinite(aLat) && Number.isFinite(aLon) && (aLat !== 0 || aLon !== 0);
  if (!hasCoords) {
    const geo = await geocodeAddress({ street, city, state, zip });
    if (!geo) return { checked: false };
    aLat = geo.lat;
    aLon = geo.lon;
  }
  const { inArea, distanceMiles, method } = await checkServiceArea(aLat, aLon);
  return { checked: true, inArea, distanceMiles, method, lat: aLat, lon: aLon };
}

module.exports = {
  SERVICE_ANCHOR_LAT,
  SERVICE_ANCHOR_LON,
  SERVICE_MAX_MILES,
  checkServiceArea,
  verifyServiceArea,
  geocodeAddress,
};
