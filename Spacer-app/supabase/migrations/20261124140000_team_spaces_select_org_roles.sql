-- Fix: organization admins and the Owner couldn't create departments.
-- Rollback: supabase/rollback/20261124140000_team_spaces_select_org_roles_rollback.sql
--
-- The app creates a department with insert ... returning (supabase
-- .insert().select()). Postgres checks the returned row against the select
-- policy, which asks has_permission('department.view', id). Since
-- 20261124090000_pin_org_roles_to_org, an organization role counts for a
-- department only after looking the department's organization up
-- (team_space_org(id)), and the row being inserted isn't visible to that
-- lookup yet. So the check failed and every create ended in "new row violates
-- row-level security policy for table team_spaces".
--
-- The policy now also lets organization roles in through the row's own
-- organization_id (has_org_permission(), no lookup). For rows that already
-- exist this allows exactly what has_permission() already allowed: an
-- organization role holds department.view in every department of its own
-- organization, and no department role is an organization role.

alter policy team_spaces_select on public.team_spaces
  using (
    organization_id = current_org_id()
    and (has_org_permission('department.view', organization_id)
         or has_permission('department.view', id)
         or is_member_of_project_in_team(id)
         or shares_project_with_department(id))
  );
