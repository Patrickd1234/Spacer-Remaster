-- A project can belong to more than one department. project_spaces.team_space_id
-- stays the main department; this table lists the extra ones, picked with the
-- "+" next to Team Space in the Create Project form.
-- Rollback: supabase/rollback/20261112100000_project_departments_rollback.sql
--
-- Access: people in an extra department can see the project and work on its
-- tasks, the same as the main department (has_project_access, can_edit_project,
-- project_spaces_select). Managing the project (rename, deadline, delete,
-- members) stays with the main department's team leads and org admins.

create table if not exists public.project_departments (
  project_id uuid not null references public.project_spaces(id) on delete cascade,
  team_space_id uuid not null references public.team_spaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, team_space_id)
);

create index if not exists project_departments_team_space_idx
  on public.project_departments (team_space_id);

-- ─── Helpers ────────────────────────────────────────────────────────────────
-- Has access to one of the project's extra departments
create or replace function public.has_extra_department_access(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from project_departments pd
    where pd.project_id = p_project_id
      and has_team_access(pd.team_space_id)
  );
$$;

-- Is at least p_min in one of the project's extra departments
create or replace function public.extra_department_role_at_least(p_project_id uuid, p_min membership_role)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from project_departments pd
    where pd.project_id = p_project_id
      and team_role_at_least(pd.team_space_id, p_min)
  );
$$;

-- Same as 20261017090000, plus the extra departments
create or replace function public.has_project_access(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from project_spaces ps
    where ps.id = p_project_id
      and (
        has_team_access(ps.team_space_id)
        or is_project_member(ps.id)
        or is_admin_of_org(team_space_org(ps.team_space_id))
        or has_extra_department_access(ps.id)
      )
  );
$$;

create or replace function public.can_edit_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from project_spaces ps
    where ps.id = p_project_id
      and (
        team_role_at_least(ps.team_space_id, 'member')
        or is_project_member(ps.id)
        or is_admin_of_org(team_space_org(ps.team_space_id))
        or extra_department_role_at_least(ps.id, 'member')
      )
  );
$$;

alter policy project_spaces_select on public.project_spaces
  using (
    has_team_access(team_space_id)
    or is_project_member(id)
    or is_admin_of_org(team_space_org(team_space_id))
    or has_extra_department_access(id)
  );

-- ─── project_departments policies ───────────────────────────────────────────
alter table public.project_departments enable row level security;

drop policy if exists project_departments_select on public.project_departments;
create policy project_departments_select on public.project_departments
  for select to authenticated
  using (has_project_access(project_id));

-- Whoever manages the project can add a department of the same organization
-- in which they could create projects themselves (team lead+ or org admin)
drop policy if exists project_departments_insert on public.project_departments;
create policy project_departments_insert on public.project_departments
  for insert to authenticated
  with check (
    can_manage_project(project_id)
    and team_space_org(team_space_id) = (
      select team_space_org(ps.team_space_id) from project_spaces ps where ps.id = project_departments.project_id
    )
    and team_space_id <> (select ps.team_space_id from project_spaces ps where ps.id = project_departments.project_id)
    and (
      team_role_at_least(team_space_id, 'team_lead')
      or is_admin_of_org(team_space_org(team_space_id))
    )
  );

drop policy if exists project_departments_delete on public.project_departments;
create policy project_departments_delete on public.project_departments
  for delete to authenticated
  using (can_manage_project(project_id));

grant select, insert, delete on public.project_departments to authenticated;
