-- Undo 20261126110000_collab_department_management.sql: only project managers
-- add or remove departments (adding needs project.create there again, or an
-- insert by hand), change task deadlines, add people and move a part's due date.
-- Tasks already moved to the lead department stay there.

drop trigger if exists project_departments_moved_tasks on public.project_departments;
drop function if exists public.project_departments_moved_tasks();
drop function if exists public.add_project_department(uuid, uuid, uuid, date);

-- As in 20261112110000_rbac_rules (live before this migration)
create or replace function public.tasks_guard_due_date()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if auth.uid() is not null
     and new.due_date is distinct from old.due_date
     and not (
       case
         when old.project_id is not null then can_manage_project(old.project_id)
         else has_org_permission('task.manage_unfiled', old.organization_id)
       end
     ) then
    raise exception 'Only project managers and admins can change a task''s deadline'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- As in 20261017080000_project_member_access / RBAC
alter policy project_members_insert on public.project_members
  with check (
    can_manage_project(project_id)
    and exists (select 1 from users u where u.id = project_members.user_id and u.organization_id = current_org_id())
  );

-- As in 20261120100000_cross_department_projects
alter policy project_departments_update on public.project_departments
  using (can_manage_project(project_id) or lead_id = auth.uid())
  with check (can_manage_project(project_id) or lead_id = auth.uid());

-- As in 20261124130000_department_invites
create or replace function public.project_departments_guard()
returns trigger language plpgsql set search_path to 'public'
as $$
declare
  v_project_due date;
  v_lead_team uuid;
  v_is_accepting boolean := tg_op = 'UPDATE' and old.status = 'invited' and new.status <> 'invited';
begin
  select due_date, team_space_id into v_project_due, v_lead_team from project_spaces where id = new.project_id;
  if new.is_lead_department and new.team_space_id is distinct from v_lead_team then
    raise exception 'The lead department must be the project''s own department' using errcode = '23514';
  end if;

  if new.status = 'invited' then
    if new.is_lead_department then
      raise exception 'The lead department can''t be invited' using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' and old.status <> 'invited' then
      raise exception 'A department that joined can''t go back to invited' using errcode = '23514';
    end if;
    if new.lead_id is not null then
      raise exception 'An invited department''s lead is picked when it accepts' using errcode = '23514';
    end if;
    if tg_op = 'INSERT' then
      new.invited_by := auth.uid();
      new.invited_at := now();
    else
      new.invited_by := old.invited_by;
      new.invited_at := old.invited_at;
    end if;
  end if;

  if v_is_accepting then
    if new.status <> 'active' then
      raise exception 'An invited department joins as active' using errcode = '23514';
    end if;
    if auth.uid() is not null and not has_permission('project.manage', new.team_space_id) then
      raise exception 'Only the invited department''s leads can accept the invite' using errcode = '42501';
    end if;
    if (new.is_lead_department, new.team_space_id, new.project_id) is distinct from (old.is_lead_department, old.team_space_id, old.project_id) then
      raise exception 'Accepting an invite can only set the lead and due date' using errcode = '23514';
    end if;
  end if;

  -- Checked only when the date is set, so a later, earlier project deadline
  -- doesn't stop a lead signing off
  if (tg_op = 'INSERT' or new.due_date is distinct from old.due_date)
     and new.due_date is not null and v_project_due is not null and new.due_date > v_project_due then
    raise exception 'A department can''t be due after the project''s overall deadline' using errcode = '23514';
  end if;
  -- A department's lead must belong to that department
  if new.lead_id is not null and (tg_op = 'INSERT' or new.lead_id is distinct from old.lead_id)
     and auth.uid() is not null
     and not is_department_member(new.lead_id, new.team_space_id) then
    raise exception 'A department''s lead must be a member of that department' using errcode = '23514';
  end if;
  -- A department's lead (not a project manager) may only sign the part off or undo that
  if tg_op = 'UPDATE' and not v_is_accepting and auth.uid() is not null and not can_manage_project(new.project_id)
     and (new.lead_id, new.due_date, new.is_lead_department, new.team_space_id, new.project_id)
         is distinct from (old.lead_id, old.due_date, old.is_lead_department, old.team_space_id, old.project_id) then
    raise exception 'Only project managers can change a department''s lead or due date' using errcode = '42501';
  end if;
  if new.status = 'signed_off' and (tg_op = 'INSERT' or old.status is distinct from 'signed_off') then
    new.signed_off_at := now();
  elsif new.status in ('active', 'invited') then
    new.signed_off_at := null;
  end if;
  return new;
end;
$$;

drop function if exists public.leads_department_on_project(uuid, uuid);
