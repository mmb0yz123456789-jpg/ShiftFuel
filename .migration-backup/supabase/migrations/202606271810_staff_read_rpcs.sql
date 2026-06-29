-- ============================================================
-- ShiftFuel — Token-gated staff read RPCs (additive — safe to run anytime)
--
-- Step 1 of a 3-step rollout that removes two anon-readable surfaces:
--   * worker email (exposed via the employees_public view), and
--   * the photos table (anon could enumerate every car-photo record).
--
-- This migration only ADDS the replacement read paths; it changes no existing
-- access, so it can't break anything. After deploying the admin.js that uses
-- these RPCs, run 202606271820 to actually lock the open access.
--
--   admin_list_employees(token)            → full worker profiles incl. email,
--                                            admin-token-gated. (Replaces the
--                                            direct employees_public read.)
--   staff_request_photos(token, request)   → photos for one request, admin-token-
--                                            gated. (Replaces the direct photos read.)
--
-- Both return SETOF jsonb (per-row objects), so the browser consumes them exactly
-- like a normal table read. Password columns are stripped from the employee rows.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_list_employees(p_token uuid)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT _verify_admin(p_token) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN QUERY
    SELECT to_jsonb(e) - ARRAY['worker_password_hash', 'worker_password_salt']
    FROM public.employees e
    ORDER BY e.full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_employees(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.staff_request_photos(p_token uuid, p_request_id uuid)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT _verify_admin(p_token) THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  RETURN QUERY
    SELECT to_jsonb(p)
    FROM public.photos p
    WHERE p.service_request_id = p_request_id
    ORDER BY p.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.staff_request_photos(uuid, uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
