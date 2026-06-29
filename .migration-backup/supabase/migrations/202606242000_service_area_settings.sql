-- Database-backed service area so admins can edit the drive-time/drive-distance
-- booking boundary from the admin portal and have it take effect live (the
-- Vercel filesystem is read-only, so api/service-area.json can't be written in
-- production). Mirrors the service_pricing_settings singleton + RPC pattern.

begin;

create table if not exists public.service_area_settings (
  id int primary key,
  geometry jsonb,                       -- GeoJSON Polygon/MultiPolygon (null = use file/radius fallback)
  anchor_lat numeric,
  anchor_lon numeric,
  mode text not null default 'meters',  -- 'meters' (drive distance) | 'minutes' (drive time)
  contour_value numeric not null default 20,
  profile text not null default 'driving',
  generalize int not null default 500,
  last_updated_at timestamptz not null default now(),
  updated_by text,
  constraint service_area_settings_singleton check (id = 1)
);

insert into public.service_area_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.service_area_settings enable row level security;
-- No row-level policies intentionally: all reads/writes go through the
-- SECURITY DEFINER RPCs below (same approach as service_pricing_settings).
-- The serverless validator reads it with the service-role key, which bypasses RLS.

create or replace function public.public_get_service_area()
returns service_area_settings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row service_area_settings;
begin
  select * into v_row from service_area_settings where id = 1;
  return v_row;
end;
$$;

create or replace function public.admin_update_service_area(
  p_token text,
  p_geometry jsonb,
  p_anchor_lat numeric,
  p_anchor_lon numeric,
  p_mode text,
  p_contour_value numeric,
  p_profile text,
  p_generalize int
)
returns service_area_settings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session_valid boolean;
  v_row           service_area_settings;
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

  update service_area_settings set
    geometry        = p_geometry,
    anchor_lat      = p_anchor_lat,
    anchor_lon      = p_anchor_lon,
    mode            = coalesce(p_mode, 'meters'),
    contour_value   = p_contour_value,
    profile         = coalesce(p_profile, 'driving'),
    generalize      = coalesce(p_generalize, 500),
    last_updated_at = now(),
    updated_by      = 'admin'
  where id = 1
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.public_get_service_area() from public;
revoke all on function public.admin_update_service_area(text, jsonb, numeric, numeric, text, numeric, text, int) from public;
grant execute on function public.public_get_service_area() to anon;
grant execute on function public.admin_update_service_area(text, jsonb, numeric, numeric, text, numeric, text, int) to anon;

commit;
