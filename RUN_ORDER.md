# SQL Deployment Run Order

Run these files in the Supabase SQL Editor **in this exact order** before launch. Each file is safe to re-run.

---

## 1. `supabase-worker-login.sql`
Creates the `worker_login(p_identifier, p_password)` RPC (server-side SHA-256 password verification) and the `employees_public` security-barrier view that excludes password columns.

**After deploying:** confirm worker login works on the deployed site.  
**Then (optional hardening):** drop the old anon SELECT policy on `employees` to fully block hash reads — instructions are inside the SQL file.

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

- [ ] Worker login succeeds (no hash/salt visible in browser network tab)
- [ ] Booking creates a request and notifies area workers
- [ ] Admin deny action works
- [ ] Admin "Send to Customer for Payment" sets status to `pending_customer_payment`
- [ ] Customer tracker shows "Awaiting your payment" step
- [ ] Customer can pay via tracker (Case A: pre-auth capture; Case B: new card)
- [ ] Completion SMS fires after customer payment
- [ ] `employees` table hash read is blocked for anon role (after dropping old policy)

---

## Required Vercel environment variables

| Variable | Required for |
|---|---|
| `STRIPE_SECRET_KEY` | All payment endpoints |
| `SUPABASE_URL` | All API endpoints |
| `SUPABASE_SERVICE_ROLE_KEY` | All API endpoints |
| `TWILIO_ACCOUNT_SID` | SMS endpoints |
| `TWILIO_AUTH_TOKEN` | SMS endpoints |
| `TWILIO_PHONE_NUMBER` | SMS endpoints |
| `CRON_SECRET` | auto-reverse-payments job |

---

## Before going live — replace test Stripe keys

- `track.html` line 71: replace `pk_test_51Tinn8H7...` with the live publishable key
- `script.js` line 2: replace `pk_test_51Tinn8H7...` with the live publishable key
- Vercel `STRIPE_SECRET_KEY`: replace with `sk_live_...`
