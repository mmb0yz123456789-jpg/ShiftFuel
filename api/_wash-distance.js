/**
 * /api/_wash-distance.js
 *
 * Server-authoritative car-wash distance charge. The wash facility is fixed
 * ("The Car Spa", 602 Main St, Wilmington, DE 19804), so the extra distance a
 * wash adds to a job is fully determined by the customer's address and (for a
 * fuel+wash job) the chosen gas station.
 *
 * Single source of truth: BOTH the customer-facing quote (api/address
 * "wash_distance_quote") and the authoritative booking re-price
 * (api/payments.js) call computeWashDistanceCharge — so the number the customer
 * is shown is exactly the number they're charged, and the price-match holds.
 *
 * Model (matches the in-app pricing simulator):
 *   washExtra (round-trip detour the wash adds):
 *     wash-only      = 2 × (service → wash)
 *     fuel + wash    = (service → wash) + (wash → gas) − (service → gas)
 *   customer charge  = max(0, washExtra − free miles) × surcharge rate
 * Distances use the same haversine × 1.3 road factor as the booking flow.
 */

const { getSupabaseAdmin } = require('./_auth');

const WASH_ADDRESS = '602 Main St, Wilmington, DE 19804';
const EARTH_RADIUS_MI = 3958.8;
const ROAD_FACTOR = 1.3;
const DEFAULT_FREE_MILES = 5;
const DEFAULT_RATE = 0.75;

const MAPBOX_TOKEN =
  process.env.MAPBOX_TOKEN ||
  process.env.MAPBOX_ACCESS_TOKEN ||
  process.env.SHIFTFUEL_MAPBOX_TOKEN ||
  '';
const MAPBOX_REFERER = process.env.MAPBOX_REFERER || 'https://shift-fuel.vercel.app/';
const MAPBOX_FETCH_HEADERS = { Referer: MAPBOX_REFERER };

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function haversineMiles(a, b) {
  if (!a || !b) return 0;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MI * Math.asin(Math.sqrt(x));
}

function validCoord(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && !(lat === 0 && lon === 0);
}

// Geocode the fixed wash address once. Deterministic for a fixed string, so the
// quote call and the booking re-price resolve to the same coordinates.
let washCoordsCache = null;
async function getWashCoords() {
  if (washCoordsCache) return washCoordsCache;
  try {
    const params = new URLSearchParams({
      q: WASH_ADDRESS, access_token: MAPBOX_TOKEN, country: 'us', types: 'address', limit: '1',
    });
    const r = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`, { headers: MAPBOX_FETCH_HEADERS });
    if (!r.ok) return null;
    const data = await r.json();
    const f = data.features && data.features[0];
    if (!f) return null;
    const props = f.properties || {};
    const coords = f.geometry && f.geometry.coordinates ? f.geometry.coordinates : [];
    const lon = props.coordinates && props.coordinates.longitude != null ? props.coordinates.longitude : coords[0];
    const lat = props.coordinates && props.coordinates.latitude != null ? props.coordinates.latitude : coords[1];
    if (validCoord(Number(lat), Number(lon))) {
      washCoordsCache = { lat: Number(lat), lon: Number(lon) };
      return washCoordsCache;
    }
  } catch (_) { /* fall through */ }
  return null;
}

// Admin-editable rate + free miles (mirrors getPerMileRate in _gas-stations).
let settingsCache = { at: 0, freeMiles: DEFAULT_FREE_MILES, rate: DEFAULT_RATE };
const SETTINGS_TTL_MS = 60 * 1000;
async function getWashSettings() {
  const now = Date.now();
  if (now - settingsCache.at < SETTINGS_TTL_MS) return settingsCache;
  let freeMiles = DEFAULT_FREE_MILES;
  let rate = DEFAULT_RATE;
  try {
    const db = getSupabaseAdmin();
    const { data } = await db.rpc('public_get_service_pricing');
    if (data) {
      const f = Number(data.wash_detour_free_miles);
      if (Number.isFinite(f) && f >= 0) freeMiles = f;
      const r = Number(data.per_mile_rate);
      if (Number.isFinite(r) && r >= 0) rate = r;
    }
  } catch (_) { /* fall back to defaults */ }
  settingsCache = { at: now, freeMiles, rate };
  return settingsCache;
}

/**
 * @returns {Promise<{surcharge:number, extra_miles:number, reason:string}>}
 *   surcharge — dollars added to the customer's bill for the wash detour.
 */
async function computeWashDistanceCharge({ serviceLat, serviceLon, gasLat, gasLon, needsFuel }) {
  const svc = { lat: Number(serviceLat), lon: Number(serviceLon) };
  if (!validCoord(svc.lat, svc.lon)) return { surcharge: 0, extra_miles: 0, reason: 'no_service_coords' };

  const wash = await getWashCoords();
  if (!wash) return { surcharge: 0, extra_miles: 0, reason: 'no_wash_coords' };

  const sToW = haversineMiles(svc, wash) * ROAD_FACTOR;
  const gas = { lat: Number(gasLat), lon: Number(gasLon) };
  const hasGas = !!needsFuel && validCoord(gas.lat, gas.lon);

  let extra;
  if (hasGas) {
    // Insertion cost: how much longer the round trip is because of the wash.
    const wToG = haversineMiles(wash, gas) * ROAD_FACTOR;
    const sToG = haversineMiles(svc, gas) * ROAD_FACTOR;
    extra = Math.max(0, sToW + wToG - sToG);
  } else {
    extra = sToW * 2; // round trip to the wash and back
  }

  const { freeMiles, rate } = await getWashSettings();
  const billable = Math.max(0, extra - freeMiles);
  return {
    surcharge: roundMoney(billable * rate),
    extra_miles: Math.round(extra * 10) / 10,
    reason: 'ok',
  };
}

module.exports = { computeWashDistanceCharge };
