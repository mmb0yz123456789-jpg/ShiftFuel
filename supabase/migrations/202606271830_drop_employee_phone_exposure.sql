-- ============================================================
-- ShiftFuel — Step 3 (RESTRICTIVE): drop worker `phone` from anon reads
--
-- ⚠️ RUN ONLY AFTER 202606271825 is applied AND the worker.js / admin.js that use
--    worker_my_profile + admin_employee_id_by_phone are deployed and tested
--    (worker profile loads; admin can hire an applicant). Pairs with the email
--    lock in 202606271820 — run that one too.
--
-- This recreates employees_public WITHOUT email OR phone (the final state) and
-- revokes the base-table phone (and email) column grants. After this, worker
-- contact PII (email + phone) is only reachable through token-gated RPCs.
-- ============================================================

BEGIN;

-- Final employees_public: live column list minus `email` and `phone`.
DROP VIEW IF EXISTS public.employees_public;
CREATE VIEW public.employees_public WITH (security_barrier = true) AS
  SELECT id,
         employee_code,
         full_name,
         active,
         home_location,
         started_at,
         photo_url,
         original_photo_url,
         cropped_photo_url,
         photo_zoom,
         photo_position_x,
         photo_position_y,
         profile_updated_at,
         password_updated_at,
         last_seen_at,
         presence_status,
         background_verified,
         username
  FROM public.employees;
GRANT SELECT ON public.employees_public TO anon, authenticated;

-- No direct base-table contact-PII reads either (email revoke is idempotent if
-- 202606271820 already ran).
REVOKE SELECT (phone) ON public.employees FROM anon, authenticated;
REVOKE SELECT (email) ON public.employees FROM anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Verify (expect 0 rows — neither column on the view):
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name='employees_public' AND column_name IN ('email','phone');
