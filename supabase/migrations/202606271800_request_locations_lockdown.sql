-- ============================================================
-- ShiftFuel — Lock down direct reads of live GPS (request_locations)
--
-- request_locations held live worker GPS for in-progress jobs. It had:
--   * request_locations_no_anon_select  → SELECT USING(false) for anon   (good)
--   * request_locations_authenticated_read → SELECT USING(true) for `authenticated`
--
-- The second policy let ANY `authenticated` role read EVERY job's live
-- coordinates. This app doesn't use Supabase Auth for its own users (admin/worker
-- use custom tokens; the browser uses the anon key), so `authenticated` should
-- never be a real client — but if Supabase email signups are enabled, anyone
-- could self-register, become `authenticated`, and track every active job's GPS
-- (a stalking / safety risk). No client reads this table directly; live location
-- is served only through the gated public_track_request_location() RPC. So drop
-- the permissive policy — the table becomes RPC-only.
-- ============================================================

DROP POLICY IF EXISTS "request_locations_authenticated_read" ON public.request_locations;

-- Result: anon denied (existing false policy), authenticated denied (no policy),
-- access only via the SECURITY DEFINER RPC. Verify:
--   SELECT policyname, cmd, roles::text, qual
--   FROM pg_policies WHERE schemaname='public' AND tablename='request_locations';

NOTIFY pgrst, 'reload schema';
