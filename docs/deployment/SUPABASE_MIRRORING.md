# Supabase DEV/PROD Mirroring

Goal:

Keep DEV and PROD schema aligned while keeping data and secrets separate.

Recommended approach:

- Treat `supabase/migrations/` as the shared schema source of truth.
- Apply migrations to DEV first.
- Verify app flows against DEV.
- Promote the same migration files to PROD after review.
- Keep DEV seed/reset scripts separate from shared migrations.
- Never copy real customer data from PROD to DEV.

What should be mirrored:

- Tables
- Columns
- Indexes
- RLS policies
- RPC functions
- Storage bucket definitions
- Storage policies
- Required extensions

What should not be mirrored directly:

- Real customer rows
- Real service request history
- Real payment identifiers
- Real saved payment methods
- Real worker/private personal data
- Service role keys or secrets

Open follow-up:

Decide whether GitHub Actions should have separate workflows/secrets for DEV and
PROD migrations, or whether DEV migrations should be applied manually until the
deployment process is fully settled.

