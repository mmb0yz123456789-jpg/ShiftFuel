# GitHub Actions Supabase Strategy

This project currently has Supabase migration workflows that read a single set
of GitHub repository secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_PROJECT_ID`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

For DEV/PROD separation, do not reuse one project secret set for both
environments.

Recommended target:

- GitHub environment `dev`
  - `SUPABASE_ACCESS_TOKEN`
  - `SUPABASE_PROJECT_ID` for the DEV Supabase project
  - `SUPABASE_DB_PASSWORD` for the DEV database
  - `SUPABASE_URL` for DEV
  - `SUPABASE_SERVICE_ROLE_KEY` for DEV
- GitHub environment `production`
  - `SUPABASE_ACCESS_TOKEN`
  - `SUPABASE_PROJECT_ID` for the PROD Supabase project
  - `SUPABASE_DB_PASSWORD` for the PROD database
  - `SUPABASE_URL` for PROD
  - `SUPABASE_SERVICE_ROLE_KEY` for PROD

Suggested migration flow:

- Pushes to `dev` apply migrations to Supabase DEV.
- Pushes to `main` apply migrations to Supabase PROD.
- Manual workflow dispatch should make the target environment obvious before
  running.

Safety rules:

- Test migrations against DEV before PROD.
- Do not put Supabase keys in source files.
- Do not use DEV reset or seed scripts in PROD workflows.
- Keep data copying out of migration workflows.

Current caution:

The workflow files have not yet been split into separate DEV and PROD jobs. This
document records the intended direction before changing automation behavior.
