# Archived SQL patches

Historical, manually run SQL patches that were applied to the Supabase project, mostly before launch. They are not applied automatically by CI and are kept only for reference/history.

- Prefer the timestamped files in `../../supabase/migrations/` for the current migration history.
- New schema changes should go in `supabase/migrations/`; that directory is applied automatically by the `.github/workflows/supabase-migrations.yml` action on push to `main`.

Each file is written to be safe to re-run.
