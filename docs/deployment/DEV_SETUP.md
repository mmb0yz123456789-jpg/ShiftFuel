# DEV Setup

DEV should be isolated from production.

Expected DEV connections:

- Git branch: `dev`
- Vercel environment: Preview/DEV
- Supabase project: DEV project
- Stripe mode: test mode

DEV rules:

- Use fake or test data only.
- Do not import real customer records from PROD.
- Use Stripe test keys.
- Use DEV Supabase URL, anon key, and service role key in Vercel Preview env.
- Run migrations against DEV before promoting to PROD.

Manual checklist:

- Create or confirm the DEV Supabase project.
- Add DEV Supabase env vars to Vercel Preview.
- Add Stripe test env vars to Vercel Preview.
- Verify booking, tracking, admin, worker, and payment flows with test data.

