/**
 * /api/_route-mileage.js
 *
 * Turns a job's GPS breadcrumb trail (request_locations) into a verified driven
 * distance + road-snapped route via the Mapbox Map Matching API, and stores it
 * on the service_requests row (driven_miles / driven_route / driven_matched_at).
 *
 * This is PROOF-OF-SERVICE / PAYROLL-AUDIT data — it does NOT change worker pay,
 * which stays the chosen-station detour (gas_station_extra_miles × rate).
 *
 * Called best-effort from markRequestComplete() at job completion. Every failure
 * is swallowed: mileage proof must never block a completion or payment capture.
 * Idempotent — runs Map Matching at most once per job (guarded on
 * driven_matched_at), so it's one Mapbox call per completed job.
 */

// Public Mapbox token — same env-first fallback as api/address.js. Map Matching
// works with a public pk.* token.
const MAPBOX_TOKEN =
  process.env.MAPBOX_TOKEN ||
  process.env.MAPBOX_ACCESS_TOKEN ||
  process.env.SHIFTFUEL_MAPBOX_TOKEN ||
  '';

// The public token is Referer-restricted to our domain; server calls carry no
// browser Referer, so set it explicitly (same pattern as api/address.js).
const MAPBOX_REFERER = process.env.MAPBOX_REFERER || 'https://shift-fuel.vercel.app/';
const MAPBOX_FETCH_HEADERS = { Referer: MAPBOX_REFERER };

const METERS_PER_MILE = 1609.34;
const MAX_MATCH_POINTS = 100; // Mapbox Map Matching hard limit per request

function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function haversineTrailMiles(points) {
  let meters = 0;
  for (let i = 1; i < points.length; i++) meters += haversineMeters(points[i - 1], points[i]);
  return meters / METERS_PER_MILE;
}

// Down-sample to <= max points, always keeping the first and last fix.
function decimate(points, max) {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const out = [];
  for (let i = 0; i < max; i++) out.push(points[Math.round(i * step)]);
  out[out.length - 1] = points[points.length - 1];
  return out;
}

async function mapMatch(points) {
  const coords = points.map((p) => `${p.lon},${p.lat}`).join(';');
  const params = new URLSearchParams({
    access_token: MAPBOX_TOKEN,
    geometries: 'geojson',
    overview: 'simplified', // compact route line for the proof trail
    tidy: 'true',           // drop noisy / duplicate GPS samples before matching
  });
  const url = `https://api.mapbox.com/matching/v5/mapbox/driving/${coords}?${params.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const r = await fetch(url, { headers: MAPBOX_FETCH_HEADERS, signal: controller.signal });
    if (!r.ok) return null;
    const data = await r.json();
    if (data.code !== 'Ok' || !Array.isArray(data.matchings) || !data.matchings.length) return null;

    const meters = data.matchings.reduce((sum, m) => sum + (Number(m.distance) || 0), 0);
    const line = [];
    for (const m of data.matchings) {
      const c = m.geometry && m.geometry.coordinates;
      if (Array.isArray(c)) line.push(...c);
    }
    return {
      miles: meters / METERS_PER_MILE,
      geometry: line.length ? { type: 'LineString', coordinates: line } : null,
    };
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Compute + store verified driven mileage for one completed request.
 * @param {{ supabaseAdmin: object, requestId: string }} args  service-role client + request id
 */
async function recordDrivenMileage({ supabaseAdmin, requestId } = {}) {
  if (!supabaseAdmin || !requestId) return;
  try {
    // One Map Matching call per job: bail if we've already stamped this request.
    const { data: existing } = await supabaseAdmin
      .from('service_requests')
      .select('driven_matched_at')
      .eq('id', requestId)
      .maybeSingle();
    if (existing && existing.driven_matched_at) return;

    const { data: rows, error } = await supabaseAdmin
      .from('request_locations')
      .select('latitude, longitude, created_at')
      .eq('request_id', requestId)
      .order('created_at', { ascending: true });
    if (error || !rows || rows.length < 2) return;

    const points = rows
      .map((r) => ({ lat: Number(r.latitude), lon: Number(r.longitude) }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    if (points.length < 2) return;

    const matched = await mapMatch(decimate(points, MAX_MATCH_POINTS));

    // Always store something: the road-snapped result when matching succeeds,
    // otherwise a raw straight-line estimate so payroll still has a figure.
    const miles = matched ? matched.miles : haversineTrailMiles(points);
    const route = matched ? matched.geometry : null;

    await supabaseAdmin
      .from('service_requests')
      .update({
        driven_miles: Math.round(miles * 10) / 10,
        driven_route: route,
        driven_matched_at: new Date().toISOString(),
      })
      .eq('id', requestId);
  } catch (err) {
    console.warn('[route-mileage] skipped for request', requestId, '—', err && err.message);
  }
}

/**
 * Read-only: miles driven so far from the GPS breadcrumb trail, optionally counting
 * only fixes at/after `sinceIso` (e.g. the pickup time, so we measure the paid detour
 * and not the worker's commute to the customer). Unlike recordDrivenMileage this never
 * writes and has no idempotency guard — it's used mid-job (e.g. at cancellation) to
 * size a partial-trip cost. Returns miles (Number), or null when there aren't enough
 * fixes to measure. Never throws.
 * @param {{ supabaseAdmin: object, requestId: string, sinceIso?: string }} args
 */
async function drivenMilesSoFar({ supabaseAdmin, requestId, sinceIso } = {}) {
  if (!supabaseAdmin || !requestId) return null;
  try {
    let q = supabaseAdmin
      .from('request_locations')
      .select('latitude, longitude, created_at')
      .eq('request_id', requestId)
      .order('created_at', { ascending: true });
    if (sinceIso) q = q.gte('created_at', sinceIso);
    const { data: rows, error } = await q;
    if (error || !rows || rows.length < 2) return null;

    const points = rows
      .map((r) => ({ lat: Number(r.latitude), lon: Number(r.longitude) }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
    if (points.length < 2) return null;

    const matched = await mapMatch(decimate(points, MAX_MATCH_POINTS));
    return matched ? matched.miles : haversineTrailMiles(points);
  } catch (err) {
    console.warn('[route-mileage] drivenMilesSoFar skipped for request', requestId, '—', err && err.message);
    return null;
  }
}

module.exports = { recordDrivenMileage, drivenMilesSoFar };
