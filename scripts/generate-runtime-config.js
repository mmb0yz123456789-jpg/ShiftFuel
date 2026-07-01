'use strict';

const fs = require('fs');
const path = require('path');

const explicitSupabaseUrl = process.env.SUPABASE_PUBLIC_URL || '';
const explicitSupabaseAnonKey = process.env.SUPABASE_PUBLIC_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const pairedSupabaseUrl = explicitSupabaseUrl || (explicitSupabaseAnonKey ? process.env.SUPABASE_URL || '' : '');

const publicConfig = {
  appEnv: process.env.VITE_APP_ENV || process.env.SHIFTFUEL_APP_ENV || process.env.VERCEL_ENV || 'local',
  supabaseUrl: pairedSupabaseUrl,
  supabaseAnonKey: explicitSupabaseAnonKey,
  stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || process.env.SHIFTFUEL_STRIPE_PUBLISHABLE_KEY || '',
  mapboxPublicToken:
    process.env.MAPBOX_PUBLIC_TOKEN ||
    process.env.SHIFTFUEL_MAPBOX_TOKEN ||
    process.env.MAPBOX_ACCESS_TOKEN ||
    process.env.MAPBOX_TOKEN ||
    '',
};

const output = `'use strict';

window.SHIFTFUEL_CONFIG = Object.freeze(${JSON.stringify(publicConfig, null, 2)});

window.SHIFTFUEL_STRIPE_PUBLISHABLE_KEY =
  window.SHIFTFUEL_CONFIG.stripePublishableKey || window.SHIFTFUEL_STRIPE_PUBLISHABLE_KEY || '';
window.SHIFTFUEL_MAPBOX_TOKEN =
  window.SHIFTFUEL_CONFIG.mapboxPublicToken || window.SHIFTFUEL_MAPBOX_TOKEN || '';
`;

fs.writeFileSync(path.join(process.cwd(), 'runtime-config.js'), output);
console.log('Generated runtime-config.js');
