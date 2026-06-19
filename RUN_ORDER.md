# SQL Deployment Run Order

Run these files in the Supabase SQL Editor **in this exact order** before launch. Each file is safe to re-run.

---

## 1. `supabase-worker-login.sql`
Creates the `worker_login(p_identifier, p_password)` RPC (server-side SHA-256 password verification) and the `employees_public` security-barrier view that excludes password columns.

**After deploying:** confirm worker login works on the deployed site.  
**Required hardening (not optional):** the file now includes `DROP POLICY "Anyone can read employees"` and a deny-all replacement. Run the full file — this is required before going live.

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
