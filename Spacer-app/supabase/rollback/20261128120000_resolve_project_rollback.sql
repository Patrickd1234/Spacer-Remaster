-- Rollback for 20261128120000_resolve_project.
-- Closed projects become active again; notes and close/reopen entries already
-- logged stay in activity_log.

drop function if exists public.add_project_note(uuid, text);
drop function if exists public.close_project(uuid, boolean);

update public.project_spaces set status = 'active' where status = 'closed';
alter table public.project_spaces drop column if exists closed_by;
alter table public.project_spaces drop column if exists closed_at;
alter table public.project_spaces drop constraint if exists project_spaces_status_check;
alter table public.project_spaces
  add constraint project_spaces_status_check check (status in ('active', 'archived'));
