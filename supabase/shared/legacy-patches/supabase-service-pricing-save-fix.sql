-- Fix service pricing save failure:
--   operator does not exist: uuid = text
--
-- Run this in the Supabase SQL Editor if the service pricing migration was
-- already applied before the token cast fix.

begin;

create or replace function public.admin_update_service_pricing(
  p_token text,
  p_fuel_service_fee numeric,
  p_wash_service_fee numeric,
  p_quick_inspection_fee numeric,
  p_wash_buff_shine_price numeric,
  p_wash_shine_protect_price numeric,
  p_wash_shine_price numeric,
  p_wash_double_wash_price numeric
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
    select 1
    from admin_sessions
    where id = p_token::uuid
      and expires_at > now()
  ) into v_session_valid;

  if not v_session_valid then
    raise exception 'INVALID_SESSION';
  end if;

  update service_pricing_settings set
    fuel_service_fee         = p_fuel_service_fee,
    wash_service_fee         = p_wash_service_fee,
    quick_inspection_fee     = p_quick_inspection_fee,
    wash_buff_shine_price    = p_wash_buff_shine_price,
    wash_shine_protect_price = p_wash_shine_protect_price,
    wash_shine_price         = p_wash_shine_price,
    wash_double_wash_price   = p_wash_double_wash_price,
    last_updated_at          = now(),
    updated_by               = 'admin'
  where id = 1
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.admin_update_service_pricing(text, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public;
grant execute on function public.admin_update_service_pricing(text, numeric, numeric, numeric, numeric, numeric, numeric, numeric) to anon;

notify pgrst, 'reload schema';

commit;
