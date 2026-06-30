# ShiftFuel Concierge

Static frontend and Vercel serverless API for ShiftFuel Concierge, backed by Supabase and Stripe.

## Project Layout

- `index.html`, `book.html`, `track.html`, `returning.html`: customer-facing pages.
- `worker-login.html`, `worker.html`: worker portal.
- `admin-login.html`, `admin.html`: admin portal.
- `api/`: Vercel serverless functions.
- `supabase/migrations/`: Supabase migrations applied by GitHub Actions.
- `supabase/shared/legacy-patches/`: historical/manual SQL patches kept for reference only.
- `supabase/dev/`: DEV-only Supabase notes, reset helpers, and seed placeholders.
- `supabase/prod/`: PROD-only Supabase notes.
- `archive/sql/`: older historical SQL patch copies kept for reference only.

## Local Setup

Install dependencies:

```sh
npm install
```

Environment variables are loaded from local Vercel/Supabase configuration. Keep `.env*` and `.vercel/` out of commits.

## Checks

Run Playwright checks when a Playwright config is present:

```sh
npm run test:e2e
```

There is currently no separate unit-test script.

## Database Changes

New database changes should be added to `supabase/migrations/`. The `.github/workflows/supabase-migrations.yml` workflow applies those migrations on pushes to `main` and can also be run manually.

Files under `supabase/shared/legacy-patches/` and `archive/sql/` are historical/manual patches and should not be treated as the current migration path.
