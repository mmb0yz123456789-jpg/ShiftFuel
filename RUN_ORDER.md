# SQL Deployment Run Order

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

## 5. `supabase-create-request.sql`
Ensures `public_track_request` includes support for `pending_customer_info` status.

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

- `track.html` line 71: replace `pk_test_51Tinn8H7...` with the live publishable key
- `script.js` line 2: replace `pk_test_51Tinn8H7...` with the live publishable key
- Vercel `STRIPE_SECRET_KEY`: replace with `sk_live_...`
