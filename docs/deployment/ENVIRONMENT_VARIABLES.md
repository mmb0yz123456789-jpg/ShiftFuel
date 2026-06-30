# Environment Variables

Do not hardcode secrets in source files.

Server-side variables currently used by the project:

- `SUPABASE_URL`
- `SUPABASE_PUBLIC_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_PUBLIC_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_PUBLISHABLE_KEY`
- `SHIFTFUEL_STRIPE_PUBLISHABLE_KEY`
- `CRON_SECRET`
- `MAPBOX_PUBLIC_TOKEN`
- `MAPBOX_TOKEN`
- `MAPBOX_ACCESS_TOKEN`
- `SHIFTFUEL_MAPBOX_TOKEN`
- `MAPBOX_REFERER`
- `VERCEL_ENV`
- `ALLOW_VERCEL_PREVIEWS`
- `CHECKR_API_KEY`
- `CHECKR_PACKAGE`
- `CHECKR_WORK_STATE`
- `CHECKR_WEBHOOK_SECRET`
- `GPS_STALE_SECONDS`
- `GPS_RENUDGE_SECONDS`
- `ISSUING_BILLING_LINE1`
- `ISSUING_BILLING_CITY`
- `ISSUING_BILLING_STATE`
- `ISSUING_BILLING_POSTAL`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`

GitHub Actions variables currently used by Supabase migration workflows:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_ID`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Desired DEV Vercel setup:

- `SUPABASE_URL` = DEV Supabase URL
- `SUPABASE_ANON_KEY` = DEV anon key for generated browser runtime config
- `SUPABASE_SERVICE_ROLE_KEY` = DEV service role key
- `STRIPE_SECRET_KEY` = Stripe test secret key
- `STRIPE_PUBLISHABLE_KEY` = Stripe test publishable key for generated browser runtime config
- `VITE_APP_ENV` = `dev`

Desired PROD Vercel setup:

- `SUPABASE_URL` = PROD Supabase URL
- `SUPABASE_ANON_KEY` = PROD anon key for generated browser runtime config
- `SUPABASE_SERVICE_ROLE_KEY` = PROD service role key
- `STRIPE_SECRET_KEY` = Stripe test/sandbox secret key for now
- `STRIPE_PUBLISHABLE_KEY` = Stripe test/sandbox publishable key for generated browser runtime config for now
- `VITE_APP_ENV` = `prod`

Temporary production Stripe note:

Production Vercel currently uses PROD Supabase but Stripe test/sandbox mode.
Do not switch Production Vercel to Stripe live keys until live payments are
explicitly approved.

Current behavior:

The browser app reads public Supabase, Stripe, and Mapbox values from the
generated `runtime-config.js`. Server-only secrets must remain in Vercel or
GitHub secret stores and must not be included in browser runtime config.
