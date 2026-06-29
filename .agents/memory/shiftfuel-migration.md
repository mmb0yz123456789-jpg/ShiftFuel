---
name: ShiftFuel migration strategy
description: How the vanilla JS/HTML Vercel app was migrated to React+Vite in the pnpm workspace
---

## Strategy: Script injection for heavy interactive pages

The original app was flat vanilla JS with Supabase + Stripe. Rather than rewriting thousands of lines of complex booking/worker/admin logic, the approach is:

1. **Static/simple pages** (home, legal, staff access, hiring) → Full React components with data fetched directly from Supabase via the React supabase client.
2. **Heavy interactive pages** (booking flow, worker dashboard, admin dashboard, track, account) → React component renders the exact HTML structure via JSX or `dangerouslySetInnerHTML`, then injects the original vanilla JS scripts sequentially via `useEffect` after CDN deps load.

## Key files

- `artifacts/shiftfuel/src/lib/supabase.ts` — Creates supabase client and exposes `window.ShiftFuelSupabase` for legacy JS scripts
- `artifacts/shiftfuel/src/hooks/useScriptLoader.ts` — Loads CDN scripts (supabase-js, Stripe) before injecting app scripts
- `artifacts/shiftfuel/public/` — All original JS and CSS files copied verbatim; also custom `worker-login.js` and `admin-login.js` extracted from inline HTML scripts

## CSS approach

Original CSS files (`styles.css`, `mobile-polish.css`, etc.) loaded directly in `index.html` — NOT via Tailwind or React imports. `src/index.css` is empty (a comment). This preserves 100% CSS fidelity.

## Route mapping

| Original URL | React route | Page component |
|---|---|---|
| index.html | / | HomePage |
| book.html | /book | BookPage |
| track.html | /track | TrackPage |
| customer.html | /account | AccountPage |
| hiring.html | /join-the-team | HiringPage |
| staff-access.html | /staff-access | StaffAccessPage |
| worker-login.html | /worker/login | WorkerLoginPage |
| worker.html | /worker/dashboard | WorkerDashboardPage |
| admin-login.html | /admin/login | AdminLoginPage |
| admin.html | /admin/dashboard | AdminDashboardPage |
| privacy.html | /privacy | PrivacyPage |
| terms.html | /terms | TermsPage |
| liability-waiver.html | /liability-waiver | LiabilityWaiverPage |

**Why:** The original JS is thousands of lines of complex Supabase + Stripe logic. Rewriting would risk breaking functionality. Script injection gives 100% functional parity with minimal risk.
