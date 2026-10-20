-- Turn on row-level security for projects and tasks:
-- tasks, project_spaces, project_members, milestones.
-- Builds on 20261017080000_project_member_access.sql (project-only access).

-- ─── Who counts as an organization admin ────────────────────────────────────
-- launch-organization gives founders an org-level 'super_admin' membership,
-- and the app (RoleContext) treats any 'super_admin' membership as
-- organization-wide. The old check only accepted org-level 'admin'.
create or replace function public.is_org_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from memberships
    where user_id = auth.uid()
      and (
        (team_space_id is null and role in ('admin', 'super_admin'))
        or role = 'super_admin'
      )
  );
$$;

create or replace function public.team_space_org(p_team_space_id uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select organization_id from team_spaces where id = p_team_space_id;
$$;

-- ─── Project access helpers: org admins of the project's org get access too ─
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
      )
  );
$$;

create or replace function public.can_manage_project(p_project_id uuid)
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
        team_role_at_least(ps.team_space_id, 'team_lead')
        or is_admin_of_org(team_space_org(ps.team_space_id))
      )
  );
$$;

-- ─── project_spaces ─────────────────────────────────────────────────────────
alter policy project_spaces_select on public.project_spaces
  using (
    has_team_access(team_space_id)
    or is_project_member(id)
    or is_admin_of_org(team_space_org(team_space_id))
  );

alter policy project_spaces_insert on public.project_spaces
  with check (
    team_role_at_least(team_space_id, 'team_lead')
    or is_admin_of_org(team_space_org(team_space_id))
  );

alter policy project_spaces_update on public.project_spaces
  using (
    team_role_at_least(team_space_id, 'team_lead')
    or is_admin_of_org(team_space_org(team_space_id))
  )
  with check (
    team_role_at_least(team_space_id, 'team_lead')
    or is_admin_of_org(team_space_org(team_space_id))
  );

-- project_page.jsx deletes projects; there was no delete policy
drop policy if exists project_spaces_delete on public.project_spaces;
create policy project_spaces_delete on public.project_spaces
  for delete to authenticated
  using (
    team_role_at_least(team_space_id, 'team_lead')
    or is_admin_of_org(team_space_org(team_space_id))
  );

alter table public.project_spaces enable row level security;

-- ─── tasks ──────────────────────────────────────────────────────────────────
alter policy tasks_select on public.tasks
  using (
    (project_id is null and organization_id = current_org_id())
    or (project_id is not null and has_project_access(project_id))
  );

alter policy tasks_insert on public.tasks
  with check (
    organization_id = current_org_id()
    and (project_id is null or can_edit_project(project_id))
  );

-- with check stops moving a task into a project you can't edit
alter policy tasks_update on public.tasks
  using (
    (project_id is null and organization_id = current_org_id())
    or (project_id is not null and can_edit_project(project_id))
  )
  with check (
    organization_id = current_org_id()
    and (project_id is null or can_edit_project(project_id))
  );

-- project_page.jsx deletes tasks; there was no delete policy.
-- Project managers (team lead+ / org admin) or the task's creator may delete.
drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete to authenticated
  using (
    created_by = auth.uid()
    or (project_id is null and is_admin_of_org(organization_id))
    or (project_id is not null and can_manage_project(project_id))
  );

alter table public.tasks enable row level security;

-- ─── milestones (not used by the app yet; keep existing rules) ──────────────
alter policy milestones_select on public.milestones
  using (has_project_access(project_id));

alter table public.milestones enable row level security;

-- ─── project_members (policies created in 20261017080000) ───────────────────
alter table public.project_members enable row level security;
