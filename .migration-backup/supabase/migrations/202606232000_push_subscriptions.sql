-- Web Push subscriptions for worker + customer notifications.
-- Subscriptions are written/read server-side only (api/push.js via the service
-- role), so RLS stays closed to anon. Workers link by employee_id; customers
-- link by the phone/email they track with.
-- Idempotent and safe to re-run.

begin;

create extension if not exists pgcrypto;

create table if not exists public.push_subscriptions (
  id             uuid primary key default gen_random_uuid(),
  endpoint       text not null unique,
  p256dh         text not null,
  auth           text not null,
  subscriber_type text not null check (subscriber_type in ('worker', 'customer')),
  employee_id    uuid references public.employees(id) on delete cascade,
  customer_phone text,
  customer_email text,
  created_at     timestamptz not null default now(),
  last_seen_at   timestamptz not null default now()
);

create index if not exists push_subscriptions_employee_idx
  on public.push_subscriptions (employee_id) where employee_id is not null;
create index if not exists push_subscriptions_customer_idx
  on public.push_subscriptions (customer_phone, customer_email);

alter table public.push_subscriptions enable row level security;
-- No policies: only the service role (server) touches this table.

commit;
