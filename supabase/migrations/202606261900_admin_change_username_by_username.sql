-- Change-username now confirms the admin's CURRENT USERNAME instead of their
-- password. The "Change Username" form was labelled "Current Username" but the
-- old RPC checked the password hash, which was confusing. The admin is already
-- authenticated by a valid session; this just confirms they know their own
-- current login name before swapping it. (Parameter is renamed, so drop first —
-- Postgres won't rename a parameter via CREATE OR REPLACE.)

begin;

drop function if exists public.admin_change_username(text, text, text);

create or replace function public.admin_change_username(
  p_token                 text,
  p_current_username_hash text,
  p_new_username_hash     text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session_valid     boolean;
  v_stored_username   text;
begin
  select exists(
    select 1 from admin_sessions where id = p_token::uuid and expires_at > now()
  ) into v_session_valid;

  if not v_session_valid then
    raise exception 'INVALID_SESSION';
  end if;

  select value into v_stored_username from admin_config where key = 'admin_username_hash';

  if v_stored_username is null or p_current_username_hash <> v_stored_username then
    raise exception 'INVALID_CURRENT_USERNAME';
  end if;

  update admin_config set value = p_new_username_hash where key = 'admin_username_hash';

  return true;
end;
$$;

revoke all on function public.admin_change_username(text, text, text) from public;
grant execute on function public.admin_change_username(text, text, text) to anon;

commit;
