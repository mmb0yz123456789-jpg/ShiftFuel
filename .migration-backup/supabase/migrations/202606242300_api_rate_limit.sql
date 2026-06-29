-- Shared (cross-instance) rate limiter for the public API endpoints that call
-- paid third-party APIs (Mapbox). Vercel functions are stateless per instance,
-- so an in-memory counter alone can't enforce a global cap — this fixed-window
-- counter table is the authoritative shared limit. Called server-side with the
-- service-role key via check_rate_limit().

begin;

create table if not exists public.api_rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  count        int not null default 0
);

alter table public.api_rate_limits enable row level security;
-- No policies: only the SECURITY DEFINER function below touches this table.

-- Atomic increment + check for a fixed window. Returns { allowed, count }.
-- If the stored window has expired, it resets to a fresh window of 1.
create or replace function public.check_rate_limit(
  p_key            text,
  p_limit          int,
  p_window_seconds int
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now   timestamptz := now();
  v_count int;
begin
  insert into api_rate_limits (key, window_start, count)
  values (p_key, v_now, 1)
  on conflict (key) do update set
    count = case
      when api_rate_limits.window_start < v_now - make_interval(secs => p_window_seconds)
      then 1
      else api_rate_limits.count + 1
    end,
    window_start = case
      when api_rate_limits.window_start < v_now - make_interval(secs => p_window_seconds)
      then v_now
      else api_rate_limits.window_start
    end
  returning count into v_count;

  return jsonb_build_object('allowed', v_count <= p_limit, 'count', v_count);
end;
$$;

revoke all on function public.check_rate_limit(text, int, int) from public;
grant execute on function public.check_rate_limit(text, int, int) to anon;

commit;
