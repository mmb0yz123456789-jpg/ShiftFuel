# PROD Supabase

## Purpose

The PROD Supabase project backs Vercel Production deployments from the GitHub `main` branch. It must use Stripe live mode and production-safe configuration only.

## Required Routing

- GitHub branch: `main`
- Vercel environment: Production
- Supabase project: PROD
- Stripe mode: live

## Production Rules

Do not run DEV reset scripts, fake seed data, sandbox SQL, or one-off legacy patches against PROD. Do not alter production schema manually unless there is an approved production database change plan.

## Schema Changes

Production schema changes should come from reviewed files in `supabase/migrations/`. Confirm the same migration has already been validated against DEV before applying it to PROD.

## Secrets

Keep production Supabase service role keys, database passwords, Stripe live keys, webhook secrets, and VAPID private keys in Vercel or GitHub secret stores only. Never hardcode them in source files or documentation.
