-- ============================================================
-- ShiftFuel — CRITICAL: drop worker_create_session (worker auth bypass)
--
-- worker_create_session(p_employee_id uuid) is SECURITY DEFINER and was granted
-- to anon. It minted a valid 8-hour worker session token from just an employee
-- id — with NO password. employees_public (also anon-readable) exposes employee
-- ids, so anyone holding the public anon key could:
--
--     SELECT id FROM employees_public   →   rpc worker_create_session(<id>)
--        →   a full worker session: every customer's address, key-handoff
--            details, phone/email, live GPS, and the ability to claim/update jobs.
--
-- It is unused by any client (worker.js / worker-login.html authenticate via
-- worker_login, which inserts its own session) and by any SQL caller, so drop it.
--
-- ⚠️ The historical root script supabase-admin-sessions.sql re-CREATEs and
--    re-GRANTs this function. Do NOT re-run that script. If you ever do, re-apply
--    this drop afterward.
-- ============================================================

DROP FUNCTION IF EXISTS public.worker_create_session(uuid);

NOTIFY pgrst, 'reload schema';

-- Verify it's gone (expect 0 rows):
--   SELECT 1 FROM pg_proc WHERE proname = 'worker_create_session';
