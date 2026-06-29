begin;

alter table public.service_requests
  add column if not exists key_pickup_lat double precision,
  add column if not exists key_pickup_lng double precision,
  add column if not exists vehicle_pickup_lat double precision,
  add column if not exists vehicle_pickup_lng double precision,
  add column if not exists service_start_lat double precision,
  add column if not exists service_start_lng double precision,
  add column if not exists vehicle_return_lat double precision,
  add column if not exists vehicle_return_lng double precision,
  add column if not exists key_return_lat double precision,
  add column if not exists key_return_lng double precision;

create or replace function public.worker_set_route_coordinates(
  p_token uuid,
  p_request_id uuid,
  p_data jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_employee_id uuid;
begin
  v_employee_id := public._verify_worker(p_token);
  if v_employee_id is null then
    raise exception 'Unauthorized';
  end if;

  update public.service_requests
     set key_pickup_lat     = case when p_data ? 'key_pickup_lat' then (p_data->>'key_pickup_lat')::double precision else key_pickup_lat end,
         key_pickup_lng     = case when p_data ? 'key_pickup_lng' then (p_data->>'key_pickup_lng')::double precision else key_pickup_lng end,
         vehicle_pickup_lat = case when p_data ? 'vehicle_pickup_lat' then (p_data->>'vehicle_pickup_lat')::double precision else vehicle_pickup_lat end,
         vehicle_pickup_lng = case when p_data ? 'vehicle_pickup_lng' then (p_data->>'vehicle_pickup_lng')::double precision else vehicle_pickup_lng end,
         service_start_lat  = case when p_data ? 'service_start_lat' then (p_data->>'service_start_lat')::double precision else service_start_lat end,
         service_start_lng  = case when p_data ? 'service_start_lng' then (p_data->>'service_start_lng')::double precision else service_start_lng end,
         vehicle_return_lat = case when p_data ? 'vehicle_return_lat' then (p_data->>'vehicle_return_lat')::double precision else vehicle_return_lat end,
         vehicle_return_lng = case when p_data ? 'vehicle_return_lng' then (p_data->>'vehicle_return_lng')::double precision else vehicle_return_lng end,
         key_return_lat     = case when p_data ? 'key_return_lat' then (p_data->>'key_return_lat')::double precision else key_return_lat end,
         key_return_lng     = case when p_data ? 'key_return_lng' then (p_data->>'key_return_lng')::double precision else key_return_lng end,
         updated_at         = now()
   where id = p_request_id
     and assigned_employee_id = v_employee_id;

  if not found then
    raise exception 'Request not found or not assigned to this worker';
  end if;
end;
$$;

grant execute on function public.worker_set_route_coordinates(uuid, uuid, jsonb) to anon, authenticated;

commit;
