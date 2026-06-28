-- ============================================================
-- ShiftFuel — Revoke worker access on deactivate / admin password reset
--
-- Problem: a worker session was valid until its 8h expiry no matter what. So
-- deactivating (firing) a worker, or resetting their password because it was
-- compromised, left their existing session working for up to 8 hours — with
-- access to customer addresses, key-handoff details, and live jobs.
--
-- #1  _verify_worker now also requires employees.active = true. The instant you
--     deactivate a worker, their existing token stops validating on the very next
--     request — no waiting for expiry.
--
-- #2  A trigger deletes a worker's sessions when they are deactivated
--     (active → false) or an admin resets their password (which sets
--     must_change_password → true). This kills any live/compromised session
--     immediately. It deliberately does NOT fire when a worker changes their OWN
--     password (must_change_password stays false), so normal self-service
--     password changes don't bounce the worker out of their current session.
--
-- Server-side only — no app code change, safe to run anytime.
-- ============================================================

-- #1 — session verification also checks the worker is still active.
CREATE OR REPLACE FUNCTION public._verify_worker(p_token uuid, OUT o_employee_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ws.employee_id
  FROM worker_sessions ws
  JOIN employees e ON e.id = ws.employee_id
  WHERE ws.id = p_token
    AND ws.expires_at > now()
    AND e.active = true
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public._verify_worker(uuid) FROM PUBLIC, anon, authenticated;

-- #2 — revoke live sessions on deactivate / admin reset.
CREATE OR REPLACE FUNCTION public._revoke_worker_sessions_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (OLD.active = true AND NEW.active = false)
     OR (NEW.must_change_password = true AND OLD.must_change_password IS DISTINCT FROM true)
  THEN
    DELETE FROM worker_sessions WHERE employee_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_revoke_worker_sessions ON public.employees;
CREATE TRIGGER trg_revoke_worker_sessions
  AFTER UPDATE OF active, must_change_password ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public._revoke_worker_sessions_on_change();

NOTIFY pgrst, 'reload schema';

-- ── Verify ───────────────────────────────────────────────────────────────────
-- After deactivating a worker, their session row is gone and their token fails:
--   SELECT count(*) FROM worker_sessions ws JOIN employees e ON e.id=ws.employee_id
--   WHERE e.active = false;   -- expect 0
