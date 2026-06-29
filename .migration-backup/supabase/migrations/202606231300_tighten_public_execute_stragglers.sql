-- OPTIONAL: clears the last 5 "authenticated can execute SECURITY DEFINER"
-- advisor warnings. Those functions grant EXECUTE to PUBLIC (so every role,
-- including `authenticated`, inherits it). We remove the PUBLIC/authenticated
-- grant and re-grant only the roles the app actually uses: `anon` (the browser
-- client) and `service_role` (server-side / cron). Idempotent.
--
-- NOTE: worker_upsert_request_location is called by the live GPS feature every
-- ~15s via the anon client. anon keeps EXECUTE here, but re-test worker GPS
-- after applying.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'cleanup_old_request_locations',
        'public_track_request',
        'public_track_request_location',
        'worker_stop_request_location',
        'worker_upsert_request_location'
      )
  loop
    execute format('revoke execute on function %s from public, authenticated', r.sig);
    execute format('grant execute on function %s to anon, service_role', r.sig);
  end loop;
end $$;
