-- Undo 20261124140000_team_spaces_select_org_roles.sql: back to the policy of
-- 20261120120000_cross_department_permissions. Organization admins then can't
-- create departments from the app again (see the migration's header).

alter policy team_spaces_select on public.team_spaces
  using (
    organization_id = current_org_id()
    and (has_permission('department.view', id)
         or is_member_of_project_in_team(id)
         or shares_project_with_department(id))
  );
