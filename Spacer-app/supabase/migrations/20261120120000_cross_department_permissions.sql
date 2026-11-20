-- Cross-department projects on the permission system.
-- Rollback: supabase/rollback/20261120120000_cross_department_permissions_rollback.sql
--
-- 20261120100000_cross_department_projects (written before RBAC step 3) defines
-- project access with role names (team_role_at_least, is_admin_of_org) and
-- re-sets policies that 20261112110000_rbac_rules had moved onto has_permission().
-- It was also applied by hand on live before it was recorded, so live project
-- access had already gone back to role names. This puts every one of those
-- rules back on permissions, keeping what cross-department projects add: a
-- department working on a project gets the same access there as the project's
-- own department, through its own permissions.
--
-- It also sets the notification types to the full list: cross-department
-- projects and 20261119090000_meetings / 20261119120000_task_comments each
-- replaced the list without the other's types.

-- ─── Access helpers ────────────────────────────────────────────────────────
-- The caller holds `p_permission` in one of the project's extra departments
create or replace function public.extra_department_has_permission(p_project_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path to public, pg_temp
as $$
  select exists (
    select 1 from project_departments pd
    where pd.project_id = p_project_id and has_permission(p_permission, pd.team_space_id)
  );
$$;

revoke execute on function public.extra_department_has_permission(uuid, text) from public, anon;
grant execute on function public.extra_department_has_permission(uuid, text) to authenticated;

-- Kept for the app and older callers: "can see the project through another department"
create or replace function public.has_extra_department_access(p_project_id uuid)
returns boolean language sql stable security definer set search_path to public, pg_temp
as $$
  select extra_department_has_permission(p_project_id, 'project.view');
$$;

create or replace function public.has_project_access(p_project_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from project_spaces ps
    where ps.id = p_project_id
      and (has_permission('project.view', ps.team_space_id)
           or is_project_member(ps.id)
           or extra_department_has_permission(ps.id, 'project.view'))
  );
$$;

create or replace function public.can_edit_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from project_spaces ps
    where ps.id = p_project_id
      and (has_permission('project.edit', ps.team_space_id)
           or is_project_member(ps.id)
           or extra_department_has_permission(ps.id, 'project.edit'))
  );
$$;

-- Leads a department's part of the project: its named lead, or someone who
-- manages projects in that department
create or replace function public.leads_project_department(p_project_id uuid, p_team_space_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select has_permission('project.manage', p_team_space_id)
      or exists (
        select 1 from project_departments
        where project_id = p_project_id and team_space_id = p_team_space_id and lead_id = auth.uid()
      );
$$;

-- Departments working together on a project can see each other's names and members
create or replace function public.shares_project_with_department(p_team_space_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1
    from project_departments theirs
    join project_departments mine on mine.project_id = theirs.project_id
    where theirs.team_space_id = p_team_space_id
      and has_permission('department.view', mine.team_space_id)
  );
$$;

-- ─── Policies (RBAC step 3 versions, plus the project's other departments) ──
alter policy project_spaces_select on public.project_spaces
  using (has_permission('project.view', team_space_id) or is_project_member(id)
         or extra_department_has_permission(id, 'project.view'));

alter policy team_spaces_select on public.team_spaces
  using (organization_id = current_org_id()
         and (has_permission('department.view', id) or is_member_of_project_in_team(id)
              or shares_project_with_department(id)));

alter policy memberships_select on public.memberships
  using (user_id = auth.uid()
         or has_org_permission('member.assign_role', membership_org(team_space_id, user_id))
         or (team_space_id is not null and has_permission('department.view', team_space_id))
         or (team_space_id is not null and shares_project_with_department(team_space_id)));

-- Whoever manages the project adds departments of the same organization in
-- which they could create projects themselves
alter policy project_departments_insert on public.project_departments
  with check (
    can_manage_project(project_id)
    and team_space_org(team_space_id) = (
      select team_space_org(ps.team_space_id) from project_spaces ps where ps.id = project_departments.project_id
    )
    and has_permission('project.create', team_space_id)
  );

-- ─── Notification types: everything both branches added ───────────────────
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('assignment', 'mention', 'status_change', 'project_added',
                  'task_blocked', 'task_unblocked', 'department_nudge',
                  'meeting_invite', 'comment'));
