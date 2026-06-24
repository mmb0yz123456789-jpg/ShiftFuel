-- Admin RPC to permanently delete a worker application.
-- The admin dashboard calls this when an applicant is marked "Declined" so the
-- application is removed entirely rather than lingering in the recruiting list.
-- Mirrors the security of admin_update_applicant (_verify_admin gate,
-- SECURITY DEFINER, locked search_path). Idempotent and safe to re-run.

begin;

create or replace function public.admin_delete_applicant(
  p_token        uuid,
  p_applicant_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not _verify_admin(p_token) then raise exception 'Unauthorized'; end if;

  delete from applicants where id = p_applicant_id;
end;
$$;

grant execute on function public.admin_delete_applicant(uuid, uuid) to anon, authenticated;

commit;
