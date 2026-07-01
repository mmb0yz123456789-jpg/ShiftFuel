-- Customer support messages captured from the public site and surfaced in admin.
-- Public writes go through /api/support using the service-role key. Admin reads
-- and status updates go through token-gated RPCs.

begin;

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  status text not null default 'open',
  reason text not null default 'general',
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  subject text,
  message text not null,
  booking_ref text,
  admin_note text,
  source_page text,
  client_ip text,
  user_agent text,
  constraint support_messages_status_check check (status in ('open', 'resolved', 'archived'))
);

create index if not exists support_messages_status_created_idx
  on public.support_messages (status, created_at desc);

alter table public.support_messages enable row level security;

create or replace function public.admin_list_support_messages(p_token uuid)
returns setof jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not _verify_admin(p_token) then raise exception 'Unauthorized'; end if;
  return query
    select to_jsonb(sm)
    from public.support_messages sm
    order by
      case sm.status when 'open' then 0 when 'resolved' then 1 else 2 end,
      sm.created_at desc;
end;
$$;

create or replace function public.admin_update_support_message(
  p_token uuid,
  p_message_id uuid,
  p_status text default null,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.support_messages;
  v_status text := nullif(trim(coalesce(p_status, '')), '');
begin
  if not _verify_admin(p_token) then raise exception 'Unauthorized'; end if;
  if v_status is not null and v_status not in ('open', 'resolved', 'archived') then
    raise exception 'Invalid support message status';
  end if;

  update public.support_messages
     set status = coalesce(v_status, status),
         admin_note = coalesce(p_admin_note, admin_note),
         resolved_at = case
           when coalesce(v_status, status) = 'resolved' and resolved_at is null then now()
           when coalesce(v_status, status) = 'open' then null
           else resolved_at
         end,
         updated_at = now()
   where id = p_message_id
   returning * into v_row;

  if v_row.id is null then raise exception 'Support message not found'; end if;
  return to_jsonb(v_row);
end;
$$;

grant execute on function public.admin_list_support_messages(uuid) to anon, authenticated;
grant execute on function public.admin_update_support_message(uuid, uuid, text, text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
