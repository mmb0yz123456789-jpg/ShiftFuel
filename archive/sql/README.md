# Archived SQL patches

Historical, manually-run SQL patches that were applied to the Supabase project
(mostly before launch). They are **not** applied automatically by CI and are
kept only for reference/history.

- The intended run order for the launch-critical ones is documented in
  [`../../RUN_ORDER.md`](../../RUN_ORDER.md).
- **New schema changes should go in `supabase/migrations/`** instead — that
  directory is applied automatically by the
  `.github/workflows/supabase-migrations.yml` action on push to `main`.

Each file is written to be safe to re-run.
