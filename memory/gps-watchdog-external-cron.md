---
name: gps-watchdog-external-cron
description: The worker GPS watchdog depends on an external cron-job.org trigger that lives outside the repo
metadata:
  type: project
---

The GPS watchdog ([api/gps-watchdog.js](api/gps-watchdog.js) + migration `202606241000_gps_watchdog.sql`) nudges a worker to reopen the PWA when their active job's GPS goes dark (the app suspends GPS when backgrounded/closed; it can't notify itself, so the server detects staleness and pushes).

**Critical non-obvious dependency:** the recurring trigger is an **external cron-job.org job** ("ShiftFuel GPS Watchdog", every 2 min) that hits `https://shift-fuel.vercel.app/api/gps-watchdog` with header `Authorization: Bearer <CRON_SECRET>`. It is NOT in `vercel.json` because Vercel's free Hobby plan only allows daily cron. So if workers stop getting nudges, check the cron-job.org dashboard first — nothing in the repo reveals this trigger exists.

`CRON_SECRET` is a "Sensitive" Vercel env var (write-only, can't be read back) — shared with the `auto-reverse-payments` cron. Thresholds are env-tunable: `GPS_STALE_SECONDS` (default 240) and `GPS_RENUDGE_SECONDS` (default 600).

Verified working end-to-end 2026-06-24 (real iPhone, locked + swiped away → nudge landed). Related: [[shiftfuel-push-helper-module]].
