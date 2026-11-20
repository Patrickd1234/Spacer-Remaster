-- Undo 20261117090000_cross_department_projects.sql, back to the state after
-- 20261112100000_project_departments (projects keep their extra departments as
-- plain links; leads, due dates, sign-offs, task departments and blocks are lost).
-- To go back further, run 20261112100000_project_departments_rollback.sql after this.
-- Deploy a front end that no longer uses these columns first.

drop trigger if exists tasks_block_notify on public.tasks;
drop trigger if exists tasks_guard_department on public.tasks;
drop trigger if exists project_departments_guard on public.project_departments;

drop function if exists public.tasks_block_notify();
drop function if exists public.tasks_guard_department();
drop function if exists public.task_block_creates_cycle(uuid, uuid);
drop function if exists public.task_department_lead(uuid);
drop function if exists public.nudge_department(uuid, uuid);
drop function if exists public.project_departments_guard();
drop function if exists public.is_department_member(uuid, uuid);

-- Notifications of the new kinds go, so the old type list can come back
delete from public.notifications where type in ('task_blocked', 'task_unblocked', 'department_nudge');
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('assignment', 'mention', 'status_change', 'project_added'));

alter table public.tasks
  drop column if exists blocked_at,
  drop column if exists blocked_by_task_id,
  drop column if exists team_space_id;

-- The lead department lives on project_spaces.team_space_id again
delete from public.project_departments where is_lead_department;
drop index if exists public.project_departments_one_lead;
alter table public.project_departments
  drop constraint if exists project_departments_status_check,
  drop column if exists signed_off_at,
  drop column if exists status,
  drop column if exists is_lead_department,
  drop column if exists due_date,
  drop column if exists lead_id;

drop policy if exists project_departments_update on public.project_departments;
revoke update on public.project_departments from authenticated;

drop policy if exists project_departments_insert on public.project_departments;
create policy project_departments_insert on public.project_departments
  for insert to authenticated
  with check (
    can_manage_project(project_id)
    and team_space_org(team_space_id) = (
      select team_space_org(ps.team_space_id) from project_spaces ps where ps.id = project_departments.project_id
    )
    and team_space_id <> (select ps.team_space_id from project_spaces ps where ps.id = project_departments.project_id)
    and (team_role_at_least(team_space_id, 'team_lead') or is_admin_of_org(team_space_org(team_space_id)))
  );

drop policy if exists project_departments_delete on public.project_departments;
create policy project_departments_delete on public.project_departments
  for delete to authenticated
  using (can_manage_project(project_id));

-- Departments on a shared project no longer see each other
alter policy team_spaces_select on public.team_spaces
  using (
    organization_id = current_org_id()
    and (has_team_access(id) or is_org_admin() or is_member_of_project_in_team(id))
  );
alter policy memberships_select on public.memberships
  using (
    user_id = auth.uid()
    or is_admin_of_org(membership_org(team_space_id, user_id))
    or (team_space_id is not null and has_team_access(team_space_id))
  );
drop function if exists public.shares_project_with_department(uuid);

drop function if exists public.leads_project_department(uuid, uuid);
drop function if exists public.project_has_department(uuid, uuid);
