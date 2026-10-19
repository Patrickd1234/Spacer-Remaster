-- Project-only access: people added to a project (project_members) can see and
-- work on that project's tasks without joining the project's department.
--
-- Requires 20261017070000_enable_rls_group1.sql (team_role_at_least role ranking).
--
-- Also: project_members was writable by ANY signed-in user (policy "true").
--     Now that membership grants access, only department team leads/admins
--     (or org admins of the same organization) may add people, and only
--     people from their own organization.

-- 2. Project access helpers
create or replace function public.is_project_member(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from project_members
    where project_id = p_project_id and user_id = auth.uid()
  );
$$;

-- Can see the project and its tasks: department member OR project member
create or replace function public.has_project_access(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select has_team_access((select team_space_id from project_spaces where id = p_project_id))
      or is_project_member(p_project_id);
$$;

-- Can create/edit the project's tasks: department member+ OR project member
create or replace function public.can_edit_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select team_role_at_least((select team_space_id from project_spaces where id = p_project_id), 'member')
      or is_project_member(p_project_id);
$$;

-- Can add/remove project members: department team lead+ OR admin of the project's organization
create or replace function public.can_manage_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from project_spaces ps
    join team_spaces ts on ts.id = ps.team_space_id
    where ps.id = p_project_id
      and (
        team_role_at_least(ps.team_space_id, 'team_lead')
        or (is_org_admin() and ts.organization_id = current_org_id())
      )
  );
$$;

-- 3. Task-level access (used by comments, attachments, activity_log) follows project access
create or replace function public.has_task_access(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from tasks t
    where t.id = p_task_id
      and (
        (t.project_id is null and t.organization_id = current_org_id())
        or (t.project_id is not null and has_project_access(t.project_id))
      )
  );
$$;

-- 4. Policies on project-scoped tables
alter policy project_spaces_select on public.project_spaces
  using (has_team_access(team_space_id) or is_project_member(id));

alter policy tasks_select on public.tasks
  using (
    (project_id is null and organization_id = current_org_id())
    or (project_id is not null and has_project_access(project_id))
  );

alter policy tasks_insert on public.tasks
  with check (
    (project_id is null and organization_id = current_org_id())
    or (project_id is not null and can_edit_project(project_id))
  );

alter policy tasks_update on public.tasks
  using (
    (project_id is null and organization_id = current_org_id())
    or (project_id is not null and can_edit_project(project_id))
  );

alter policy milestones_select on public.milestones
  using (has_project_access(project_id));

-- 5. Lock down project_members (was open to every signed-in user)
drop policy if exists "Allow all for authenticated" on public.project_members;

create policy project_members_select on public.project_members
  for select to authenticated
  using (has_project_access(project_id) or can_manage_project(project_id));

create policy project_members_insert on public.project_members
  for insert to authenticated
  with check (
    can_manage_project(project_id)
    and exists (
      select 1 from users u
      where u.id = project_members.user_id
        and u.organization_id = current_org_id()
    )
  );

-- Managers can remove anyone; members can remove themselves
create policy project_members_delete on public.project_members
  for delete to authenticated
  using (can_manage_project(project_id) or user_id = auth.uid());
