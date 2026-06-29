-- Time-based compensation + car-wash detour pay.
--
-- Adds admin-editable rates to service_pricing_settings (company base) and a
-- per-employee override rate on employees. All default to your agreed numbers, but
-- the client GATES every charge/payout on time_rate_per_min: if it's 0, nothing
-- changes. So this migration is safe to run before the UI is wired.
--
--   time_rate_per_min        $/min charged to the customer (baked into the service
--                            fee, uniform for all customers).
--   fuel_time_base_min       fixed minutes per fuel stop.
--   fuel_time_per_gallon_min minutes added per gallon.
--   wash_time_min            flat minutes per car wash.
--   wash_detour_free_miles   first N round-trip miles to the wash are free.
--   wash_detour_rate         $/mile beyond the free miles (mirrors the gas detour).
--
-- employees.time_rate_per_min: what THAT worker earns per service-minute (out of the
-- company rate; company keeps the difference). NULL = use the company rate.

begin;

alter table public.service_pricing_settings
  add column if not exists time_rate_per_min        numeric not null default 0.50,
  add column if not exists fuel_time_base_min        numeric not null default 3,
  add column if not exists fuel_time_per_gallon_min  numeric not null default 0.5,
  add column if not exists wash_time_min             numeric not null default 20,
  add column if not exists wash_detour_free_miles    numeric not null default 5,
  add column if not exists wash_detour_rate          numeric not null default 0.725;

alter table public.employees
  add column if not exists time_rate_per_min numeric;

-- Replace admin_update_service_pricing to also accept the time-comp rates. Drop the
-- prior signature first so PostgREST has a single, unambiguous candidate.
drop function if exists public.admin_update_service_pricing(text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, timestamptz, numeric);

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
  p_wash_detour_rate         numeric     default null
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

  -- Time-comp rates always apply immediately (not part of the scheduled fee flow).
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
      prices_effective_at = p_effective_at,
      last_updated_at     = now(),
      updated_by          = 'admin'
    where id = 1
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

revoke all on function public.admin_update_service_pricing(text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, timestamptz, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public;
grant execute on function public.admin_update_service_pricing(text, numeric, numeric, numeric, numeric, numeric, numeric, numeric, timestamptz, numeric, numeric, numeric, numeric, numeric, numeric, numeric) to anon;

-- Set a single worker's per-minute time rate (NULL clears it → company rate).
create or replace function public.admin_set_employee_time_rate(
  p_token       text,
  p_employee_id uuid,
  p_rate        numeric
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
  update public.employees set time_rate_per_min = p_rate where id = p_employee_id;
end;
$$;

revoke all on function public.admin_set_employee_time_rate(text, uuid, numeric) from public;
grant execute on function public.admin_set_employee_time_rate(text, uuid, numeric) to anon;

commit;
