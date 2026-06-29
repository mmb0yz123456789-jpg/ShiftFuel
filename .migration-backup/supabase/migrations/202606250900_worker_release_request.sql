-- Worker fail-safe: release an ACCEPTED job back to the open pool. If a worker
-- accepts a ticket but can't do it anymore, this un-assigns them and resets the
-- request to 'request_received' so another worker can pick it up. Only allowed
-- before the keys are received (status = 'accepted') — once the worker holds the
-- keys/vehicle, they must go through the normal return flow instead.

begin;

create or replace function public.worker_release_request(
  p_token      uuid,
  p_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employee_id uuid;
begin
  v_employee_id := _verify_worker(p_token);
  if v_employee_id is null then
    raise exception 'Unauthorized';
  end if;

  update service_requests set
    status                             = 'request_received',
    assigned_employee_id               = null,
    assigned_worker_name               = null,
    assigned_worker_phone              = null,
    assigned_worker_photo_url          = null,
    assigned_worker_original_photo_url = null,
    live_tracking_enabled              = false,
    updated_at                         = now()
  where id = p_request_id
    and assigned_employee_id = v_employee_id
    and status = 'accepted';
end;
$$;

revoke all on function public.worker_release_request(uuid, uuid) from public;
grant execute on function public.worker_release_request(uuid, uuid) to anon;

commit;
