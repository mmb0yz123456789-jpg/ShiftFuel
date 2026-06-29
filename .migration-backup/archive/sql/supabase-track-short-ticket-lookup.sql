-- Track My Vehicle lookup fix for public ticket numbers.
-- Customer-facing tickets use SF-XXXXXXXX.
-- The database keeps the full UUID.
-- Safe to re-run.

create or replace function public.public_track_request(
  p_request_id text default null,
  p_phone text default null,
  p_email text default null
)
returns setof public.service_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request text := upper(trim(coalesce(p_request_id, '')));
  v_ticket_prefix text := null;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
  v_email text := lower(trim(coalesce(p_email, '')));
  v_count int := 0;
begin
  -- Require at least two identifiers for customer tracking.
  if v_phone <> '' then
    v_count := v_count + 1;
  end if;
  if v_email <> '' then
    v_count := v_count + 1;
  end if;
  if v_request <> '' then
    v_count := v_count + 1;
  end if;

  if v_count < 2 then
    return;
  end if;

  -- Convert SF-DDDFBBC5 or DDDFBBC5 into the UUID prefix dddfbbc5.
  if v_request like 'SF-%' then
    v_ticket_prefix := lower(substring(v_request from 4 for 8));
  elsif v_request ~ '^[A-F0-9]{8}$' then
    v_ticket_prefix := lower(v_request);
  end if;

  return query
  select sr.*
  from public.service_requests sr
  where
    (
      -- Full UUID exact match.
      (v_request <> '' and v_ticket_prefix is null and sr.id::text = lower(v_request))
      -- Customer-facing SF short ticket match.
      or (v_ticket_prefix is not null and sr.id::text like v_ticket_prefix || '%')
      -- Contact-only lookup is still supported when phone + email are supplied.
      or (v_request = '')
    )
    and (
      v_phone = ''
      or regexp_replace(coalesce(sr.customer_phone, ''), '\D', '', 'g') = v_phone
    )
    and (
      v_email = ''
      or lower(coalesce(sr.customer_email, '')) = v_email
    )
  order by sr.created_at desc;
end;
$$;

grant execute on function public.public_track_request(text, text, text) to anon, authenticated;
