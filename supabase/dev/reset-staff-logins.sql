-- ============================================================
-- ShiftFuel — DEV STAFF LOGIN RESET
--
-- Run ONLY in the DEV / sandbox Supabase SQL editor.
-- Do NOT run this in production.
--
-- Resets:
--   Admin username: admin
--   Admin password: ShiftFuelDev2026!
--   Active worker password: WorkerDev2026!
--
-- Notes:
--   Admin login sends SHA-256(username/password) from the browser.
--   Admin password storage is bcrypt(SHA-256(password)).
--   Worker login sends plaintext to worker_login(), which verifies bcrypt.
-- ============================================================

begin;

-- Admin reset.
insert into public.admin_config (key, value)
values
  (
    'admin_username_hash',
    encode(extensions.digest('admin', 'sha256'), 'hex')
  ),
  (
    'admin_password_hash',
    extensions.crypt(
      encode(extensions.digest('ShiftFuelDev2026!', 'sha256'), 'hex'),
      extensions.gen_salt('bf', 10)
    )
  )
on conflict (key) do update
set value = excluded.value;

-- Clear admin lockout/session state.
update public.admin_lockout
   set failed_attempts = 0,
       locked_until = null
 where id = 1;

delete from public.admin_sessions;

-- Reset every active worker to the same DEV password.
update public.employees
   set worker_password_hash = extensions.crypt('WorkerDev2026!', extensions.gen_salt('bf', 10)),
       worker_password_salt = null,
       must_change_password = true,
       password_reset_at = now(),
       failed_login_attempts = 0,
       locked_until = null
 where active = true;

delete from public.worker_sessions;

commit;

notify pgrst, 'reload schema';

-- Confirm the active workers you can now log in as.
select
  full_name,
  username,
  phone,
  must_change_password,
  left(worker_password_hash, 4) as password_hash_format
from public.employees
where active = true
order by full_name;
