-- Custom task-board columns per project.
-- Each column maps to one of the task statuses (todo / in_progress / done), so
-- Reports, Home, notifications and subtask-driven statuses keep working: moving a
-- card sets both tasks.column_id and tasks.status. A project without rows here
-- shows the default Backlog / Doing / Done columns.
-- Rollback: supabase/rollback/20261026090000_project_columns_rollback.sql

create table if not exists public.project_columns (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.project_spaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 40),
  base_status text not null check (base_status in ('todo', 'in_progress', 'done')),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists project_columns_project_position_idx
  on public.project_columns (project_id, position);

-- Which custom column a task sits in (null = first column matching its status)
alter table public.tasks
  add column if not exists column_id uuid references public.project_columns(id) on delete set null;

create index if not exists tasks_column_id_idx on public.tasks (column_id);

-- A task may only be placed in a column of its own project
create or replace function public.tasks_column_matches_project()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.column_id is not null and not exists (
    select 1 from project_columns c
    where c.id = new.column_id and c.project_id = new.project_id
  ) then
    raise exception 'Task column must belong to the task''s project';
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_column_matches_project on public.tasks;
create trigger tasks_column_matches_project
  before insert or update of column_id, project_id on public.tasks
  for each row execute function public.tasks_column_matches_project();

-- Row level security: anyone who can see the project sees its columns;
-- only people who can manage the project change them.
alter table public.project_columns enable row level security;

grant select, insert, update, delete on public.project_columns to authenticated;

drop policy if exists project_columns_select on public.project_columns;
create policy project_columns_select on public.project_columns
  for select to authenticated
  using (has_project_access(project_id));

drop policy if exists project_columns_insert on public.project_columns;
create policy project_columns_insert on public.project_columns
  for insert to authenticated
  with check (can_manage_project(project_id));

drop policy if exists project_columns_update on public.project_columns;
create policy project_columns_update on public.project_columns
  for update to authenticated
  using (can_manage_project(project_id))
  with check (can_manage_project(project_id));

drop policy if exists project_columns_delete on public.project_columns;
create policy project_columns_delete on public.project_columns
  for delete to authenticated
  using (can_manage_project(project_id));

-- Same two-factor requirement every other table has (20261018090000_enforce_mfa.sql)
drop policy if exists mfa_required on public.project_columns;
create policy mfa_required on public.project_columns
  as restrictive for all to authenticated
  using (public.mfa_satisfied()) with check (public.mfa_satisfied());
