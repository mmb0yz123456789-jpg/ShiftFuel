-- ============================================================================
-- Worker payout ledger (Phase 1 of payroll payments)
--
-- The Payroll tab already CALCULATES what each worker earned per period. This
-- adds a record of what's actually been PAID, so an admin can mark a worker
-- paid (Manual / Zelle / Venmo / Cash / Bank) and see at a glance who is still
-- outstanding. Stripe Connect payouts (Phase 2) write into this same table with
-- method = 'stripe_connect' and a stripe_transfer_id, so there is a single
-- source of truth for "has this worker been paid for this period."
--
-- All access is through SECURITY DEFINER admin_* RPCs (admin token verified
-- against admin_sessions), mirroring admin_set_employee_time_rate etc. The
-- table has RLS enabled with NO anon policy, so the table is unreachable except
-- through these functions.
-- ============================================================================

begin;

create table if not exists public.worker_payouts (
  id                 uuid primary key default gen_random_uuid(),
  employee_id        uuid references public.employees(id) on delete set null,
  worker_name        text,
  period_key         text not null,                 -- e.g. 'week:2026-06-22' or 'month:2026-06-01'
  period_label       text,                          -- human label shown in the UI
  amount             numeric(10, 2) not null default 0 check (amount >= 0),
  method             text not null default 'manual',-- manual | zelle | venmo | cash | bank | stripe_connect
  reference          text,                          -- confirmation # / external reference
  stripe_transfer_id text,                          -- set by Phase 2 Connect payouts
  status             text not null default 'paid' check (status in ('paid', 'void')),
  notes              text,
  paid_at            timestamptz not null default now(),
  created_at         timestamptz not null default now()
);

alter table public.worker_payouts enable row level security;
-- No policies on purpose: only the SECURITY DEFINER RPCs below may touch it.

create index if not exists worker_payouts_period_idx   on public.worker_payouts (period_key);
create index if not exists worker_payouts_employee_idx on public.worker_payouts (employee_id);

-- ── Record a payment to a worker for a period ───────────────────────────────
create or replace function public.admin_record_payout(
  p_token        text,
  p_employee_id  uuid,
  p_worker_name  text,
  p_period_key   text,
  p_period_label text,
  p_amount       numeric,
  p_method       text,
  p_reference    text,
  p_notes        text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from admin_sessions where id = p_token::uuid and expires_at > now()) then
    raise exception 'INVALID_SESSION';
  end if;

  insert into public.worker_payouts
    (employee_id, worker_name, period_key, period_label, amount, method, reference, notes)
  values
    (p_employee_id, p_worker_name, p_period_key, p_period_label,
     coalesce(p_amount, 0),
     coalesce(nullif(p_method, ''), 'manual'),
     nullif(p_reference, ''),
     nullif(p_notes, ''))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.admin_record_payout(text, uuid, text, text, text, numeric, text, text, text) from public;
grant execute on function public.admin_record_payout(text, uuid, text, text, text, numeric, text, text, text) to anon;

-- ── List payouts (optionally scoped to one period) ──────────────────────────
create or replace function public.admin_list_payouts(
  p_token      text,
  p_period_key text default null
)
returns setof public.worker_payouts
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from admin_sessions where id = p_token::uuid and expires_at > now()) then
    raise exception 'INVALID_SESSION';
  end if;

  return query
    select *
    from public.worker_payouts
    where (p_period_key is null or period_key = p_period_key)
    order by paid_at desc;
end;
$$;

revoke all on function public.admin_list_payouts(text, text) from public;
grant execute on function public.admin_list_payouts(text, text) to anon;

-- ── Void a recorded payout (the "Undo" action) ──────────────────────────────
create or replace function public.admin_void_payout(
  p_token     text,
  p_payout_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from admin_sessions where id = p_token::uuid and expires_at > now()) then
    raise exception 'INVALID_SESSION';
  end if;

  update public.worker_payouts set status = 'void' where id = p_payout_id;
end;
$$;

revoke all on function public.admin_void_payout(text, uuid) from public;
grant execute on function public.admin_void_payout(text, uuid) to anon;

commit;
