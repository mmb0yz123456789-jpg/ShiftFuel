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

const PER_MILE_RATE = 0.75;       // dollars per extra round-trip mile
const STATION_SEARCH_LIMIT = 10;  // how many nearby stations to consider
const METERS_PER_MILE = 1609.34;

const MAPBOX_TOKEN =
  process.env.MAPBOX_TOKEN ||
  process.env.MAPBOX_ACCESS_TOKEN ||
  process.env.SHIFTFUEL_MAPBOX_TOKEN ||
  'pk.eyJ1IjoibW1iMHl6MTIiLCJhIjoiY21xcXZiaGU4MGxubjJvcHpidnhidG55cyJ9.Ciss2gT76eC3Zt92_qhtGA';

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
function surchargeFromMiles(chosenMiles, closestMiles) {
  const extraOneWay = Math.max(0, chosenMiles - closestMiles);
  const extraRoundTrip = roundMoney(extraOneWay * 2);
  return {
    extra_round_trip_miles: extraRoundTrip,
    surcharge: roundMoney(extraRoundTrip * PER_MILE_RATE),
  };
}

// Build the customer-facing station list: each station with its one-way driving
// miles and the surcharge to choose it (closest = $0). Sorted nearest first.
async function computeStationOptions(lat, lon) {
  const stations = await findNearbyStations(lat, lon);
  if (!stations.length) return { stations: [], closest: null };

  const miles = await drivingMilesFromOrigin(lat, lon, stations);
  const withMiles = stations
    .map((s, i) => ({ ...s, one_way_miles: miles[i] }))
    .filter((s) => Number.isFinite(s.one_way_miles))
    .sort((a, b) => a.one_way_miles - b.one_way_miles);

  if (!withMiles.length) return { stations: [], closest: null };
  const closestMiles = withMiles[0].one_way_miles;

  const options = withMiles.map((s) => {
    const { extra_round_trip_miles, surcharge } = surchargeFromMiles(s.one_way_miles, closestMiles);
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
  return { stations: options, closest: options[0] };
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
  const { extra_round_trip_miles, surcharge } = surchargeFromMiles(chosenMiles, closestMiles);
  return { surcharge, extra_round_trip_miles, chosen_one_way_miles: roundMoney(chosenMiles), reason: 'ok' };
}

module.exports = {
  PER_MILE_RATE,
  findNearbyStations,
  drivingMilesFromOrigin,
  surchargeFromMiles,
  computeStationOptions,
  computeSurchargeForChosen,
};
