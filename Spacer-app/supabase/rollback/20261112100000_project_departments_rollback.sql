-- Undo 20261112100000_project_departments.sql
-- Projects go back to a single department; the extra departments are lost.
-- Deploy a front end that no longer reads or writes project_departments first.

alter policy project_spaces_select on public.project_spaces
  using (
    has_team_access(team_space_id)
    or is_project_member(id)
    or is_admin_of_org(team_space_org(team_space_id))
  );

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

drop table if exists public.project_departments;
drop function if exists public.has_extra_department_access(uuid);
drop function if exists public.extra_department_role_at_least(uuid, membership_role);
