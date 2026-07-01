/**
 * /api/_gas-stations.js
 *
 * "Customer choice" gas-station selection + distance surcharge.
 *
 * The closest gas station to the customer's service address is the free
 * default. If the customer prefers a different (farther) station, we charge
 * $0.75 for every EXTRA round-trip mile beyond that closest station.
 *
 * All distances are real driving distances from the Mapbox APIs:
 *   - Category Search  → find nearby gas stations around the address
 *   - Matrix API       → driving distance (address → each station)
 *
 * The same helpers run on the client-facing list endpoint (api/address.js) and
 * the authoritative booking re-price (api/payments.js), so the surcharge the
 * customer sees is the surcharge they're charged.
 */

const { getSupabaseAdmin } = require('./_auth');

const PER_MILE_RATE = 0.75;       // default $/extra round-trip mile (admin-editable)
const STATION_SEARCH_LIMIT = 10;  // how many nearby stations to consider
const METERS_PER_MILE = 1609.34;

// The per-mile rate is admin-editable (service_pricing_settings.per_mile_rate).
// Cache it briefly so we don't hit the DB on every distance calc.
let rateCache = { at: 0, rate: undefined };
const RATE_TTL_MS = 60 * 1000;

async function getPerMileRate() {
  const now = Date.now();
  if (rateCache.rate !== undefined && now - rateCache.at < RATE_TTL_MS) return rateCache.rate;
  let rate = PER_MILE_RATE;
  try {
    const db = getSupabaseAdmin();
    const { data, error } = await db.rpc('public_get_service_pricing');
    const v = Number(data?.per_mile_rate);
    if (!error && Number.isFinite(v) && v >= 0) rate = v;
  } catch (e) {
    // DB unavailable / column missing — fall back to the default.
  }
  rateCache = { at: now, rate };
  return rate;
}

const MAPBOX_TOKEN =
  process.env.MAPBOX_TOKEN ||
  process.env.MAPBOX_ACCESS_TOKEN ||
  process.env.SHIFTFUEL_MAPBOX_TOKEN ||
  '';

// The public token is URL-restricted to our domain; server calls send no browser
// Referer, so set it explicitly (same approach as api/address.js).
const MAPBOX_REFERER = process.env.MAPBOX_REFERER || 'https://shift-fuel.vercel.app/';
const MAPBOX_FETCH_HEADERS = { Referer: MAPBOX_REFERER };

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function isFiniteCoord(v) {
  return Number.isFinite(v) && v !== 0;
}

// Recognizable fuel brands. When two listings share an address but have
// different names, we keep the more recognizable brand.
const MAJOR_BRANDS = [
  'shell', 'exxon', 'mobil', 'wawa', 'bp', 'sunoco', 'gulf', 'citgo', 'speedway',
  'valero', 'chevron', 'marathon', 'royal farms', 'sheetz', '7-eleven', '7 eleven',
  'costco', "sam's", 'sams club', 'circle k', 'qt', 'quiktrip', 'racetrac', 'phillips 66',
  'conoco', 'texaco', 'getgo', 'cumberland farms', 'pilot', "love's", 'flying j',
];

function normalizeName(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function isNameBrand(name) {
  const n = normalizeName(name);
  return MAJOR_BRANDS.some((b) => n.includes(b));
}

// Collapse an address to a comparison key so "414 Main Street, …" and
// "414 Main St, …" are treated as the same place. Hyphens are treated as spaces
// ("Ogletown-Stanton" == "Ogletown Stanton") and street-type suffixes are folded
// to one form INCLUDING the plural/abbreviated variants Mapbox sometimes returns
// ("Rds" vs "Rd"), so two brands at the same address collapse to one listing.
function normalizeAddressKey(address) {
  let s = String(address || '').toLowerCase();
  s = s.replace(/,?\s*united states$/, '').replace(/[.,\-/]/g, ' ');
  const suffixes = {
    street: 'st', streets: 'st', avenue: 'ave', avenues: 'ave', boulevard: 'blvd',
    highway: 'hwy', highways: 'hwy', road: 'rd', roads: 'rd', rds: 'rd',
    drive: 'dr', lane: 'ln', court: 'ct', place: 'pl', parkway: 'pkwy', terrace: 'ter',
  };
  s = s.replace(/\b(streets?|avenues?|boulevard|highways?|roads?|rds|drive|lane|court|place|parkway|terrace)\b/g,
    (m) => suffixes[m] || m);
  return s.replace(/\s+/g, ' ').trim();
}

// Pick the winner between two listings at the same address:
//   same name        → the closer (cheaper) one
//   different names   → the more recognizable brand, else the closer one
function preferStation(a, b) {
  if (normalizeName(a.name) === normalizeName(b.name)) {
    return a.one_way_miles <= b.one_way_miles ? a : b;
  }
  const aBrand = isNameBrand(a.name);
  const bBrand = isNameBrand(b.name);
  if (aBrand !== bBrand) return aBrand ? a : b;
  return a.one_way_miles <= b.one_way_miles ? a : b;
}

// Collapse duplicate listings. Two passes catch the two kinds of duplicate
// Mapbox returns: (1) different map entries at the same street address, and
// (2) the same-named place at near-identical coordinates but with the address
// formatted differently ("900 Center Blvd" vs "900 Center Boulevard South").
function dedupeStations(list) {
  const mergeBy = (items, keyOf) => {
    const groups = new Map();
    for (const s of items) {
      const key = keyOf(s);
      const existing = groups.get(key);
      groups.set(key, existing ? preferStation(existing, s) : s);
    }
    return [...groups.values()];
  };
  // Pass 1: same street address (handles different brands at one address too).
  const byAddress = mergeBy(list, (s) => normalizeAddressKey(s.address) || `id:${s.id}`);
  // Pass 2: same name within ~150m (coords rounded to ~3 decimal places).
  return mergeBy(byAddress, (s) => {
    const lat = Number(s.lat), lon = Number(s.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      return `${normalizeName(s.name)}@${lat.toFixed(3)},${lon.toFixed(3)}`;
    }
    return `id:${s.id}`;
  });
}

// Find nearby gas stations around a point via Mapbox Category Search.
// Returns [{ id, name, address, lat, lon }], nearest-biased by proximity.
async function findNearbyStations(lat, lon, limit = STATION_SEARCH_LIMIT) {
  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    proximity: `${lon},${lat}`,
    limit: String(limit),
    language: 'en',
    country: 'us',
  });
  const url = `https://api.mapbox.com/search/searchbox/v1/category/gas_station?${params.toString()}`;
  const r = await fetch(url, { headers: MAPBOX_FETCH_HEADERS });
  if (!r.ok) throw new Error(`Mapbox category search ${r.status}`);
  const data = await r.json();
  const feats = Array.isArray(data.features) ? data.features : [];
  return feats
    .map((f) => {
      const props = f.properties || {};
      const coords = f.geometry?.coordinates || [];
      const sLon = props.coordinates?.longitude ?? coords[0];
      const sLat = props.coordinates?.latitude ?? coords[1];
      if (!Number.isFinite(Number(sLat)) || !Number.isFinite(Number(sLon))) return null;
      return {
        id: props.mapbox_id || `${sLat},${sLon}`,
        name: props.name || 'Gas station',
        address: props.full_address || props.place_formatted || props.address || '',
        lat: Number(sLat),
        lon: Number(sLon),
      };
    })
    .filter(Boolean);
}

// One-way driving distance (miles) from an origin to each destination, via the
// Mapbox Matrix API. Returns an array aligned with `dests`; entries that Mapbox
// can't route are null.
async function drivingMilesFromOrigin(originLat, originLon, dests) {
  if (!dests.length) return [];
  // coordinate string: origin first, then every destination
  const coordPairs = [[originLon, originLat], ...dests.map((d) => [d.lon, d.lat])]
    .map((c) => `${c[0]},${c[1]}`)
    .join(';');
  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    annotations: 'distance',
    sources: '0',
    destinations: dests.map((_, i) => i + 1).join(';'),
  });
  const url = `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coordPairs}?${params.toString()}`;
  const r = await fetch(url, { headers: MAPBOX_FETCH_HEADERS });
  if (!r.ok) throw new Error(`Mapbox Matrix ${r.status}`);
  const data = await r.json();
  const row = data.distances?.[0] || [];
  return dests.map((_, i) => {
    const meters = row[i];
    return Number.isFinite(meters) ? meters / METERS_PER_MILE : null;
  });
}

// Surcharge for choosing a station `chosenMiles` (one-way) away when the closest
// station is `closestMiles` (one-way) away. Charges the extra round trip.
function surchargeFromMiles(chosenMiles, closestMiles, rate = PER_MILE_RATE) {
  const extraOneWay = Math.max(0, chosenMiles - closestMiles);
  const extraRoundTrip = roundMoney(extraOneWay * 2);
  return {
    extra_round_trip_miles: extraRoundTrip,
    surcharge: roundMoney(extraRoundTrip * rate),
  };
}

// Build the customer-facing station list: each station with its one-way driving
// miles and the surcharge to choose it (closest = $0). Sorted nearest first.
async function computeStationOptions(lat, lon) {
  const stations = await findNearbyStations(lat, lon);
  if (!stations.length) return { stations: [], closest: null };

  const miles = await drivingMilesFromOrigin(lat, lon, stations);
  const withMiles = dedupeStations(
    stations
      .map((s, i) => ({ ...s, one_way_miles: miles[i] }))
      .filter((s) => Number.isFinite(s.one_way_miles))
  ).sort((a, b) => a.one_way_miles - b.one_way_miles);

  if (!withMiles.length) return { stations: [], closest: null };
  const closestMiles = withMiles[0].one_way_miles;
  const rate = await getPerMileRate();

  const options = withMiles.map((s) => {
    const { extra_round_trip_miles, surcharge } = surchargeFromMiles(s.one_way_miles, closestMiles, rate);
    return {
      id: s.id,
      name: s.name,
      address: s.address,
      lat: s.lat,
      lon: s.lon,
      one_way_miles: roundMoney(s.one_way_miles),
      extra_round_trip_miles,
      surcharge,
      is_closest: s.id === withMiles[0].id,
    };
  });
  return { stations: options, closest: options[0], per_mile_rate: rate };
}

// Free-text search for a specific station the customer has in mind (Mapbox
// Search Box forward search, biased to the service address).
async function searchStationsByText(lat, lon, query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({
    q,
    access_token: MAPBOX_TOKEN,
    proximity: `${lon},${lat}`,
    limit: '6',
    country: 'us',
    language: 'en',
    types: 'poi',
  });
  const url = `https://api.mapbox.com/search/searchbox/v1/forward?${params.toString()}`;
  const r = await fetch(url, { headers: MAPBOX_FETCH_HEADERS });
  if (!r.ok) throw new Error(`Mapbox forward search ${r.status}`);
  const data = await r.json();
  const feats = Array.isArray(data.features) ? data.features : [];
  const mapped = feats
    .map((f) => {
      const props = f.properties || {};
      const coords = f.geometry?.coordinates || [];
      const sLon = props.coordinates?.longitude ?? coords[0];
      const sLat = props.coordinates?.latitude ?? coords[1];
      if (!Number.isFinite(Number(sLat)) || !Number.isFinite(Number(sLon))) return null;
      const categories = props.poi_category || [];
      const looksLikeStation = (Array.isArray(categories) && categories.some((c) => /gas|fuel|petrol/i.test(String(c))))
        || props.maki === 'fuel' || isNameBrand(props.name);
      return {
        id: props.mapbox_id || `${sLat},${sLon}`,
        name: props.name || 'Gas station',
        address: props.full_address || props.place_formatted || props.address || '',
        lat: Number(sLat),
        lon: Number(sLon),
        looksLikeStation,
      };
    })
    .filter(Boolean);
  // Prefer entries that look like fuel stations, but never return an empty list
  // just because Mapbox didn't tag categories.
  const stations = mapped.filter((m) => m.looksLikeStation);
  return (stations.length ? stations : mapped).map(({ looksLikeStation, ...s }) => s);
}

// Resolve a typed station search into selectable options with a surcharge,
// using the same closest-station baseline as the main list so prices line up.
async function computeTypedStationOptions(lat, lon, query) {
  const [areaStations, matches] = await Promise.all([
    findNearbyStations(lat, lon).catch(() => []),
    searchStationsByText(lat, lon, query),
  ]);
  if (!matches.length) return { stations: [] };

  const deduped = dedupeStations(matches.map((s) => ({ ...s, one_way_miles: 0 })));
  const dests = [...areaStations, ...deduped];
  const miles = await drivingMilesFromOrigin(lat, lon, dests);

  const areaMiles = miles.slice(0, areaStations.length).filter((m) => Number.isFinite(m));
  const matchMiles = miles.slice(areaStations.length);
  const baseline = areaMiles.length ? Math.min(...areaMiles) : null;
  const rate = await getPerMileRate();

  const options = deduped
    .map((s, i) => {
      const oneWay = matchMiles[i];
      if (!Number.isFinite(oneWay)) return null;
      const closestMiles = baseline == null ? oneWay : baseline;
      const { extra_round_trip_miles, surcharge } = surchargeFromMiles(oneWay, closestMiles, rate);
      return {
        id: s.id,
        name: s.name,
        address: s.address,
        lat: s.lat,
        lon: s.lon,
        one_way_miles: roundMoney(oneWay),
        extra_round_trip_miles,
        surcharge,
        is_closest: surcharge === 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.surcharge - b.surcharge)
    .slice(0, 4); // keep the few nearest matches; drop far-flung same-name POIs

  return { stations: options };
}

// Authoritative surcharge for a chosen station at booking time. Recomputes the
// closest station around the service address and the chosen station's driving
// distance, then returns the dollar surcharge. Throws if Mapbox is unreachable;
// callers decide how to handle that (see api/payments.js).
async function computeSurchargeForChosen({ serviceLat, serviceLon, chosenLat, chosenLon }) {
  if (!isFiniteCoord(serviceLat) || !isFiniteCoord(serviceLon)) {
    return { surcharge: 0, reason: 'no_service_coords' };
  }
  if (!isFiniteCoord(chosenLat) || !isFiniteCoord(chosenLon)) {
    return { surcharge: 0, reason: 'no_chosen_coords' };
  }

  const stations = await findNearbyStations(serviceLat, serviceLon);
  // Include the chosen station as an extra destination so one Matrix call yields
  // both the closest distance and the chosen distance on the same scale.
  const dests = [...stations, { id: 'chosen', lat: chosenLat, lon: chosenLon }];
  const miles = await drivingMilesFromOrigin(serviceLat, serviceLon, dests);

  const stationMiles = miles.slice(0, stations.length).filter((m) => Number.isFinite(m));
  const chosenMiles = miles[miles.length - 1];
  if (!Number.isFinite(chosenMiles)) return { surcharge: 0, reason: 'chosen_unroutable' };

  // If we somehow found no other stations, there's no cheaper baseline → no charge.
  const closestMiles = stationMiles.length ? Math.min(...stationMiles) : chosenMiles;
  const rate = await getPerMileRate();
  const { extra_round_trip_miles, surcharge } = surchargeFromMiles(chosenMiles, closestMiles, rate);
  return { surcharge, extra_round_trip_miles, chosen_one_way_miles: roundMoney(chosenMiles), reason: 'ok' };
}

module.exports = {
  PER_MILE_RATE,
  getPerMileRate,
  findNearbyStations,
  drivingMilesFromOrigin,
  surchargeFromMiles,
  computeStationOptions,
  computeTypedStationOptions,
  computeSurchargeForChosen,
};
