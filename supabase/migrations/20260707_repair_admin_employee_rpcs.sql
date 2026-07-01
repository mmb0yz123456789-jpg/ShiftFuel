-- Repair admin employee RPCs used by the live Workers tab.
-- Keeps worker listing independent from public employees_public access.

create or replace function public.admin_insert_employee(
  p_token uuid,
  p_data  jsonb
)
returns setof public.employees
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public._verify_admin(p_token) then
    raise exception 'Unauthorized';
  end if;

  return query
  insert into public.employees (
    employee_code,
    full_name,
    phone,
    email,
    active,
    home_location,
    started_at,
    worker_password_hash,
    worker_password_salt,
    password_updated_at,
    profile_updated_at
  )
  values (
    p_data->>'employee_code',
    p_data->>'full_name',
    p_data->>'phone',
    p_data->>'email',
    coalesce((p_data->>'active')::boolean, true),
    p_data->>'home_location',
    nullif(p_data->>'started_at', '')::date,
    p_data->>'worker_password_hash',
    p_data->>'worker_password_salt',
    nullif(p_data->>'password_updated_at', '')::timestamptz,
    now()
  )
  returning *;
end;
$$;

grant execute on function public.admin_insert_employee(uuid, jsonb) to anon, authenticated;

create or replace function public.admin_list_employees(p_token uuid)
returns setof jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public._verify_admin(p_token) then
    raise exception 'Unauthorized';
  end if;

  return query
    select to_jsonb(e) - array['worker_password_hash', 'worker_password_salt']
    from public.employees e
    order by e.full_name;
end;
$$;

grant execute on function public.admin_list_employees(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
