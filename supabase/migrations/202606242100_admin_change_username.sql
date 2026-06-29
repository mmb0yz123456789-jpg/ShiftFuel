-- Lets the logged-in admin change their own login username from Settings.
-- Mirrors admin_change_password: requires a valid session AND the current
-- password (so a stolen session alone can't change the login credentials).
-- Username is stored hashed in admin_config.admin_username_hash, same scheme as
-- the login check.

begin;

create or replace function public.admin_change_username(
  p_token text,
  p_current_password_hash text,
  p_new_username_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session_valid boolean;
  v_stored_pw     text;
begin
  select exists(
    select 1 from admin_sessions where id = p_token::uuid and expires_at > now()
  ) into v_session_valid;

  if not v_session_valid then
    raise exception 'INVALID_SESSION';
  end if;

  select value into v_stored_pw from admin_config where key = 'admin_password_hash';

  if v_stored_pw is null or p_current_password_hash <> v_stored_pw then
    raise exception 'INVALID_CURRENT_PASSWORD';
  end if;

  update admin_config set value = p_new_username_hash where key = 'admin_username_hash';

  return true;
end;
$$;

revoke all on function public.admin_change_username(text, text, text) from public;
grant execute on function public.admin_change_username(text, text, text) to anon;

commit;
