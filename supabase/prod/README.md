# Supabase PROD

This folder is for PROD-only Supabase documentation and operational notes.

Rules:

- PROD must use the production Supabase project.
- PROD must use Stripe live mode keys.
- Never run sandbox reset scripts against PROD.
- Never seed fake DEV data into PROD.
- Schema changes should flow through reviewed migrations in
  `supabase/migrations/`.
- PROD-only notes should document manual operational steps, not secrets.

Current status:

- No PROD-only SQL files have been added.
- Existing migrations remain in `supabase/migrations/`.

