# SQL Deployment Run Order

> **Note:** These one-off SQL patches now live in [`archive/sql/`](archive/sql/) — they
> were applied manually (in the order below) before launch and are kept for history.
> Ongoing schema changes go through `supabase/migrations/`, which CI applies
> automatically on push to `main`. Filenames below refer to files in `archive/sql/`.

Run these files in the Supabase SQL Editor **in this exact order** before launch. Each file is safe to re-run.

---

## 1. `supabase-worker-login.sql`
Creates the `worker_login(p_identifier, p_password)` RPC (server-side SHA-256 password verification) and the `employees_public` security-barrier view that excludes password columns.

**After deploying:** confirm worker login works on the deployed site.  
**Note:** This file creates the `employees_public` view and a deny-all RLS policy. Step 6 (`supabase-advisor-security-cleanup.sql`) supersedes the deny-all policy with a more precise column-grant approach — run both files in order.

---

## 2. `supabase-request-rpc-fixes.sql`
Fixes a `::time` cast bug in `admin_update_request` that caused the deny action to fail.

---

## 3. `supabase-deny-fix.sql`
Secondary copy of the same `::time` cast fix. Safe to run after step 2.

---

## 4. `supabase-security-hardening.sql`
- Updates `public_booked_return_slots` to exclude `auto_reversed` requests from the booked-slots count
- Contains updated `public_track_request` RPC

---

## 5. `supabase-create-request.sql` _(superseded)_
Originally added the admin-create / customer-completion flow
(`admin_create_request`, `customer_complete_booking`) and ensured
`public_track_request` floats `pending_customer_info` requests to the top.
**Now consolidated into the tracked migration
`supabase/migrations/202606231400_create_request_booking_flow.sql`** (definitions
+ pinned `search_path` + grants in one place), so the archived copy was removed.

---

## 6. `supabase-advisor-security-cleanup.sql`
Fixes Supabase Advisor security findings:
- Converts `employees_public` from a Security Definer view to a `security_invoker` view + column-level grants (anon can read safe columns, never password hash/salt)
- Revokes `worker_create_session(uuid)` from anon/authenticated (was callable without password verification)
- Adds `SET search_path = public, pg_temp` to all SECURITY DEFINER functions that were missing it
- Replaces `WITH CHECK (true)` on `service_requests` INSERT with strict field validation
- Replaces `WITH CHECK (true)` on `photos` INSERT with photo_type allowlist
- Drops unused `quick_inspections` public policies

**Run after step 5.**

---

## 7. `supabase-portal-password-security.sql`
Adds server-side login lockout (3 failed attempts → 15-minute lock), `must_change_password` tracking, and two new RPCs:
- `worker_change_password_secure(token, current_password, new_password)` — server hashes; browser never sends hashes
- `admin_reset_worker_password(token, employee_id)` — server generates `SF-XXXX-XXXX-XXXX` temp password, sets `must_change_password = true`, returns it once

Also adds `failed_login_attempts`, `locked_until`, `last_login_at`, `must_change_password`, `password_reset_at` columns to `employees`, and creates `admin_lockout` table.

**Run after step 6.**

---

## 8. `supabase-fuel-prices.sql`
Creates `fuel_price_settings` table (single active row) and two RPCs:
- `public_get_fuel_prices()` — anon-readable; used by booking page
- `admin_update_fuel_prices(token, ...)` — admin-only manual price update

**Run after step 7. Then open Admin → Settings to enter current local prices.**

---

## 9. `supabase-key-return.sql`, `supabase-cancellation-return.sql`
Add the `key_returned_*` and cancellation/return-request columns to `service_requests`.

---

## 10. `supabase-production-rls-lockdown.sql`
Production RLS lockdown — run last, after every file above:
- Adds `admin_list_requests`, `worker_list_open_requests`, `worker_list_my_requests`,
  `admin_list_applicants` RPCs so the admin/worker dashboards no longer need a
  permissive anon SELECT policy on `service_requests` / `applicants`.
- Updates `admin_update_employee` to cascade name/phone/photo changes to open
  `service_requests` server-side (previously done with a direct anon UPDATE).
- Unifies the terminal/closed status list used by `public_booked_return_slots`,
  `public_cancel_request`, and the `one_active_request_per_slot` unique index.
- Drops the remaining permissive anon policies: `"Anyone can save employees"`,
  `"Anyone can save employee availability"`, `"Anyone can save employee days off"`,
  `"Anyone can read applicants"`, `"Anyone can update applicants"`,
  `"Anyone can read service requests"`, `"Anyone can update service requests"`.

**After deploying:** confirm admin dashboard loads requests/applicants, worker
dashboard loads open jobs and "My reviews", and that a logged-out browser
console (`window.ShiftFuelSupabase.from('service_requests').select('*')`)
returns 0 rows.

---

## 11. `supabase-booking-rpc-lockdown.sql`
Run after step 10. Booking creation now goes through `/api/payments`
(`action: create_authorized_booking`), which verifies the Stripe PaymentIntent
server-side and inserts with the service-role key. This drops the now-unused
`public_insert_service_request` anon INSERT policy — leaving it in place would
let anyone fabricate a `payment_status: 'authorized'` row without ever paying,
since RLS has no way to check a PaymentIntent against Stripe.

**After deploying:** run a full booking through the public site with a Stripe
test card (including the 3D Secure card `4000 0025 0000 3155`) and confirm the
request lands in the admin queue as `request_received` / `authorized`.

---

## 12. `supabase-returning-saved-options.sql`
Run after step 11. Creates soft-delete-only saved service address and saved
vehicle tables for returning customers, backfills them from historical
`service_requests` snapshots, and adds RPCs used by Book Now:
- `public_returning_customer_options(phone, email)`
- `public_add_saved_address(phone, email, data)`
- `public_add_saved_vehicle(phone, email, data)`
- `public_soft_delete_saved_address(address_id, phone, email)`
- `public_soft_delete_saved_vehicle(vehicle_id, phone, email)`
- `public_update_saved_address(address_id, phone, email, data)`
- `public_update_saved_vehicle(vehicle_id, phone, email, data)`

Deleting a saved option only sets `is_active = false` and `deleted_at = now()`;
it never modifies historical `service_requests`.

---

## 13. `supabase-pricing-audit-fields.sql`
Adds the internal pricing/payment-recovery audit columns to `service_requests`
(`base_fuel_service_fee`, `base_car_wash_service_fee`, `base_inspection_fee`,
`payment_operating_recovery_amount`, `displayed_fuel_service_fee`,
`displayed_car_wash_service_fee`, `displayed_inspection_fee`,
`actual_fuel_receipt_amount`, `actual_car_wash_receipt_amount`,
`net_target_amount`, `gross_total_before_rounding`, `rounded_customer_total`,
`authorized_amount`) and extends `admin_update_request` / `worker_update_request`
to accept them. These are admin-only — never shown to the customer. View them
in the admin dashboard under each request's "Pricing audit (admin only)"
details toggle.

**After deploying:** confirm a fresh booking populates `authorized_amount` and
that completing a receipt + capturing payment populates
`payment_operating_recovery_amount` / `rounded_customer_total` / `captured_amount`.

---

## 14. `supabase-track-single-field-search.sql`
Run after step 13. Updates `public_track_request` so Track My Vehicle search
accepts phone-only, email-only, or request/ticket-number-only lookups
(previously required phone+email together, or a request ID plus one matching
contact field).

**After deploying:** confirm tracking by phone number alone, by email alone,
and by request number alone each return the correct request(s).

---

## 15. `supabase-customer-cancellation-v2.sql`
Run after step 14. Adds the columns the new status-aware customer cancellation
workflow writes to: `cancellation_requested_at`, `cancelled_at`,
`cancellation_stripe_fee_amount`, `cancellation_receipt_total`,
`cancellation_total_charged`, `cancellation_status`,
`cancellation_requires_key_return`, `cancellation_key_returned_at`,
`cancellation_worker_notified_at`. Introduces two new status values used by
`/api/payments` `customer_cancel` and the new `worker_confirm_cancellation_return`
action: `cancelled` and `cancelled_pending_key_return` (plain text status
column — no constraint changes needed).

**After deploying:** cancel a test request at each of the 12 spec statuses
(request_received, accepted, key_received, vehicle_picked_up,
fueling_in_progress, car_wash_in_progress, service_in_progress,
partial_service_complete, vehicle_returned, complete, denied, cancelled) from
Track My Vehicle and confirm the fee/charge/status matches the spec, and that
a worker can confirm key/vehicle return on a `cancelled_pending_key_return`
job to flip it to `cancelled`.

---

## 16. `supabase-worker-job-visibility-fix.sql`
Run after step 15. Fixes two gaps found in a worker-dashboard audit:
`worker_list_open_requests` was missing `fueling_in_progress`,
`car_wash_in_progress`, `partial_service_complete`,
`cancelled_pending_key_return`, and `pending_customer_payment` from its
server-side status whitelist, so jobs in those statuses silently vanished
from the worker's job list. Also adds an `employees.active` check to
`worker_claim_request` so a deactivated worker can no longer claim new jobs
with a still-valid session token.

**After deploying:** confirm a job in `cancelled_pending_key_return` (or any
of the other previously-missing statuses) still shows up in the worker's job
list, and that a deactivated worker's claim attempt is rejected.

---

## Post-deploy verification

**Employees / security**
- [ ] `employees` base table is blocked for anon — run the verification query in `supabase-worker-login.sql` and confirm 0 rows returned
- [ ] `employees_public` view returns rows without `worker_password_hash` or `worker_password_salt` columns
- [ ] Worker login succeeds (no hash/salt visible in browser network tab)

**Booking / admin flow**
- [ ] Booking creates a request; no payment authorization until admin triggers it
- [ ] Admin deny action works (uses `admin_update_request` RPC, not direct write)
- [ ] Admin can set final total and notes (uses `admin_update_request` RPC)
- [ ] Worker completion sends request to `pending_customer_payment` status (no Stripe capture from worker)
- [ ] Admin "Send to Customer for Payment" sets `pending_customer_payment` status

**Customer payment**
- [ ] Customer tracker shows "Awaiting your payment" for `pending_customer_payment` status
- [ ] Customer can pay via tracker — Case A (existing pre-auth capture) works end-to-end
- [ ] Customer can pay via tracker — Case B (new card, `create-customer-final-payment`) works end-to-end
- [ ] Paying twice with the same new PI returns a safe error (not a double charge)
- [ ] If a pre-auth already exists, `create-customer-final-payment` rejects the request with `has_pre_auth: true`

**Error safety**
- [ ] If DB update fails after Stripe capture, customer sees "contact ShiftFuel" message with request ID
- [ ] Customer cancellation on tracker uses `public_cancel_request` RPC only — no direct DB writes
- [ ] Cancellation failure shows "Could not cancel this request. Please contact ShiftFuel."

**SMS / notifications**
- [ ] SMS/Twilio code is fully removed — no Twilio env vars needed and no calls are made
- [ ] "Automated text and email notifications coming soon." is visible on landing page

---

## Required Vercel environment variables

| Variable | Required for |
|---|---|
| `STRIPE_SECRET_KEY` | All payment endpoints |
| `SUPABASE_URL` | All API endpoints |
| `SUPABASE_SERVICE_ROLE_KEY` | All API endpoints |
| ~~`TWILIO_ACCOUNT_SID`~~ | SMS removed — not needed |
| ~~`TWILIO_AUTH_TOKEN`~~ | SMS removed — not needed |
| ~~`TWILIO_PHONE_NUMBER`~~ | SMS removed — not needed |
| `CRON_SECRET` | auto-reverse-payments job |

---

## Before going live — replace test Stripe keys

The active booking flow (`book.html` and `returning.html`) runs on
`booking-flow.js`, not `script.js`. `script.js` still contains a test key but
is not loaded by any current page — it is orphaned, not removed — so editing
it has no effect on the live site. Update the key in the two places it's
actually read:

- `booking-flow.js` (the `STRIPE_PUBLISHABLE_KEY` constant near the top of the
  file): replace `pk_test_51Tinn8H7...` with the live publishable key — this
  is what `book.html` and `returning.html` both use.
- `track.html` (the inline `window.SHIFTFUEL_STRIPE_PUBLISHABLE_KEY` script,
  read by `track.js`): replace `pk_test_51Tinn8H7...` with the live
  publishable key.
- Vercel `STRIPE_SECRET_KEY`: replace with `sk_live_...`
