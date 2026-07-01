/**
 * api/generate-service-area.js
 *
 * One-off generator for service-area.json — the drive-distance polygon that
 * api/address.js uses to decide whether an address is in the service area.
 *
 * It calls the Mapbox Isochrone API for the anchor below and writes the
 * simplified polygon to api/service-area.json. Run it whenever you want to
 * change the anchor location or the service distance/time.
 *
 *   node api/generate-service-area.js
 *
 * Tunables:
 *   ANCHOR_LAT / ANCHOR_LON  – where service is dispatched from.
 *   CONTOUR_MILES            – drive *distance* radius (set MODE = 'meters').
 *   CONTOUR_MINUTES          – drive *time* radius     (set MODE = 'minutes').
 *   MODE                     – 'meters' (distance) or 'minutes' (time).
 *   GENERALIZE_M             – boundary simplification tolerance in meters.
 */

const fs = require('fs');
const path = require('path');

const ANCHOR_LAT = 39.6789; // 132 Christiana Mall, Newark DE 19702
const ANCHOR_LON = -75.6653;

const MODE = 'meters';        // 'meters' = drive distance, 'minutes' = drive time
const CONTOUR_MILES = 20;     // used when MODE === 'meters'
const CONTOUR_MINUTES = 30;   // used when MODE === 'minutes'
const GENERALIZE_M = 500;     // higher = fewer points / coarser boundary

const MAPBOX_TOKEN =
  process.env.MAPBOX_TOKEN ||
  process.env.MAPBOX_ACCESS_TOKEN ||
  process.env.SHIFTFUEL_MAPBOX_TOKEN ||
  '';

// The public token is URL-restricted to our domain; server-side calls must send
// a matching Referer (see the note in api/address.js).
const MAPBOX_REFERER = process.env.MAPBOX_REFERER || 'https://shift-fuel.vercel.app/';

async function main() {
  const meters = Math.round(CONTOUR_MILES * 1609.34);
  const contourParam =
    MODE === 'minutes' ? `contours_minutes=${CONTOUR_MINUTES}` : `contours_meters=${meters}`;

  const url =
    `https://api.mapbox.com/isochrone/v1/mapbox/driving/${ANCHOR_LON},${ANCHOR_LAT}` +
    `?${contourParam}&polygons=true&denoise=1&generalize=${GENERALIZE_M}` +
    `&access_token=${MAPBOX_TOKEN}`;

  const res = await fetch(url, { headers: { Referer: MAPBOX_REFERER } });
  if (!res.ok) {
    throw new Error(`Mapbox Isochrone ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  const geometry = data.features?.[0]?.geometry;
  if (!geometry) throw new Error('No polygon returned by Mapbox.');

  const out = {
    generated: new Date().toISOString().slice(0, 10),
    description:
      MODE === 'minutes'
        ? `${CONTOUR_MINUTES}-minute driving-time service area (Mapbox Isochrone, generalize=${GENERALIZE_M}m).`
        : `${CONTOUR_MILES}-mile driving-distance service area (Mapbox Isochrone, generalize=${GENERALIZE_M}m).`,
    profile: 'driving',
    mode: MODE,
    contour_meters: MODE === 'meters' ? meters : null,
    contour_miles: MODE === 'meters' ? CONTOUR_MILES : null,
    contour_minutes: MODE === 'minutes' ? CONTOUR_MINUTES : null,
    anchor: { lat: ANCHOR_LAT, lon: ANCHOR_LON },
    geometry,
  };

  const outPath = path.join(__dirname, 'service-area.json');
  fs.writeFileSync(outPath, JSON.stringify(out));
  const pts = geometry.coordinates?.[0]?.length || 0;
  console.log(`Wrote ${outPath} — ${pts} boundary points, ${out.description}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
