-- Undo 20261119100000_task_keys.sql
-- Task numbers and the organization, department and project prefixes are
-- dropped; keys already written in branch names or commit messages stop
-- pointing anywhere.

drop trigger if exists tasks_assign_number on public.tasks;
drop function if exists public.tasks_assign_number();

alter table public.tasks
  drop constraint if exists tasks_task_key_key,
  drop column if exists task_number,
  drop column if exists task_key_scope;

drop table if exists public.task_key_counters;

drop function if exists public.task_key_prefixes();

drop trigger if exists project_spaces_set_task_key_prefix on public.project_spaces;
drop function if exists public.project_spaces_set_task_key_prefix();
drop trigger if exists team_spaces_set_task_key_prefix on public.team_spaces;
drop trigger if exists organizations_set_task_key_prefix on public.organizations;
drop function if exists public.set_default_task_key_prefix();

alter table public.project_spaces
  drop constraint if exists project_spaces_task_key_prefix_check,
  drop column if exists task_key_prefix;
alter table public.team_spaces
  drop constraint if exists team_spaces_task_key_prefix_check,
  drop column if exists task_key_prefix;
alter table public.organizations
  drop constraint if exists organizations_task_key_prefix_check,
  drop column if exists task_key_prefix;

drop function if exists public.unique_project_key_prefix(uuid, text, uuid);
drop function if exists public.task_key_prefix_taken(uuid, text, uuid);
drop function if exists public.default_project_key_code(text);
drop function if exists public.default_task_key_prefix(text);
