-- Adds a way for the logged-in admin to change their own password from the
-- Settings page. Mirrors the existing admin_create_session hashing scheme
-- (SHA-256 hex of the plaintext, hashed client-side, compared server-side
-- against admin_config) — no new hashing scheme introduced.

begin;

create or replace function public.admin_change_password(
  p_token text,
  p_current_password_hash text,
  p_new_password_hash text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session_valid boolean;
  v_stored_hash    text;
begin
  select exists(
    select 1 from admin_sessions where id = p_token::uuid and expires_at > now()
  ) into v_session_valid;

  if not v_session_valid then
    raise exception 'INVALID_SESSION';
  end if;

  select value into v_stored_hash from admin_config where key = 'admin_password_hash';

  if v_stored_hash is null or p_current_password_hash <> v_stored_hash then
    raise exception 'INVALID_CURRENT_PASSWORD';
  end if;

  update admin_config set value = p_new_password_hash where key = 'admin_password_hash';

  return true;
end;
$$;

revoke all on function public.admin_change_password(text, text, text) from public;
grant execute on function public.admin_change_password(text, text, text) to anon;

commit;
