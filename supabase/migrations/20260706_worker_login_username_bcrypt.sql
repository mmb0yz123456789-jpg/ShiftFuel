-- Restore username-or-phone worker login after the bcrypt password migration.
-- Existing workers still need a bcrypt temp password issued from the admin tab.

alter table public.employees
  add column if not exists username text,
  add column if not exists must_change_password boolean not null default false,
  add column if not exists password_reset_at timestamptz,
  add column if not exists failed_login_attempts integer not null default 0,
  add column if not exists locked_until timestamptz,
  add column if not exists last_login_at timestamptz;

create unique index if not exists employees_username_lower_unique
  on public.employees (lower(username))
  where username is not null and btrim(username) <> '';

create or replace function public.worker_login(
  p_identifier text,
  p_password   text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_employee     employees%rowtype;
  v_token        uuid;
  v_new_attempts int;
begin
  select * into v_employee
  from public.employees
  where active = true
    and (
      (username is not null and btrim(username) <> ''
        and lower(btrim(username)) = lower(btrim(p_identifier)))
      or (
        length(regexp_replace(coalesce(p_identifier, ''), '\D', '', 'g')) >= 7
        and regexp_replace(coalesce(phone, ''), '\D', '', 'g')
              = regexp_replace(coalesce(p_identifier, ''), '\D', '', 'g')
      )
    )
  limit 1;

  if not found
     or v_employee.worker_password_hash is null
     or left(v_employee.worker_password_hash, 2) <> '$2'
  then
    raise exception 'INVALID_CREDENTIALS';
  end if;

  if v_employee.locked_until is not null and v_employee.locked_until > now() then
    raise exception 'ACCOUNT_LOCKED';
  end if;

  if extensions.crypt(p_password, v_employee.worker_password_hash) <> v_employee.worker_password_hash then
    v_new_attempts := case
      when v_employee.locked_until is not null and v_employee.locked_until <= now() then 1
      else v_employee.failed_login_attempts + 1
    end;

    update public.employees
    set failed_login_attempts = v_new_attempts,
        locked_until = case when v_new_attempts >= 3 then now() + interval '15 minutes' else null end
    where id = v_employee.id;

    raise exception 'INVALID_CREDENTIALS';
  end if;

  update public.employees
  set failed_login_attempts = 0,
      locked_until          = null,
      last_login_at         = now()
  where id = v_employee.id;

  delete from public.worker_sessions where expires_at < now();

  insert into public.worker_sessions (employee_id, expires_at)
  values (v_employee.id, now() + interval '8 hours')
  returning id into v_token;

  return jsonb_build_object(
    'token',                v_token,
    'employee_id',          v_employee.id,
    'full_name',            v_employee.full_name,
    'must_change_password', v_employee.must_change_password
  );
end;
$$;

grant execute on function public.worker_login(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
