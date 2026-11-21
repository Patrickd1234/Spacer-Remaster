-- Undo 20261120120000_cross_department_permissions.sql: back to the role-name
-- rules of 20261120100000_cross_department_projects. Not recommended: project
-- access then ignores the permission system again (see the migration's header).
-- Meeting and comment notifications stay allowed, so existing rows keep working.

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('assignment', 'mention', 'status_change', 'project_added',
                  'task_blocked', 'task_unblocked', 'department_nudge',
                  'meeting_invite', 'comment'));

alter policy project_departments_insert on public.project_departments
  with check (
    can_manage_project(project_id)
    and team_space_org(team_space_id) = (
      select team_space_org(ps.team_space_id) from project_spaces ps where ps.id = project_departments.project_id
    )
    and (team_role_at_least(team_space_id, 'team_lead') or is_admin_of_org(team_space_org(team_space_id)))
  );

alter policy memberships_select on public.memberships
  using (
    user_id = auth.uid()
    or is_admin_of_org(membership_org(team_space_id, user_id))
    or (team_space_id is not null and has_team_access(team_space_id))
    or (team_space_id is not null and shares_project_with_department(team_space_id))
  );

alter policy team_spaces_select on public.team_spaces
  using (
    organization_id = current_org_id()
    and (has_team_access(id) or is_org_admin() or is_member_of_project_in_team(id) or shares_project_with_department(id))
  );

alter policy project_spaces_select on public.project_spaces
  using (
    has_team_access(team_space_id)
    or is_project_member(id)
    or is_admin_of_org(team_space_org(team_space_id))
    or has_extra_department_access(id)
  );

create or replace function public.shares_project_with_department(p_team_space_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1
    from project_departments theirs
    join project_departments mine on mine.project_id = theirs.project_id
    where theirs.team_space_id = p_team_space_id
      and has_team_access(mine.team_space_id)
  );
$$;

create or replace function public.leads_project_department(p_project_id uuid, p_team_space_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select team_role_at_least(p_team_space_id, 'team_lead')
      or exists (
        select 1 from project_departments
        where project_id = p_project_id and team_space_id = p_team_space_id and lead_id = auth.uid()
      );
$$;

create or replace function public.can_edit_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
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

create or replace function public.has_project_access(p_project_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
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

create or replace function public.has_extra_department_access(p_project_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from project_departments pd
    where pd.project_id = p_project_id and has_team_access(pd.team_space_id)
  );
$$;

drop function if exists public.extra_department_has_permission(uuid, text);
