-- Make the gas-station distance surcharge rate ($/extra round-trip mile) an
-- admin-editable price, shown in the Services tab next to the quick inspection
-- fee. Default $0.75. The rate applies immediately (it is not part of the
-- scheduled pending_prices flow). Booked tickets keep their frozen surcharge.

begin;

alter table public.service_pricing_settings
  add column if not exists per_mile_rate numeric not null default 0.75;

-- Replace admin_update_service_pricing with a per_mile_rate parameter. Drop the
-- prior signatures first so PostgREST has a single, unambiguous candidate.
drop function if exists public.admin_update_service_pricing(text, numeric, numeric, numeric, numeric, numeric, numeric, numeric);
drop function if exists public.admin_update_service_pricing(text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, timestamptz);

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
  p_per_mile_rate            numeric     default null
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
      per_mile_rate            = coalesce(p_per_mile_rate, per_mile_rate),
      pending_prices           = null,
      prices_effective_at      = null,
      last_updated_at          = now(),
      updated_by               = 'admin'
    where id = 1
    returning * into v_row;
  else
    -- Store fees as pending; per-mile rate still applies immediately.
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
      per_mile_rate       = coalesce(p_per_mile_rate, per_mile_rate),
      prices_effective_at = p_effective_at,
      last_updated_at     = now(),
      updated_by          = 'admin'
    where id = 1
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.admin_update_service_pricing(text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, timestamptz, numeric) from public;
grant execute on function public.admin_update_service_pricing(text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, timestamptz, numeric) to anon;

commit;
