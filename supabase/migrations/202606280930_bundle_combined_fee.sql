-- Fuel + Wash bundle: a single combined service fee charged when a customer books
-- BOTH fuel and a car wash together, instead of the fuel fee + wash fee separately.
--
-- Stored as a dollar amount. 0 = bundle OFF (customers pay the two fees as before),
-- so this is safe to deploy before any UI/pricing change. When set and it beats the
-- two fees added up, the booking + server scale the two base service fees down so
-- they sum to this combined fee (keeps every downstream split — card recovery, time
-- charge, per-fee worker share — working unchanged; the worker shares the discount
-- proportionally). The "Save X%" badge = 1 − combined ÷ (fuel fee + wash fee).
--
-- Read path is unchanged: public_get_service_pricing returns the whole row (SELECT *),
-- so booking-flow.js / admin.js / api pick this column up automatically.

begin;

alter table public.service_pricing_settings
  add column if not exists combined_service_fee numeric not null default 0;

-- Recreate admin_update_service_pricing with the new (optional) combined-fee param.
-- Drop the prior 19-arg signature so PostgREST has one unambiguous candidate.
drop function if exists public.admin_update_service_pricing(
  text, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  timestamptz, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric);

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
  p_combined_service_fee     numeric     default null
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
  numeric, numeric, numeric, numeric) from public;
grant execute on function public.admin_update_service_pricing(
  text, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  timestamptz, numeric, numeric, numeric, numeric, numeric, numeric, numeric,
  numeric, numeric, numeric, numeric) to anon;

commit;
