-- ── Scheduled price updates ───────────────────────────────────────────────
--
-- Adds a pending_prices / prices_effective_at pair to both
-- fuel_price_settings and service_pricing_settings so admins can
-- schedule a price change for a future date. Prices are promoted lazily:
-- the next call to public_get_fuel_prices() or public_get_service_pricing()
-- after the effective date automatically applies the pending values.

begin;

-- ── fuel_price_settings ───────────────────────────────────────────────────

alter table public.fuel_price_settings
  add column if not exists pending_prices      jsonb,
  add column if not exists prices_effective_at timestamptz;

create or replace function public.public_get_fuel_prices()
returns fuel_price_settings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row fuel_price_settings;
begin
  select * into v_row from fuel_price_settings where id = 1;

  -- Lazy promotion: if a scheduled update is now due, apply it.
  if v_row.prices_effective_at is not null
     and v_row.prices_effective_at <= now()
     and v_row.pending_prices is not null then
    update fuel_price_settings set
      regular_price        = (v_row.pending_prices->>'regular_price')::numeric,
      midgrade_price       = (v_row.pending_prices->>'midgrade_price')::numeric,
      premium_price        = (v_row.pending_prices->>'premium_price')::numeric,
      diesel_price         = (v_row.pending_prices->>'diesel_price')::numeric,
      pending_prices       = null,
      prices_effective_at  = null,
      last_updated_at      = now()
    where id = 1
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

create or replace function public.admin_update_fuel_prices(
  p_token        uuid,
  p_regular      numeric,
  p_midgrade     numeric,
  p_premium      numeric,
  p_diesel       numeric,
  p_service_area text       default null,
  p_effective_at timestamptz default null
)
returns fuel_price_settings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session_valid boolean;
  v_row           fuel_price_settings;
begin
  select exists(
    select 1 from admin_sessions where id = p_token and expires_at > now()
  ) into v_session_valid;

  if not v_session_valid then
    raise exception 'INVALID_SESSION';
  end if;

  if p_effective_at is null or p_effective_at <= now() then
    -- Apply immediately.
    update fuel_price_settings set
      regular_price        = p_regular,
      midgrade_price       = p_midgrade,
      premium_price        = p_premium,
      diesel_price         = p_diesel,
      service_area_label   = coalesce(p_service_area, service_area_label),
      pending_prices       = null,
      prices_effective_at  = null,
      last_updated_at      = now(),
      updated_by           = 'admin'
    where id = 1
    returning * into v_row;
  else
    -- Store as pending; current prices unchanged.
    update fuel_price_settings set
      pending_prices = jsonb_build_object(
        'regular_price',  p_regular,
        'midgrade_price', p_midgrade,
        'premium_price',  p_premium,
        'diesel_price',   p_diesel
      ),
      prices_effective_at = p_effective_at,
      last_updated_at     = now(),
      updated_by          = 'admin'
    where id = 1
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.admin_update_fuel_prices(uuid, numeric, numeric, numeric, numeric, text, timestamptz) from public;
grant execute on function public.admin_update_fuel_prices(uuid, numeric, numeric, numeric, numeric, text, timestamptz) to anon;

-- ── service_pricing_settings ──────────────────────────────────────────────

alter table public.service_pricing_settings
  add column if not exists pending_prices      jsonb,
  add column if not exists prices_effective_at timestamptz;

create or replace function public.public_get_service_pricing()
returns service_pricing_settings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row service_pricing_settings;
begin
  select * into v_row from service_pricing_settings where id = 1;

  -- Lazy promotion: if a scheduled update is now due, apply it.
  if v_row.prices_effective_at is not null
     and v_row.prices_effective_at <= now()
     and v_row.pending_prices is not null then
    update service_pricing_settings set
      fuel_service_fee         = (v_row.pending_prices->>'fuel_service_fee')::numeric,
      wash_service_fee         = (v_row.pending_prices->>'wash_service_fee')::numeric,
      quick_inspection_fee     = (v_row.pending_prices->>'quick_inspection_fee')::numeric,
      wash_buff_shine_price    = (v_row.pending_prices->>'wash_buff_shine_price')::numeric,
      wash_shine_protect_price = (v_row.pending_prices->>'wash_shine_protect_price')::numeric,
      wash_shine_price         = (v_row.pending_prices->>'wash_shine_price')::numeric,
      wash_double_wash_price   = (v_row.pending_prices->>'wash_double_wash_price')::numeric,
      pending_prices           = null,
      prices_effective_at      = null,
      last_updated_at          = now()
    where id = 1
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

create or replace function public.admin_update_service_pricing(
  p_token                  text,
  p_fuel_service_fee       numeric,
  p_wash_service_fee       numeric,
  p_quick_inspection_fee   numeric,
  p_wash_buff_shine_price  numeric,
  p_wash_shine_protect_price numeric,
  p_wash_shine_price       numeric,
  p_wash_double_wash_price numeric,
  p_effective_at           timestamptz default null
)
returns service_pricing_settings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session_valid boolean;
  v_row           service_pricing_settings;
begin
  select exists(
    select 1 from admin_sessions where id = p_token::uuid and expires_at > now()
  ) into v_session_valid;

  if not v_session_valid then
    raise exception 'INVALID_SESSION';
  end if;

  if p_effective_at is null or p_effective_at <= now() then
    -- Apply immediately.
    update service_pricing_settings set
      fuel_service_fee         = p_fuel_service_fee,
      wash_service_fee         = p_wash_service_fee,
      quick_inspection_fee     = p_quick_inspection_fee,
      wash_buff_shine_price    = p_wash_buff_shine_price,
      wash_shine_protect_price = p_wash_shine_protect_price,
      wash_shine_price         = p_wash_shine_price,
      wash_double_wash_price   = p_wash_double_wash_price,
      pending_prices           = null,
      prices_effective_at      = null,
      last_updated_at          = now(),
      updated_by               = 'admin'
    where id = 1
    returning * into v_row;
  else
    -- Store as pending; current prices unchanged.
    update service_pricing_settings set
      pending_prices = jsonb_build_object(
        'fuel_service_fee',         p_fuel_service_fee,
        'wash_service_fee',         p_wash_service_fee,
        'quick_inspection_fee',     p_quick_inspection_fee,
        'wash_buff_shine_price',    p_wash_buff_shine_price,
        'wash_shine_protect_price', p_wash_shine_protect_price,
        'wash_shine_price',         p_wash_shine_price,
        'wash_double_wash_price',   p_wash_double_wash_price
      ),
      prices_effective_at = p_effective_at,
      last_updated_at     = now(),
      updated_by          = 'admin'
    where id = 1
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.admin_update_service_pricing(text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, timestamptz) from public;
grant execute on function public.admin_update_service_pricing(text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, timestamptz) to anon;

commit;
