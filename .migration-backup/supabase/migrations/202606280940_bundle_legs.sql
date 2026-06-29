-- Fuel + Wash bundle, tunable per leg.
--
-- Replaces the single `combined_service_fee` with an explicit split the admin can
-- tune: the fuel leg and the wash leg each get their OWN bundled service fee AND
-- their own worker share. The customer's combined fee = bundle_fuel + bundle_wash;
-- the worker earns bundle_fuel_fee_share of the fuel leg + bundle_wash_fee_share of
-- the wash leg (instead of the normal per-fee shares) on any Fuel + Wash combo.
--
--   e.g. fuel $10 @ 20% worker + wash $10 @ 45% worker  ->  customer pays $20.
--
-- `combined_service_fee` (added 202606280930) is kept and updated to the sum so any
-- legacy reader still works, but pricing/payout now read the two leg columns.
-- Bundle is "on" when the two leg fees sum > 0 AND beat the two separate fees.
-- 0/0 = off (default). Read path unchanged: public_get_service_pricing SELECT *.

begin;

alter table public.service_pricing_settings
  add column if not exists bundle_fuel_service_fee numeric not null default 0,
  add column if not exists bundle_wash_service_fee numeric not null default 0,
  add column if not exists bundle_fuel_fee_share   numeric not null default 0.5,
  add column if not exists bundle_wash_fee_share    numeric not null default 0.5;

-- Seed the legs from any combined fee already set (split evenly), so an admin who
-- already configured a $20 combined bundle keeps it as $10 / $10 to retune.
update public.service_pricing_settings
  set bundle_fuel_service_fee = round(combined_service_fee / 2.0, 2),
      bundle_wash_service_fee = round(combined_service_fee - round(combined_service_fee / 2.0, 2), 2)
  where id = 1
    and combined_service_fee > 0
    and bundle_fuel_service_fee = 0
    and bundle_wash_service_fee = 0;

-- Recreate admin_update_service_pricing with the four new (optional) leg params.
-- Drop the prior 20-arg signature so PostgREST has one unambiguous candidate.
drop function if exists public.admin_update_service_pricing(
  text, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  timestamptz, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric);

create or replace function public.admin_update_service_pricing(
  p_token                    text,
  p_fuel_service_fee         numeric,
  p_wash_service_fee         numeric,
  p_quick_inspection_fee     numeric,
  p_wash_buff_shine_price    numeric,
  p_wash_shine_protect_price numeric,
  p_wash_shine_price         numeric,
  p_wash_double_wash_price   numeric,
  p_effective_at             timestamptz default null,
  p_per_mile_rate            numeric     default null,
  p_time_rate_per_min        numeric     default null,
  p_fuel_time_base_min       numeric     default null,
  p_fuel_time_per_gallon_min numeric     default null,
  p_wash_time_min            numeric     default null,
  p_wash_detour_free_miles   numeric     default null,
  p_wash_detour_rate         numeric     default null,
  p_fuel_fee_share           numeric     default null,
  p_wash_fee_share           numeric     default null,
  p_quick_care_fee_share     numeric     default null,
  p_combined_service_fee     numeric     default null,
  p_bundle_fuel_service_fee  numeric     default null,
  p_bundle_wash_service_fee  numeric     default null,
  p_bundle_fuel_fee_share    numeric     default null,
  p_bundle_wash_fee_share    numeric     default null
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

  -- Time-comp + share + bundle rates always apply immediately (not part of the
  -- scheduled fee flow).
  if p_effective_at is null or p_effective_at <= now() then
    update service_pricing_settings set
      fuel_service_fee         = p_fuel_service_fee,
      wash_service_fee         = p_wash_service_fee,
      quick_inspection_fee     = p_quick_inspection_fee,
      wash_buff_shine_price    = p_wash_buff_shine_price,
      wash_shine_protect_price = p_wash_shine_protect_price,
      wash_shine_price         = p_wash_shine_price,
      wash_double_wash_price   = p_wash_double_wash_price,
      per_mile_rate            = coalesce(p_per_mile_rate, per_mile_rate),
      time_rate_per_min        = coalesce(p_time_rate_per_min, time_rate_per_min),
      fuel_time_base_min       = coalesce(p_fuel_time_base_min, fuel_time_base_min),
      fuel_time_per_gallon_min = coalesce(p_fuel_time_per_gallon_min, fuel_time_per_gallon_min),
      wash_time_min            = coalesce(p_wash_time_min, wash_time_min),
      wash_detour_free_miles   = coalesce(p_wash_detour_free_miles, wash_detour_free_miles),
      wash_detour_rate         = coalesce(p_wash_detour_rate, wash_detour_rate),
      fuel_fee_share           = coalesce(p_fuel_fee_share, fuel_fee_share),
      wash_fee_share           = coalesce(p_wash_fee_share, wash_fee_share),
      quick_care_fee_share     = coalesce(p_quick_care_fee_share, quick_care_fee_share),
      combined_service_fee     = coalesce(p_combined_service_fee, combined_service_fee),
      bundle_fuel_service_fee  = coalesce(p_bundle_fuel_service_fee, bundle_fuel_service_fee),
      bundle_wash_service_fee  = coalesce(p_bundle_wash_service_fee, bundle_wash_service_fee),
      bundle_fuel_fee_share    = coalesce(p_bundle_fuel_fee_share, bundle_fuel_fee_share),
      bundle_wash_fee_share    = coalesce(p_bundle_wash_fee_share, bundle_wash_fee_share),
      pending_prices           = null,
      prices_effective_at      = null,
      last_updated_at          = now(),
      updated_by               = 'admin'
    where id = 1
    returning * into v_row;
  else
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
      per_mile_rate            = coalesce(p_per_mile_rate, per_mile_rate),
      time_rate_per_min        = coalesce(p_time_rate_per_min, time_rate_per_min),
      fuel_time_base_min       = coalesce(p_fuel_time_base_min, fuel_time_base_min),
      fuel_time_per_gallon_min = coalesce(p_fuel_time_per_gallon_min, fuel_time_per_gallon_min),
      wash_time_min            = coalesce(p_wash_time_min, wash_time_min),
      wash_detour_free_miles   = coalesce(p_wash_detour_free_miles, wash_detour_free_miles),
      wash_detour_rate         = coalesce(p_wash_detour_rate, wash_detour_rate),
      fuel_fee_share           = coalesce(p_fuel_fee_share, fuel_fee_share),
      wash_fee_share           = coalesce(p_wash_fee_share, wash_fee_share),
      quick_care_fee_share     = coalesce(p_quick_care_fee_share, quick_care_fee_share),
      combined_service_fee     = coalesce(p_combined_service_fee, combined_service_fee),
      bundle_fuel_service_fee  = coalesce(p_bundle_fuel_service_fee, bundle_fuel_service_fee),
      bundle_wash_service_fee  = coalesce(p_bundle_wash_service_fee, bundle_wash_service_fee),
      bundle_fuel_fee_share    = coalesce(p_bundle_fuel_fee_share, bundle_fuel_fee_share),
      bundle_wash_fee_share    = coalesce(p_bundle_wash_fee_share, bundle_wash_fee_share),
      prices_effective_at = p_effective_at,
      last_updated_at     = now(),
      updated_by          = 'admin'
    where id = 1
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.admin_update_service_pricing(
  text, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  timestamptz, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public;
grant execute on function public.admin_update_service_pricing(
  text, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  timestamptz, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) to anon;

commit;
