---
name: shiftfuel-push-helper-module
description: api/_push.js is a shared helper module, not a request handler — easy to clobber by mistake
metadata:
  type: project
---

`api/_push.js` is the **shared Web Push helper module** — it exports `{ ensureVapid, notifyRequest, sendToSubs, cleanPhone }` and is required by both `api/push.js` and `api/payments.js`.

It is NOT a request handler. On 2026-06-24 a commit ("Update _push.js") accidentally pasted the contents of the `api/push.js` request handler over it, so `sendToSubs`/`notifyRequest` became `undefined`. This silently killed ALL push notifications (the worker test push showed "unknown", and real job-assigned/completed/paid alerts died too). Fixed by restoring from the prior good commit.

**Why it matters:** the `_push.js` / `push.js` naming is confusingly similar. If push breaks again, first confirm `api/_push.js` still starts with `// Shared Web Push send logic` and exports the helpers — not a `module.exports = async (req, res)` handler. Push delivery requires the `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` env vars in Vercel. Related: [[gps-watchdog-external-cron]].
