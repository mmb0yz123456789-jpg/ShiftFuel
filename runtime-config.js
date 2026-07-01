'use strict';

window.SHIFTFUEL_CONFIG = Object.freeze({
  "appEnv": "local",
  "supabaseUrl": "",
  "supabaseAnonKey": "",
  "stripePublishableKey": "",
  "mapboxPublicToken": ""
});

window.SHIFTFUEL_STRIPE_PUBLISHABLE_KEY =
  window.SHIFTFUEL_CONFIG.stripePublishableKey || window.SHIFTFUEL_STRIPE_PUBLISHABLE_KEY || '';
window.SHIFTFUEL_MAPBOX_TOKEN =
  window.SHIFTFUEL_CONFIG.mapboxPublicToken || window.SHIFTFUEL_MAPBOX_TOKEN || '';
