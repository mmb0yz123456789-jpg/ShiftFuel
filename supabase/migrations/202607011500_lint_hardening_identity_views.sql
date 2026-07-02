-- ============================================================
-- ShiftFuel — Lint hardening: customer-identity views + unpinned search_paths
--
-- Clears the findings from the 2026-07-01 PROD Supabase linter export that are
-- NOT by-design:
--
--   1) security_definer_view (ERROR 0010) x4 — the customer-identity QA/backfill
--      views shipped in 202607011300 + 202607011330 were created as plain
--      `create or replace view` (no security_invoker) and never had their anon
--      grant revoked. They aggregate customer PII (phone digits, normalized
--      emails, customer_ids, duplicate groups), so under Supabase's default
--      public-schema grants anon/authenticated can read them via PostgREST,
--      bypassing the querying role's RLS. Same leak class as employees_public
--      (see 20260709_gate_employees_public_view.sql). Nothing public reads these
--      — they're admin/QA only, queried via SECURITY DEFINER admin RPCs (which
--      run as the function owner) or service_role — so the fix is just:
--        - REVOKE SELECT from anon, authenticated  (close the read path)
--        - SET security_invoker = on               (clear lint 0010)
--      No replacement RPC needed. Internal definer/service_role readers are
--      unaffected: they bypass the invoker's RLS as owner/service_role.
--
--   2) function_search_path_mutable (WARN 0011) x9 — pin search_path on the
--      flagged helpers. The saved_*_key / canonical_request_status /
--      set_booking_stage_timestamp functions (newest code) genuinely lack it;
--      admin_login/customer_login are already pinned in repo migrations, so if
--      they still flag in PROD it means the 2026-06-27 hardening batch is not
--      applied there — this re-pins them harmlessly and is a no-op if it is.
--      Loop over pg_proc by name so every overload is covered.
--
-- Idempotent + safe on DEV and PROD.
-- ============================================================

begin;

-- 1) Customer-identity views: revoke anon read + flip to security_invoker.
do $$
declare
  v text;
begin
  foreach v in array array[
    'customer_identity_conflicts',
    'unclaimed_customer_history',
    'customer_identity_qa_conflicts',
    'customer_identity_qa_summary'
  ]
  loop
    if exists (
      select 1 from pg_views where schemaname = 'public' and viewname = v
    ) then
      execute format('revoke select on public.%I from anon, authenticated', v);
      execute format('alter view public.%I set (security_invoker = on)', v);
    end if;
  end loop;
end $$;

-- 2) Pin search_path on the flagged functions (all overloads).
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'admin_login',
        'customer_login',
        'saved_vehicle_color_key',
        'saved_vehicle_plate_key',
        'saved_address_text_key',
        'saved_address_state_key',
        'saved_address_zip_key',
        'canonical_request_status',
        'set_booking_stage_timestamp'
      )
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
  end loop;
end $$;

commit;

notify pgrst, 'reload schema';

-- ── Verification ─────────────────────────────────────────────────────────────
-- 1) As anon / from the client, each view now denies:
--      select * from public.customer_identity_qa_conflicts;  -- permission denied
-- 2) Admin identity tooling still works (admin_customer_identity_lookup /
--    admin_customer_identity_action run as owner and read the views fine).
-- 3) Lint 0010 (security_definer_view) shows 0 rows.
-- 4) Lint 0011 (function_search_path_mutable) shows 0 rows for the 9 functions.
