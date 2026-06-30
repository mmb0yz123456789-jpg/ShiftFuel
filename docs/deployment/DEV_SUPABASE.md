# DEV Supabase

## Purpose

The DEV Supabase project is the sandbox database for Vercel Preview deployments from the GitHub `dev` branch. It must use Stripe test mode and fake test data only.

## Required Routing

- GitHub branch: `dev`
- Vercel environment: Preview
- Supabase project: DEV
- Stripe mode: test

## Allowed Data

Use fake customers, fake contact details, fake vehicles, fake worker records, and Stripe test-mode identifiers. Do not copy real customer, worker, payment, vehicle, photo, or applicant data into DEV.

## Schema Changes

Schema changes should still be authored as timestamped files in `supabase/migrations/`. Apply to DEV first, validate app flows, then promote the same migration files to PROD through the approved deployment path.

## DEV-Only Files

DEV reset and seed helpers belong outside the migration chain. `supabase/seed.sql` is reserved for fake DEV seed notes or fake DEV seed rows only.
