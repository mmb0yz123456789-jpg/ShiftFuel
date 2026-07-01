---
name: gps-watchdog-external-cron
description: The worker GPS watchdog depends on an external cron-job.org trigger that lives outside the repo
metadata:
  type: project
---

The GPS watchdog (code now at [api/_cron/gps-watchdog.js](api/_cron/gps-watchdog.js) + migration `202606241000_gps_watchdog.sql`) nudges a worker to reopen the PWA when their active job's GPS goes dark (the app suspends GPS when backgrounded/closed; it can't notify itself, so the server detects staleness and pushes).

**2026-07-01: consolidated into the shared `/api/cron` dispatcher** to stay under Vercel Hobby's 12-serverless-function limit (the deploy failed at 13 functions after `api/customer-account.js` was added). The standalone `api/gps-watchdog.js` was removed; its logic moved to `api/_cron/gps-watchdog.js` (underscore dir = not counted as a function) and `cron.js` gained a `job=gps-watchdog` branch. The **public `/api/gps-watchdog` URL is unchanged** — a `vercel.json` rewrite (`/api/gps-watchdog` → `/api/cron?job=gps-watchdog`) preserves it, so the external cron-job.org trigger needs no change. Note: `api/` is now AT the 12-function cap — the next new `api/*.js` (non-underscore) will break the deploy again; consolidate (e.g. merge `checkr-webhook.js` into `checkr.js` via a rewrite) rather than add.

**Critical non-obvious dependency:** the recurring trigger is an **external cron-job.org job** ("ShiftFuel GPS Watchdog", every 2 min) that hits `https://shift-fuel.vercel.app/api/gps-watchdog` with header `Authorization: Bearer <CRON_SECRET>`. It is NOT in `vercel.json` because Vercel's free Hobby plan only allows daily cron. So if workers stop getting nudges, check the cron-job.org dashboard first — nothing in the repo reveals this trigger exists.

`CRON_SECRET` is a "Sensitive" Vercel env var (write-only, can't be read back) — shared with the `auto-reverse-payments` cron. Thresholds are env-tunable: `GPS_STALE_SECONDS` (default 240) and `GPS_RENUDGE_SECONDS` (default 600).

Verified working end-to-end 2026-06-24 (real iPhone, locked + swiped away → nudge landed). Related: [[shiftfuel-push-helper-module]].
