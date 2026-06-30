# Supabase DEV

This folder is for DEV-only Supabase documentation and future seed/reset files.

Rules:

- Use a separate Supabase DEV project.
- Use test/non-customer data only.
- Do not copy real customer data from PROD into DEV.
- DEV can use reset scripts and seed data that would be unsafe in PROD.
- DEV Vercel preview deployments should point at the DEV Supabase URL and keys.
- DEV Stripe integration should use Stripe test mode keys only.

Current status:

- `sandbox-reset.sql` is a DEV-only reset helper.
- `seed-dev.sql` is a placeholder for future fake/test seed data.
- Existing migrations remain in `supabase/migrations/`.

Never run `sandbox-reset.sql` against the PROD Supabase project.
