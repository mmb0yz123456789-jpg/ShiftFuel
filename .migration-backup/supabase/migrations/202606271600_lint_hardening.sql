-- ============================================================
-- ShiftFuel — Supabase linter hardening (minor)
--
-- Tightens the genuinely actionable linter findings. The bulk of the linter's
-- "anon/authenticated can execute SECURITY DEFINER function" warnings (lints 0028
-- /0029) are BY DESIGN for this app: the browser uses the public anon key and
-- authenticates via a session-token argument that each admin_*/worker_* function
-- validates internally (_verify_admin / _verify_worker), or via phone+email for
-- public_* functions. Those must stay anon-executable and SECURITY DEFINER, so
-- they are intentionally NOT changed — the linter's suggested "revoke / make
-- SECURITY INVOKER" would break the app. Suppress those in the dashboard instead.
-- ============================================================

-- 1. check_rate_limit — only ever called server-side by api/_rate-limit.js via the
--    service-role key. Remove public reachability so a caller can't probe or
--    pre-exhaust rate-limit buckets with the public anon key.
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO service_role;

-- 2. cleanup_old_request_locations — GPS retention maintenance; service-role/cron
--    only. No reason for the public to trigger it.
REVOKE EXECUTE ON FUNCTION public.cleanup_old_request_locations() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.cleanup_old_request_locations() TO service_role;

-- 3. enforce_wash_return_cutoff — pin search_path (lint 0011_function_search_path_mutable).
--    Trigger function with no schema-qualified references, so pinning is safe.
CREATE OR REPLACE FUNCTION public.enforce_wash_return_cutoff()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.service_type IS NOT DISTINCT FROM OLD.service_type
     AND NEW.desired_return_time IS NOT DISTINCT FROM OLD.desired_return_time THEN
    RETURN NEW;
  END IF;

  IF NEW.service_type IN ('car-wash', 'car-wash-fuel', 'wash-only')
     AND NEW.desired_return_time IS NOT NULL
     AND NEW.desired_return_time > TIME '18:00' THEN
    RAISE EXCEPTION 'Car wash bookings must be returned by 6:00 PM.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
