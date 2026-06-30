-- Repair applicant submission support for DEV/PROD migrations.
-- Safe to run whether the applicants table and resume bucket already exist.

create table if not exists public.applicants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  first_name text,
  last_name text,
  email text,
  phone text,
  availability text,
  notes text,
  resume_url text,
  resume_storage_path text,
  status text not null default 'new',
  checkr_candidate_id text,
  checkr_invitation_id text,
  checkr_report_id text,
  checkr_status text not null default 'none',
  checkr_completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.applicants
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists availability text,
  add column if not exists notes text,
  add column if not exists resume_url text,
  add column if not exists resume_storage_path text,
  add column if not exists status text not null default 'new',
  add column if not exists checkr_candidate_id text,
  add column if not exists checkr_invitation_id text,
  add column if not exists checkr_report_id text,
  add column if not exists checkr_status text not null default 'none',
  add column if not exists checkr_completed_at timestamptz,
  add column if not exists created_at timestamptz not null default now();

alter table public.applicants enable row level security;

grant insert on public.applicants to anon, authenticated;

drop policy if exists "Anyone can submit applicants" on public.applicants;
create policy "Anyone can submit applicants"
on public.applicants
for insert
to anon, authenticated
with check (true);

alter table public.applicants drop constraint if exists applicants_checkr_status_check;
alter table public.applicants
  add constraint applicants_checkr_status_check
  check (checkr_status in ('none', 'pending', 'clear', 'consider', 'suspended', 'dispute', 'canceled'));

insert into storage.buckets (id, name, public)
values ('applicant-resumes', 'applicant-resumes', true)
on conflict (id) do update set public = true;

drop policy if exists "Anyone can upload applicant resumes" on storage.objects;
create policy "Anyone can upload applicant resumes"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'applicant-resumes');

create or replace function public.admin_list_applicants(p_token uuid)
returns setof public.applicants
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public._verify_admin(p_token) then
    raise exception 'Unauthorized';
  end if;

  return query
    select * from public.applicants order by created_at desc;
end;
$$;

grant execute on function public.admin_list_applicants(uuid) to anon, authenticated;

create or replace function public.admin_update_applicant(
  p_token uuid,
  p_applicant_id uuid,
  p_data jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public._verify_admin(p_token) then
    raise exception 'Unauthorized';
  end if;

  update public.applicants
  set status = case when p_data ? 'status' then p_data->>'status' else status end
  where id = p_applicant_id;
end;
$$;

grant execute on function public.admin_update_applicant(uuid, uuid, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
