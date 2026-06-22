-- Adds a database-backed settings table for service fees and car wash package
-- prices, mirroring the existing fuel_price_settings pattern, so admins can
-- edit them from the Services page instead of relying on hardcoded constants.

begin;

create table if not exists public.service_pricing_settings (
  id int primary key,
  fuel_service_fee numeric not null default 15,
  wash_service_fee numeric not null default 15,
  quick_inspection_fee numeric not null default 5,
  wash_buff_shine_price numeric not null default 27,
  wash_shine_protect_price numeric not null default 20,
  wash_shine_price numeric not null default 16,
  wash_double_wash_price numeric not null default 12,
  last_updated_at timestamptz not null default now(),
  updated_by text,
  constraint service_pricing_settings_singleton check (id = 1)
);

insert into public.service_pricing_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.service_pricing_settings enable row level security;
-- No row-level policies are defined intentionally: all reads/writes go
-- through the SECURITY DEFINER RPC functions below, same as fuel_price_settings.

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
  return v_row;
end;
$$;

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
    select 1 from admin_sessions where id = p_token and expires_at > now()
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

revoke all on function public.public_get_service_pricing() from public;
revoke all on function public.admin_update_service_pricing(text, numeric, numeric, numeric, numeric, numeric, numeric, numeric) from public;
grant execute on function public.public_get_service_pricing() to anon;
grant execute on function public.admin_update_service_pricing(text, numeric, numeric, numeric, numeric, numeric, numeric, numeric) to anon;

commit;
