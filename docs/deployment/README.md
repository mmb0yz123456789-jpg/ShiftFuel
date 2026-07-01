# Deployment Documentation

This folder documents the intended DEV and PROD deployment split.

Target flow:

- Git `dev` branch -> Vercel Preview/DEV -> Supabase DEV -> Stripe test mode
- Git `main`/PROD branch -> Vercel Production -> Supabase PROD -> Stripe live mode

These docs are planning and operations references. They do not change runtime
behavior by themselves.

Related docs:

- `DEV_SETUP.md`
- `PROD_SETUP.md`
- `ENVIRONMENT_VARIABLES.md`
- `SUPABASE_MIRRORING.md`
- `GITHUB_ACTIONS_SUPABASE.md`
- `CLIENT_CONFIG_PLAN.md`
