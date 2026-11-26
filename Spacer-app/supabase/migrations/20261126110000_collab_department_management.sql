-- Managing a Collab project's departments, and department leads running their
-- part (Collab rework, part C = steps 3 and 4).
-- Rollback: supabase/rollback/20261126110000_collab_department_management_rollback.sql
--
-- Step 3, managing departments on an existing project (project managers):
--   add_project_department(): add one at once where the manager can create
--   projects, otherwise invite it (as when creating a project). Changing a
--   department's lead or due date uses the existing update policy. Removing a
--   department that joined moves its tasks to the lead department
--   (project_departments_moved_tasks trigger) and logs it.
--
-- Step 4, a department's lead (its named lead, or someone with project.manage
-- in that department) on a project they don't manage:
--   - changes the deadlines of their department's tasks (tasks_guard_due_date)
--   - adds people from their department to the project (project_members_insert)
--   - moves their part's due date, within the overall deadline (update policy
--     and guard); its lead stays with the managers
-- Nothing here lets them delete anything.

-- ─── Who leads a department on a project ───────────────────────────────────
-- The department is on the project (not just invited) and the caller leads it
create or replace function public.leads_department_on_project(p_project_id uuid, p_team_space_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select project_has_department(p_project_id, p_team_space_id)
     and leads_project_department(p_project_id, p_team_space_id);
$$;

revoke execute on function public.leads_department_on_project(uuid, uuid) from public, anon;
grant execute on function public.leads_department_on_project(uuid, uuid) to authenticated;

-- ─── Step 4: task deadlines ─────────────────────────────────────────────────
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
         when old.project_id is not null then
           can_manage_project(old.project_id)
           or leads_department_on_project(old.project_id, coalesce(old.team_space_id,
                (select team_space_id from project_spaces where id = old.project_id)))
         else has_org_permission('task.manage_unfiled', old.organization_id)
       end
     ) then
    raise exception 'Only project managers, the task''s department lead and admins can change a task''s deadline'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ─── Step 4: adding people ──────────────────────────────────────────────────
alter policy project_members_insert on public.project_members
  with check (
    exists (select 1 from users u where u.id = project_members.user_id and u.organization_id = current_org_id())
    and (
      can_manage_project(project_id)
      or exists (
        select 1 from project_departments pd
        where pd.project_id = project_members.project_id
          and pd.status <> 'invited'
          and leads_project_department(pd.project_id, pd.team_space_id)
          and is_department_member(project_members.user_id, pd.team_space_id)
      )
    )
  );

-- ─── Step 4: a part's due date ──────────────────────────────────────────────
alter policy project_departments_update on public.project_departments
  using (can_manage_project(project_id) or lead_id = auth.uid()
         or (status <> 'invited' and has_permission('project.manage', team_space_id)))
  with check (can_manage_project(project_id) or lead_id = auth.uid()
         or (status <> 'invited' and has_permission('project.manage', team_space_id)));

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
  -- A department's lead (not a project manager) may sign the part off or undo
  -- that, and move its due date (within the deadline, checked above); its lead
  -- and everything else stay with the project's managers
  if tg_op = 'UPDATE' and not v_is_accepting and auth.uid() is not null and not can_manage_project(new.project_id)
     and (new.lead_id, new.is_lead_department, new.team_space_id, new.project_id)
         is distinct from (old.lead_id, old.is_lead_department, old.team_space_id, old.project_id) then
    raise exception 'Only project managers can change a department''s lead' using errcode = '42501';
  end if;
  if new.status = 'signed_off' and (tg_op = 'INSERT' or old.status is distinct from 'signed_off') then
    new.signed_off_at := now();
  elsif new.status in ('active', 'invited') then
    new.signed_off_at := null;
  end if;
  return new;
end;
$$;

-- ─── Step 3: adding a department to an existing project ────────────────────
-- Security invoker: the insert and member policies decide; the checks only
-- give readable messages. Returns 'active' (joined) or 'invited'.
create or replace function public.add_project_department(
  p_project_id uuid,
  p_team_space_id uuid,
  p_lead_id uuid default null,
  p_due_date date default null
)
returns text
language plpgsql
set search_path to public, pg_temp
as $$
declare
  v_project project_spaces;
  v_name text;
  v_is_direct boolean;
  v_due date;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  select * into v_project from project_spaces where id = p_project_id;
  if not found or not can_manage_project(p_project_id) then
    raise exception 'Only the project''s managers can add departments.' using errcode = '42501';
  end if;
  select d.name into v_name from organization_departments() d where d.id = p_team_space_id;
  if v_name is null then
    raise exception 'Pick a department of your organization.' using errcode = '22023';
  end if;
  if exists (select 1 from project_departments where project_id = p_project_id and team_space_id = p_team_space_id)
     or v_project.team_space_id = p_team_space_id then
    raise exception '% is already on this project.', btrim(v_name) using errcode = '23514';
  end if;
  v_due := coalesce(p_due_date, v_project.due_date);
  if v_project.due_date is not null and v_due > v_project.due_date then
    raise exception '% can''t be due after the project''s deadline.', btrim(v_name) using errcode = '23514';
  end if;

  v_is_direct := has_permission('project.create', p_team_space_id);
  if not v_is_direct and p_lead_id is not null then
    raise exception '%''s lead is picked by % when they accept the invite.', btrim(v_name), btrim(v_name) using errcode = '23514';
  end if;

  insert into project_departments (project_id, team_space_id, lead_id, due_date, is_lead_department, status)
  values (p_project_id, p_team_space_id, case when v_is_direct then p_lead_id end, v_due, false,
          case when v_is_direct then 'active' else 'invited' end);

  if v_is_direct then
    if p_lead_id is not null then
      insert into project_members (project_id, user_id) values (p_project_id, p_lead_id)
      on conflict (project_id, user_id) do nothing;
    end if;
    insert into activity_log (entity_type, entity_id, actor_id, action, new_state)
    values ('project', p_project_id, auth.uid(), 'department_added',
            jsonb_build_object('project_id', p_project_id, 'project_name', v_project.name,
                               'team_space_id', p_team_space_id, 'department', btrim(v_name)));
    return 'active';
  end if;
  return 'invited'; -- the invite trigger notifies the department and logs it
end;
$$;

revoke execute on function public.add_project_department(uuid, uuid, uuid, date) from public, anon;
grant execute on function public.add_project_department(uuid, uuid, uuid, date) to authenticated;

-- ─── Step 3: removing a department ──────────────────────────────────────────
-- Its tasks move to the lead department (no department = the lead one); blocks
-- between tasks stay. Withdrawn invites had no tasks and log nothing here.
-- Skipped when the whole project is being deleted.
create or replace function public.project_departments_moved_tasks()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare
  v_project text;
  v_moved int;
begin
  if old.status = 'invited' then return old; end if;
  select name into v_project from project_spaces where id = old.project_id;
  if v_project is null then return old; end if;
  update tasks set team_space_id = null where project_id = old.project_id and team_space_id = old.team_space_id;
  get diagnostics v_moved = row_count;
  insert into activity_log (entity_type, entity_id, actor_id, action, new_state)
  values ('project', old.project_id, auth.uid(), 'department_removed',
          jsonb_build_object('project_id', old.project_id, 'project_name', v_project, 'team_space_id', old.team_space_id,
                             'department', (select btrim(name) from team_spaces where id = old.team_space_id),
                             'moved_tasks', v_moved));
  return old;
end;
$$;

drop trigger if exists project_departments_moved_tasks on public.project_departments;
create trigger project_departments_moved_tasks after delete on public.project_departments
  for each row execute function public.project_departments_moved_tasks();
