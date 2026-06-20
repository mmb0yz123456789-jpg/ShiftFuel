/**
 * /api/address.js
 *
 * Vercel Serverless Function for server-side address/service-area validation.
 * Moves Nominatim geocoding off the browser to avoid CORS/rate-limit issues
 * and keep the service-area radius logic in one place.
 *
 * Actions (all POST):
 *   validate_service_area – Geocode an address and check it's within the
 *                            service radius of the anchor point.
 */

const { setCorsHeaders } = require('./_auth');

const SERVICE_ANCHOR_LAT = 39.6789; // 132 Christiana Mall, Newark DE 19702
const SERVICE_ANCHOR_LON = -75.6653;
const SERVICE_MAX_MILES = 20;

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

async function nominatimSearch(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(query)}&limit=1`;
  const response = await fetch(url, {
    headers: { 'Accept-Language': 'en', 'User-Agent': 'ShiftFuelConcierge/1.0 (server)' },
  });
  if (!response.ok) return null;
  const results = await response.json();
  return results?.length ? results[0] : null;
}

async function handleValidateServiceArea(body, res) {
  const street = String(body.street || '').trim();
  const city = String(body.city || '').trim();
  const state = String(body.state || '').trim();
  const zip = String(body.zip || '').trim();
  // Apt/Suite/Unit is intentionally never included in the geocoding query —
  // Nominatim frequently can't resolve unit numbers and that caused
  // otherwise-valid addresses to fail verification.

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

    const distanceMiles = haversineMiles(
      SERVICE_ANCHOR_LAT, SERVICE_ANCHOR_LON,
      Number(result.lat), Number(result.lon)
    );

    if (distanceMiles > SERVICE_MAX_MILES) {
      return res.status(200).json({
        valid: false,
        message: 'We currently do not serve this area.',
        distanceMiles: Math.round(distanceMiles * 10) / 10,
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
      distanceMiles: Math.round(distanceMiles * 10) / 10,
    });
  } catch (err) {
    console.error('[address/validate_service_area] Error:', err.message);
    return res.status(200).json({
      valid: false,
      message: 'We could not verify this address. Please check your address and try again.',
    });
  }
}

const HANDLERS = {
  validate_service_area: handleValidateServiceArea,
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
