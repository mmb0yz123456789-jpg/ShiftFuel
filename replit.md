# ShiftFuel Concierge

A multi-page web app that delivers workday vehicle services (fuel fill-ups, car washes, quick vehicle checks) to workplaces — customers book online, workers handle jobs in the field, and admins manage everything from a dashboard.

## Run & Operate

- `pnpm --filter @workspace/shiftfuel run dev` — run the frontend (port 23752)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: Vanilla HTML/JS/CSS (multi-page app) served via Vite from `artifacts/shiftfuel/public/`
- API: Express 5 wrapping Vercel-style CJS serverless functions
- DB: Supabase (PostgreSQL) — Supabase JS client used directly from both browser and server
- Payments: Stripe (manual-capture payment intents for fuel bookings)
- Push notifications: Web Push (VAPID)
- Build: esbuild (CJS bundle for API server)

## Where things live

- `artifacts/shiftfuel/public/` — all HTML pages, CSS, JS (the full vanilla app)
- `artifacts/shiftfuel/src/App.tsx` — React shell (redirects to index.html; minimal)
- `artifacts/api-server/src/routes/shiftfuel.ts` — Express routes wrapping all API handlers
- `artifacts/api-server/shiftfuel-api/` — CJS serverless functions (ported from Vercel)
- `artifacts/api-server/shiftfuel-api/_auth.js` — Supabase admin client + CORS + token verification
- `artifacts/api-server/shiftfuel-api/payments.js` — all Stripe payment operations (2800 lines)
- `artifacts/api-server/shiftfuel-api/address.js` — address validation + Mapbox proxying

## Architecture decisions

- **CJS API modules loaded at runtime**: The shiftfuel-api folder is NOT bundled by esbuild — it lives at `artifacts/api-server/shiftfuel-api/` and is loaded via `createRequire` at runtime. A `{"type":"commonjs"}` `package.json` inside that folder tells Node to treat the `.js` files as CJS even though the parent package is `"type": "module"`.
- **Vite proxy for `/api`**: In dev, Vite proxies `/api/*` requests to `http://localhost:8080`, so the static HTML pages can call `/api/payments` etc. without CORS issues.
- **Static HTML + React shell**: The React app at `/` redirects immediately to `index.html` served from Vite's public folder. All real pages are vanilla HTML.
- **No DATABASE_URL**: This app uses Supabase directly; there is no Drizzle ORM or local Postgres. The `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` env vars drive the server side.

## Required Environment Variables

Set these in Replit Secrets before using the app:

| Secret | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `STRIPE_SECRET_KEY` | Stripe secret key (test or live) |
| `MAPBOX_TOKEN` | Mapbox access token (address/service area) |
| `VAPID_PUBLIC_KEY` | Web push VAPID public key |
| `VAPID_PRIVATE_KEY` | Web push VAPID private key |
| `VAPID_SUBJECT` | VAPID subject (e.g. `mailto:you@example.com`) |
| `CHECKR_API_KEY` | Checkr background check API key (optional) |
| `CHECKR_PACKAGE` | Checkr package slug (optional) |
| `CRON_SECRET` | Auth token for cron-triggered endpoints |

## Gotchas

- The `shiftfuel-api/` folder must have `{"type":"commonjs"}` in its `package.json`. Without it, Node treats `.js` as ESM and `module.exports` fails.
- The esbuild bundle's CJS banner (`globalThis.require = createRequire(...)`) is present but the shiftfuel-api files are NOT bundled — they're loaded at runtime via `createRequire`.
- `generate-service-area.js` runs on startup if MAPBOX_TOKEN is set — it overwrites `shiftfuel-api/service-area.json`. This is normal.
- Express 5 uses path-to-regexp v8 which requires explicit wildcard syntax: `/{*path}` not `*`.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- Migration backup: `.migration-backup/` contains the original Vercel project files
