import { Router, type Request, type Response } from "express";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import path from "path";

// The shiftfuel-api folder lives at the artifact root (artifacts/api-server/shiftfuel-api/).
// It contains CJS modules and is loaded at runtime, NOT bundled by esbuild.
// In dev: __dirname resolves to dist/, so we go up two levels to the artifact root.
// In prod the CJS folder is copied to the same relative position.
const _require = createRequire(import.meta.url);
const _dirname = path.dirname(fileURLToPath(import.meta.url));
// dist/index.mjs → ../../shiftfuel-api = artifacts/api-server/shiftfuel-api
// or dist/shiftfuel-api if copied there for prod
const apiDir = path.resolve(_dirname, "..", "shiftfuel-api");

const address = _require(path.join(apiDir, "address.js"));
const payments = _require(path.join(apiDir, "payments.js"));
const createAuthorizedBooking = _require(path.join(apiDir, "create-authorized-booking.js"));
const push = _require(path.join(apiDir, "push.js"));
const promos = _require(path.join(apiDir, "promos.js"));
const checkr = _require(path.join(apiDir, "checkr.js"));
const checkrWebhook = _require(path.join(apiDir, "checkr-webhook.js"));
const payouts = _require(path.join(apiDir, "payouts.js"));
const fuelCards = _require(path.join(apiDir, "fuel-cards.js"));
const gpsWatchdog = _require(path.join(apiDir, "gps-watchdog.js"));
const autoReverse = _require(path.join(apiDir, "auto-reverse-payments.js"));
// generate-service-area.js is a one-off CLI script (runs main() at import time),
// not an HTTP handler. It is NOT mounted as an API route.

const router = Router();

// Helper: wrap a Vercel-style handler (req, res) in Express
function vercelWrap(handler: (req: Request, res: Response) => Promise<void>) {
  return async (req: Request, res: Response) => {
    try {
      await handler(req, res);
    } catch (err: any) {
      console.error("[shiftfuel route] unhandled error:", err?.message || err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal server error" });
      }
    }
  };
}

// Pre-flight OPTIONS for all routes (Express 5 requires explicit wildcard)
router.options("/{*path}", (req: Request, res: Response) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.status(204).end();
});

router.all("/address", vercelWrap(address));
router.all("/payments", vercelWrap(payments));
router.all("/create-authorized-booking", vercelWrap(createAuthorizedBooking));
router.all("/push", vercelWrap(push));
router.all("/promos", vercelWrap(promos));
router.all("/checkr", vercelWrap(checkr));
router.all("/checkr-webhook", vercelWrap(checkrWebhook));
router.all("/payouts", vercelWrap(payouts));
router.all("/fuel-cards", vercelWrap(fuelCards));
router.all("/gps-watchdog", vercelWrap(gpsWatchdog));
router.all("/auto-reverse-payments", vercelWrap(autoReverse));

export default router;
