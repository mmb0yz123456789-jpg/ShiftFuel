-- Promo codes: percentage or fixed-amount discounts applied to SERVICE FEES only
-- (never the at-cost fuel) at booking time. Codes can target all / new /
-- returning customers, with a per-customer cap, a total redemption cap, an
-- expiry window, and a minimum order amount.
--
-- Validation + redemption are SERVER-SIDE only (service-role key in /api). The
-- tables have RLS enabled with NO policies, so browsers can never enumerate
-- codes or self-grant a discount — a customer can't fake "new customer" pricing.

begin;

create table if not exists public.promo_codes (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null,
  description         text,
  discount_type       text not null check (discount_type in ('percent', 'fixed')),
  discount_value      numeric not null check (discount_value > 0),
  -- What the discount reduces. Locked to service fees for now (fuel is at cost),
  -- kept as a column so other modes can be added later without a schema change.
  applies_to          text not null default 'service_fees',
  audience            text not null default 'all' check (audience in ('all', 'new', 'returning')),
  min_order_amount    numeric not null default 0,
  per_customer_limit  integer not null default 1,   -- 0 = unlimited per customer
  max_redemptions     integer,                       -- null = unlimited total
  redemption_count    integer not null default 0,
  starts_at           timestamptz,
  expires_at          timestamptz,
  active              boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Case-insensitive uniqueness: "NEW20" and "new20" are the same code.
create unique index if not exists promo_codes_code_upper_idx
  on public.promo_codes (upper(code));

create table if not exists public.promo_redemptions (
  id              uuid primary key default gen_random_uuid(),
  promo_code_id   uuid not null references public.promo_codes(id) on delete cascade,
  request_id      uuid references public.service_requests(id) on delete set null,
  customer_phone  text,
  customer_email  text,
  discount_amount numeric not null default 0,
  redeemed_at     timestamptz not null default now()
);

create index if not exists promo_redemptions_code_idx
  on public.promo_redemptions (promo_code_id);
create index if not exists promo_redemptions_contact_idx
  on public.promo_redemptions (customer_phone, customer_email);

-- The applied code + computed discount are stamped on the booking so the final
-- capture (which recomputes from actual fuel + fees) re-applies the same amount.
alter table public.service_requests
  add column if not exists promo_code text,
  add column if not exists promo_discount numeric not null default 0;

-- Lock the tables to the service role. No public policies on purpose.
alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;

commit;
