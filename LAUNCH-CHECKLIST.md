# ShiftFuel — Pre-Launch Checklist

## SQL to deploy in Supabase SQL Editor (required before launch)

Run these files in order. Each is safe to re-run.

### 1. supabase-worker-login.sql  ← NEW — run this first
- Creates `worker_login(p_identifier, p_password)` RPC (server-side password verification)
- Creates `employees_public` security-barrier view (excludes password columns)
- **After running:** confirm worker login works on the deployed site, then optionally drop the old anon SELECT policy on `employees` to fully block hash reads

### 2. supabase-request-rpc-fixes.sql
- Fixes `::time` cast in `admin_update_request` RPC (required for deny to work)

### 3. supabase-deny-fix.sql
- Same `::time` fix (secondary copy)

### 4. supabase-security-hardening.sql
- Updates `public_booked_return_slots` to exclude `auto_reversed` status
- Contains updated `public_track_request` RPC

### 5. supabase-create-request.sql
- Ensure `public_track_request` includes `pending_customer_info` status support

---

## Vercel Environment Variables — confirm all are set

| Variable | Required for |
|---|---|
| `STRIPE_SECRET_KEY` | All payment endpoints |
| `SUPABASE_URL` | All API endpoints |
| `SUPABASE_SERVICE_ROLE_KEY` | All API endpoints |
| `TWILIO_ACCOUNT_SID` | SMS endpoints |
| `TWILIO_AUTH_TOKEN` | SMS endpoints |
| `TWILIO_PHONE_NUMBER` | SMS endpoints |
| `CRON_SECRET` | auto-reverse-payments job |
| `STRIPE_WEBHOOK_SECRET` | If using Stripe webhooks |

---

## Changes deployed in this session

### API Security (Priority 1) — DONE
- All 6 API endpoints now have restricted CORS (production domain + preview only, no `*`)
- `capture-payment`: requires valid admin or worker session token + verifies PI belongs to request + blocks double-capture
- `cancel-payment`: requires valid admin or worker session token + verifies PI ownership + blocks cancel of already-captured payment
- `refund-payment`: requires admin token only + verifies PI ownership + requires `payment_status = captured`
- `send-sms`: staff-only events require session token; `booking_submitted` is allowed without token
- `notify-area-workers`: requires admin token OR a valid recently-created `request_id` (booking flow)
- `create-payment-intent`: CORS restricted, safe error messages (no raw Stripe errors to caller)
- `auto-reverse-payments`: was already protected by CRON_SECRET; safe error messages applied
- `api/_auth.js` shared helper created for token verification

### Worker Login Security (Priority 2) — DONE (pending SQL deploy)
- `worker-login.html` no longer fetches `worker_password_hash` / `worker_password_salt` columns
- Password verification now happens in the new `worker_login` RPC (server-side)
- `sha256Hex` and `cleanPhone` functions removed from login page (no longer needed)
- **SQL deploy required:** `supabase-worker-login.sql`

### Address Validation (Priority 7) — DONE
- `script.js` line ~695: changed from fail-open to fail-closed
- Geocoding failure now returns: "We could not verify this address. Please try again or contact ShiftFuel."
- Booking cannot proceed without a successful address validation

### Storage.js removed (Priority 8) — DONE
- Removed from `index.html` — Supabase is now the sole data store for bookings

### Caller tokens added to all API calls
- `admin.js`: `sendNotification`, `voidPaymentHold`, deny cancel/refund, adjustment refund — all pass `adminToken()`
- `worker.js`: `sendWorkerNotification`, `completeWorkerRequest` capture — all pass `SESSION_WORKER_TOKEN`
- `script.js`: `notify-area-workers` call now passes `request_id` for booking-flow verification

---

## Still needed before launch (requires further work)

### Priority 5 — Admin "Send to Customer for Payment" flow
- Add `pending_customer_payment` status handling in admin.js (replace "Complete request" button with "Send to Customer for Payment" for unpaid requests)
- Add customer-side payment card in track.js for `pending_customer_payment` status
- Create `api/customer-capture.js` endpoint that verifies via phone+email instead of session token
- Add `payment_needed` SMS event trigger when admin sends to customer

### Priority 3 — Tracker timeline verification
- Service-aware timeline was implemented in the previous session; verify on live data
- Confirm `pending_customer_payment` step appears in the timeline

### Priority 6 — Standardize remaining admin direct writes through RPCs
- Some admin actions still do direct `service_requests` updates; audit and convert to RPCs where feasible

### Closing the employees hash read gap (after SQL deploy)
- After confirming `supabase-worker-login.sql` is deployed and worker login works:
  - Drop the old `"Anyone can read employees"` policy on the `employees` table
  - Add a deny-all SELECT policy for anon (RPCs use SECURITY DEFINER and bypass RLS)
  - This fully prevents anon users from reading `worker_password_hash` / `worker_password_salt`

---

## Launch Testing Checklist (Priority 11)

- [ ] 1. New customer booking — fuel only
- [ ] 2. New customer booking — car wash only
- [ ] 3. New customer booking — fuel + car wash
- [ ] 4. Returning customer lookup
- [ ] 5. Returning customer delete vehicle
- [ ] 6. Address validation inside service area
- [ ] 7. Address validation outside service area
- [ ] 8. Address validation when geocoding fails (should now block, not pass)
- [ ] 9. Payment authorization at booking
- [ ] 10. Worker claim job
- [ ] 11. Worker pickup photos
- [ ] 12. Worker fuel receipt
- [ ] 13. Worker wash receipt
- [ ] 14. Worker unable-to-complete dropdown
- [ ] 15. Admin deny dropdown
- [ ] 16. Worker vehicle return
- [ ] 17. Worker final confirmation and payment capture
- [ ] 18. Admin send to customer for payment (not yet implemented)
- [ ] 19. Customer tracker final payment confirmation (not yet implemented)
- [ ] 20. Customer payment capture succeeds (not yet implemented)
- [ ] 21. Customer payment capture fails safely (not yet implemented)
- [ ] 22. Customer tracker in-progress section
- [ ] 23. Customer tracker completed section
- [ ] 24. Customer tracker denied section
- [ ] 25. SMS booking notification
- [ ] 26. SMS worker notification
- [ ] 27. SMS customer payment needed notification (not yet implemented)
- [ ] 28. SMS completion notification
- [ ] 29. Review prompt after completion
- [ ] 30. Attempt duplicate payment capture — should return `already_captured: true`, not error
- [ ] 31. Attempt unauthorized API call — should return 401/403
- [ ] 32. Attempt worker login without exposing password hashes — confirm network tab shows no hash/salt columns
