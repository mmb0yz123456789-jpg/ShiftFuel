---
name: shiftfuel-redesign-roadmap
description: ShiftFuel UI redesign roadmap and the app-vs-website aesthetic split across surfaces
metadata:
  type: project
---

Mark is redesigning ShiftFuel's surfaces in this order (stated 2026-06-24):
1. **Worker portal** (`worker.html` / `worker.js` / `worker-app.css`) — in progress. Should feel like a real installed **app** (Uber-driver style): clean light shell, big tap targets, and the Dashboard babysteps the worker through today's jobs in time order with the guided current-step card surfaced up front.
2. **Customer experience** (`index.html` + booking flow) — next. Must be **responsive/adaptive**: feel like a clean **app on a phone** (most customers book/track from mobile) AND like a proper **website on desktop** (wider, more breathing room). Same code, two faces — NOT one or the other. (Mark corrected an earlier "website-only" framing 2026-06-24.)
3. **Admin** — last. Both the admin app and admin website.

**Key principle:** worker portal = mobile-app-only (installed PWA). Customer = both app (mobile) and website (desktop) via responsive design. Keep surface-specific styling isolated (worker uses a dedicated `worker-app.css` loaded after `styles.css`) so changing one surface doesn't bleed into another.
