# PROD Setup

PROD should remain stable and protected.

Expected PROD connections:

- Git branch: `main` or production branch
- Vercel environment: Production
- Supabase project: PROD project
- Stripe mode: live mode

PROD rules:

- Use production Supabase URL, anon key, and service role key only in Production.
- Use Stripe live keys only in Production.
- Do not run DEV reset or seed scripts against PROD.
- Promote migrations only after they have been tested in DEV.
- Keep secrets in Vercel/GitHub environment settings, never in source files.

Manual checklist:

- Confirm Vercel Production env vars point to PROD.
- Confirm GitHub migration secrets point to the intended PROD project.
- Verify Supabase backups before risky schema changes.
- Verify booking, tracking, admin, worker, payment, and cron flows after deploy.

