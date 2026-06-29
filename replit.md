# ShiftFuel Concierge

A workday vehicle concierge service (fuel, wash, quick care) with a web booking experience and a unified mobile portal for workers, admins, and customers.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server (port 5000)
- `pnpm --filter @workspace/shiftfuel run dev` — Web app at `/`
- `pnpm --filter @workspace/sf-worker run dev` — Mobile portal at `/sf-worker/`
- `pnpm run typecheck` — Full typecheck across all packages
- `pnpm run build` — Typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — Regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — Push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM + Supabase (URL: https://nhdsokqxndhlkbsvmxio.supabase.co)
- Web: React + Vite + Wouter
- Mobile: Expo (expo-router v6, React Native)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/shiftfuel/` — Web app (React + Vite), routes in `src/App.tsx`
- `artifacts/sf-worker/` — Unified mobile portal (Expo), screens in `app/`
- `artifacts/api-server/` — Express API server
- `artifacts/sf-worker/lib/supabase.ts` — Supabase REST client (no SDK)
- `artifacts/sf-worker/context/AuthContext.tsx` — Multi-role auth (worker/admin/customer)
- `artifacts/shiftfuel/src/lib/supabase.ts` — Supabase client for web

## Architecture decisions

- **Single mobile app for all 3 portal roles** — Expo only allows 1 mobile app per Replit project. All three portals (worker, admin, customer) live in `sf-worker` as a unified "ShiftFuel Portal" with role picker on launch.
- **Supabase REST API (not SDK)** — Mobile uses raw fetch to Supabase REST endpoints; avoids SDK bundle size and React Native compatibility issues.
- **Worker auth via RPC** — `worker_login(p_phone, p_password)` Supabase RPC. Admin via `admin_login(p_username, p_password_hash)` with SHA-256 (Web Crypto API). Customer via `customer_login(p_phone, p_email)`.
- **No Tailwind in native** — Mobile uses React Native `StyleSheet` throughout. Web uses Tailwind + custom CSS variables.
- **Expo Router file-based navigation** — Stack at root; 3 tab groups: `(worker-tabs)/`, `(admin-tabs)/`, `(customer-tabs)/`.

## Product

- **Web (/)**: Marketing site + service booking flow for customers (fuel, wash, quick care)
- **Mobile (`/sf-worker/`)**: Unified portal — Workers see jobs/earnings/profile; Admins see all requests + worker management; Customers view booking history

## Mobile App Screens

| Screen | Path |
|--------|------|
| Welcome (role picker) | `app/index.tsx` |
| Worker login | `app/worker-login.tsx` |
| Worker dashboard | `app/(worker-tabs)/index.tsx` |
| Worker jobs | `app/(worker-tabs)/jobs.tsx` |
| Worker earnings | `app/(worker-tabs)/earnings.tsx` |
| Worker profile | `app/(worker-tabs)/profile.tsx` |
| Job detail | `app/job/[id].tsx` |
| Admin login | `app/admin-login.tsx` |
| Admin requests | `app/(admin-tabs)/index.tsx` |
| Admin workers | `app/(admin-tabs)/workers.tsx` |
| Admin settings | `app/(admin-tabs)/profile.tsx` |
| Customer login | `app/customer-login.tsx` |
| Customer bookings | `app/(customer-tabs)/index.tsx` |
| Customer account | `app/(customer-tabs)/profile.tsx` |

## Brand Colors

- Primary (teal): `#0D3B3B`
- Accent (coral): `#FF6B5A`
- Sage: `#A7BFA6`
- Background: `#F7F7F5`
- Border: `#D9E3DF`
- Green: `#1F7A45`
- Danger: `#B42318`

## Supabase Auth RPCs

- Worker: `worker_login(p_phone, p_password)`
- Admin: `admin_login(p_username, p_password_hash)` — SHA-256 of password
- Customer: `customer_login(p_phone, p_email)`

## User preferences

- Keep the ShiftFuel brand colors consistent across web and mobile
- One mobile app for all 3 portals (Replit constraint)

## Gotchas

- Only one Expo/mobile artifact allowed per Replit project — do not try to create additional mobile artifacts
- Admin SHA-256 hashing uses Web Crypto API (`crypto.subtle`) — works on web preview; native Expo Go may need expo-crypto
- Mobile uses `Platform.OS === "web" ? 67 : insets.top` for safe area padding (web preview doesn't report real safe area insets)
- Tab screens inside `(worker-tabs)/`, `(admin-tabs)/`, `(customer-tabs)/` — each group needs its own `_layout.tsx`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `expo` skill for mobile patterns, safe area handling, and NativeTabs usage
