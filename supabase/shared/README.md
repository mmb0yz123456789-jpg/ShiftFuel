# Supabase Shared

This folder is reserved for shared Supabase documentation and future organization
of schema-related reference material.

Current source of truth:

- `supabase/migrations/` remains the authoritative migration history.
- Legacy root-level `supabase-*.sql` files have been moved under
  `supabase/shared/legacy-patches/` for reference only.
- Historical SQL files in `archive/sql/` remain historical reference.

Future subfolders may include:

- `policies/` - RLS policy documentation
- `storage/` - bucket and storage policy documentation
- `functions/` - RPC/function documentation
- `legacy-patches/` - old manual SQL patches kept for reference only
