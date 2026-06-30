# Client Runtime Config Plan

This app currently serves static HTML and browser JavaScript directly from the
repository root. Some public runtime config is hardcoded in client files.

Important distinction:

- Public browser keys such as Supabase anon keys, Stripe publishable keys, and
  Mapbox public tokens are not server secrets.
- Server-only keys such as Supabase service role keys and Stripe secret keys
  must never be exposed to the browser.

Current hardcoded public config locations:

- `supabase-client.js`
  - Supabase project URL
  - Supabase anon key
- `booking-flow.js`
  - Stripe publishable test key
- `script.js`
  - Stripe publishable test key
- `track.html`
  - Stripe publishable test key assigned to `window.SHIFTFUEL_STRIPE_PUBLISHABLE_KEY`
  - Mapbox public token assigned to `window.SHIFTFUEL_MAPBOX_TOKEN`
- `service-area-editor.html`
  - Mapbox public token assigned to `window.SHIFTFUEL_MAPBOX_TOKEN`
- `admin.js`
  - Mapbox static image public token
- `worker-route-map.js`
  - Mapbox public token

Implemented approach:

Vercel generates a small environment-specific browser config file:

```html
<script src="/runtime-config.js"></script>
```

The file would expose only public browser-safe values:

```js
window.SHIFTFUEL_CONFIG = {
  appEnv: "dev",
  supabaseUrl: "...",
  supabaseAnonKey: "...",
  stripePublishableKey: "...",
  mapboxPublicToken: "..."
};
```

DEV Vercel would serve DEV values. PROD Vercel would serve PROD values.

Generation command:

```sh
npm run build
```

The generated `runtime-config.js` file is ignored by Git and should be produced
from Vercel environment variables during deployment.

Do not include:

- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `CHECKR_API_KEY`
- `CHECKR_WEBHOOK_SECRET`
- `VAPID_PRIVATE_KEY`
- `CRON_SECRET`

Implementation should be a separate approved phase because it changes runtime
configuration behavior.
