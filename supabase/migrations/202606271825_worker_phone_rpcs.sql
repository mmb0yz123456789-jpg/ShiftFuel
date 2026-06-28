-- ============================================================
-- ShiftFuel — Token-gated RPCs to remove worker `phone` from anon reads
-- (additive — safe to run anytime; step 1 of the phone rollout)
--
-- worker `phone` was readable by anyone with the public anon key via the
-- employees_public view. These RPCs give the two legitimate readers a gated path
-- so the view can drop phone (migration 202606271830):
--
--   worker_my_profile(token)             → the logged-in worker's OWN profile
--                                          (incl. their phone). worker-token-gated.
--   admin_employee_id_by_phone(token, p) → existing active employee id matching a
--                                          phone (admin hiring de-dupe). admin-gated.
-- ============================================================

CREATE OR REPLACE FUNCTION public.worker_my_profile(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_employee_id uuid;
  v_row         jsonb;
BEGIN
  v_employee_id := _verify_worker(p_token);
  IF v_employee_id IS NULL THEN RAISE EXCEPTION 'INVALID_SESSION'; END IF;

  SELECT to_jsonb(e) - ARRAY['worker_password_hash', 'worker_password_salt']
    INTO v_row
  FROM public.employees e
  WHERE e.id = v_employee_id;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.worker_my_profile(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_employee_id_by_phone(p_token uuid, p_phone text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT _verify_admin(p_token) THEN RAISE EXCEPTION 'Unauthorized'; END IF;

  SELECT id INTO v_id
  FROM public.employees
  WHERE regexp_replace(coalesce(phone, ''), '\D', '', 'g')
        = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
    AND regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') <> ''
  LIMIT 1;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_employee_id_by_phone(uuid, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
