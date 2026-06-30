# Legacy SQL Patches

This folder contains historical/manual `supabase-*.sql` patches that previously
lived at the repository root.

These files are reference material only. New database changes should go into
`supabase/migrations/` as reviewed timestamped migrations.

Before running any file from this folder manually, review it carefully for
destructive statements such as `DROP`, broad policy changes, reset logic, or
production-only assumptions.
