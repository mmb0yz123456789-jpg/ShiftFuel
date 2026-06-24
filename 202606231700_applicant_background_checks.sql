-- Background-check (Checkr) fields on applicants.
-- Flow: admin moves an applicant to "interviewing" and clicks "Send background
-- check" → /api/checkr creates a Checkr candidate + invitation (Checkr emails
-- the candidate to complete consent) → Checkr's webhook (/api/checkr-webhook)
-- writes the result back here → the admin sees a green/red badge.
-- admin_list_applicants is SELECT * so these columns surface automatically.
-- Idempotent and safe to re-run.

begin;

-- First/last name kept separately so the Checkr candidate record is accurate
-- (the existing `name` column stays populated as "First Last" for display).
alter table public.applicants
  add column if not exists first_name text,
  add column if not exists last_name text;

alter table public.applicants
  add column if not exists checkr_candidate_id text,
  add column if not exists checkr_invitation_id text,
  add column if not exists checkr_report_id text,
  add column if not exists checkr_status text not null default 'none',
  add column if not exists checkr_completed_at timestamptz;

-- none      = not started
-- pending   = invitation sent / report running
-- clear     = passed
-- consider  = needs review (a flag came back)
-- suspended/dispute/canceled = Checkr-side states
alter table public.applicants drop constraint if exists applicants_checkr_status_check;
alter table public.applicants
  add constraint applicants_checkr_status_check
  check (checkr_status in ('none', 'pending', 'clear', 'consider', 'suspended', 'dispute', 'canceled'));

notify pgrst, 'reload schema';

commit;
