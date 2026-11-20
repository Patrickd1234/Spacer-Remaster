-- Cross-department projects (design: Spacer_Cross_Department_Projects, 17 Nov 2026).
-- A project can have several departments, each with its own lead and due date;
-- tasks belong to a department and can wait on another department's task; and
-- the project shows which department is holding it up (worked out in the app
-- from tasks, never stored).
-- Rollback: supabase/rollback/20261117090000_cross_department_projects_rollback.sql
--
-- Includes 20261112100000_project_departments, so it is safe to run whether or
-- not that one has run (every step can run twice).
--
-- Access: members of any of a project's departments can see it and work on its
-- tasks. Managing it (departments, leads, dates) stays with the lead
-- department's team leads and the organization's admins. A department's lead
-- can sign its part off. A block can be set or cleared by the task's assignee
-- or creator, a lead of its department, or a project manager.

-- ─── 1. project_departments: every department on a project ──────────────────
create table if not exists public.project_departments (
  project_id uuid not null references public.project_spaces(id) on delete cascade,
  team_space_id uuid not null references public.team_spaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (project_id, team_space_id)
);

alter table public.project_departments
  add column if not exists lead_id uuid references public.users(id) on delete set null,
  add column if not exists due_date date,
  add column if not exists is_lead_department boolean not null default false,
  add column if not exists status text not null default 'active',
  add column if not exists signed_off_at timestamptz;

do $$ begin
  alter table public.project_departments
    add constraint project_departments_status_check check (status in ('active', 'signed_off'));
exception when duplicate_object then null; end $$;

create index if not exists project_departments_team_space_idx
  on public.project_departments (team_space_id);

-- Existing projects become single-department: their own department is the lead
-- (project_spaces.team_space_id stays the lead department, so nothing else changes)
insert into public.project_departments (project_id, team_space_id, lead_id, due_date, is_lead_department)
select ps.id, ps.team_space_id, (select u.id from public.users u where u.id = ps.team_lead), ps.due_date, true
from public.project_spaces ps
-- Rows from 20261112100000 were never the lead department, so there is nothing to
-- update; DO NOTHING also keeps a second run clear of project_departments_guard.
on conflict (project_id, team_space_id) do nothing;

create unique index if not exists project_departments_one_lead
  on public.project_departments (project_id) where is_lead_department;

-- ─── 2. Tasks: a department, and what they wait on ──────────────────────────
-- No department = the lead department, so existing tasks need no backfill.
alter table public.tasks
  add column if not exists team_space_id uuid references public.team_spaces(id) on delete set null,
  add column if not exists blocked_by_task_id uuid references public.tasks(id) on delete set null,
  add column if not exists blocked_at timestamptz;

create index if not exists tasks_blocked_by_idx
  on public.tasks (blocked_by_task_id) where blocked_by_task_id is not null;

-- ─── 3. Access helpers ──────────────────────────────────────────────────────
create or replace function public.has_extra_department_access(p_project_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from project_departments pd
    where pd.project_id = p_project_id and has_team_access(pd.team_space_id)
  );
$$;

create or replace function public.extra_department_role_at_least(p_project_id uuid, p_min membership_role)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from project_departments pd
    where pd.project_id = p_project_id and team_role_at_least(pd.team_space_id, p_min)
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

-- Is the department one of the project's (lead or added)
create or replace function public.project_has_department(p_project_id uuid, p_team_space_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (select 1 from project_spaces where id = p_project_id and team_space_id = p_team_space_id)
      or exists (select 1 from project_departments where project_id = p_project_id and team_space_id = p_team_space_id);
$$;

-- Leads a department's part of the project: its named lead, or a team lead of that department
create or replace function public.leads_project_department(p_project_id uuid, p_team_space_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select team_role_at_least(p_team_space_id, 'team_lead')
      or exists (
        select 1 from project_departments
        where project_id = p_project_id and team_space_id = p_team_space_id and lead_id = auth.uid()
      );
$$;

alter policy project_spaces_select on public.project_spaces
  using (
    has_team_access(team_space_id)
    or is_project_member(id)
    or is_admin_of_org(team_space_org(team_space_id))
    or has_extra_department_access(id)
  );

-- Departments working together on a project can see each other: their names
-- (team_spaces) and their members (memberships), so leads can name and add
-- people from every department on the project. Nothing wider than that.
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

alter policy team_spaces_select on public.team_spaces
  using (
    organization_id = current_org_id()
    and (has_team_access(id) or is_org_admin() or is_member_of_project_in_team(id) or shares_project_with_department(id))
  );

alter policy memberships_select on public.memberships
  using (
    user_id = auth.uid()
    or is_admin_of_org(membership_org(team_space_id, user_id))
    or (team_space_id is not null and has_team_access(team_space_id))
    or (team_space_id is not null and shares_project_with_department(team_space_id))
  );

-- ─── 4. project_departments: rules and policies ─────────────────────────────
-- Whether a user belongs to a department (whatever memberships the caller can see)
create or replace function public.is_department_member(p_user_id uuid, p_team_space_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (select 1 from memberships where user_id = p_user_id and team_space_id = p_team_space_id);
$$;

create or replace function public.project_departments_guard()
returns trigger language plpgsql set search_path to 'public'
as $$
declare
  v_project_due date;
  v_lead_team uuid;
begin
  select due_date, team_space_id into v_project_due, v_lead_team from project_spaces where id = new.project_id;
  if new.is_lead_department and new.team_space_id is distinct from v_lead_team then
    raise exception 'The lead department must be the project''s own department' using errcode = '23514';
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
  if tg_op = 'UPDATE' and auth.uid() is not null and not can_manage_project(new.project_id)
     and (new.lead_id, new.due_date, new.is_lead_department, new.team_space_id, new.project_id)
         is distinct from (old.lead_id, old.due_date, old.is_lead_department, old.team_space_id, old.project_id) then
    raise exception 'Only project managers can change a department''s lead or due date' using errcode = '42501';
  end if;
  if new.status = 'signed_off' and (tg_op = 'INSERT' or old.status is distinct from 'signed_off') then
    new.signed_off_at := now();
  elsif new.status = 'active' then
    new.signed_off_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists project_departments_guard on public.project_departments;
create trigger project_departments_guard before insert or update on public.project_departments
  for each row execute function public.project_departments_guard();

alter table public.project_departments enable row level security;

drop policy if exists project_departments_select on public.project_departments;
create policy project_departments_select on public.project_departments
  for select to authenticated
  using (has_project_access(project_id));

-- Whoever manages the project adds departments of the same organization in
-- which they could create projects themselves (team lead+ or org admin)
drop policy if exists project_departments_insert on public.project_departments;
create policy project_departments_insert on public.project_departments
  for insert to authenticated
  with check (
    can_manage_project(project_id)
    and team_space_org(team_space_id) = (
      select team_space_org(ps.team_space_id) from project_spaces ps where ps.id = project_departments.project_id
    )
    and (team_role_at_least(team_space_id, 'team_lead') or is_admin_of_org(team_space_org(team_space_id)))
  );

drop policy if exists project_departments_update on public.project_departments;
create policy project_departments_update on public.project_departments
  for update to authenticated
  using (can_manage_project(project_id) or lead_id = auth.uid())
  with check (can_manage_project(project_id) or lead_id = auth.uid());

-- The lead department can't be removed
drop policy if exists project_departments_delete on public.project_departments;
create policy project_departments_delete on public.project_departments
  for delete to authenticated
  using (can_manage_project(project_id) and not is_lead_department);

grant select, insert, update, delete on public.project_departments to authenticated;

-- ─── 5. Tasks: department and block rules ───────────────────────────────────
-- True when p_task waiting on p_blocker would loop back to p_task
create or replace function public.task_block_creates_cycle(p_task uuid, p_blocker uuid)
returns boolean language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_current uuid := p_blocker;
  v_steps int := 0;
begin
  while v_current is not null and v_steps < 1000 loop
    if v_current = p_task then return true; end if;
    select blocked_by_task_id into v_current from tasks where id = v_current;
    v_steps := v_steps + 1;
  end loop;
  return false;
end;
$$;

create or replace function public.tasks_guard_department()
returns trigger language plpgsql set search_path to 'public'
as $$
declare
  v_blocker_project uuid;
  v_auto boolean := coalesce(current_setting('spacer.auto_unblock', true), '') = 'on';
begin
  -- A task moved to another project drops its old department and block (no
  -- block-rights check for that: the mover isn't choosing to clear it)
  if tg_op = 'UPDATE' and new.project_id is distinct from old.project_id then
    if new.team_space_id is not distinct from old.team_space_id then new.team_space_id := null; end if;
    if new.blocked_by_task_id is not distinct from old.blocked_by_task_id then
      new.blocked_by_task_id := null;
      v_auto := true;
    end if;
  end if;

  if new.team_space_id is not null and new.project_id is not null
     and not project_has_department(new.project_id, new.team_space_id) then
    raise exception 'That department isn''t working on this project' using errcode = '23514';
  end if;

  if new.blocked_by_task_id is distinct from (case when tg_op = 'UPDATE' then old.blocked_by_task_id end) then
    if new.blocked_by_task_id is not null then
      select project_id into v_blocker_project from tasks where id = new.blocked_by_task_id;
      if v_blocker_project is distinct from new.project_id then
        raise exception 'A task can only wait on a task in the same project' using errcode = '23514';
      end if;
      if task_block_creates_cycle(new.id, new.blocked_by_task_id) then
        raise exception 'That would make the two tasks wait on each other' using errcode = '23514';
      end if;
      new.blocked_at := now();
    else
      new.blocked_at := null;
    end if;

    -- Who may set or clear a block (finishing the blocking task clears it for everyone)
    if tg_op = 'UPDATE' and auth.uid() is not null and not v_auto
       and auth.uid() is distinct from old.assignee_id
       and auth.uid() is distinct from old.created_by
       and not leads_project_department(old.project_id, coalesce(old.team_space_id,
             (select team_space_id from project_spaces where id = old.project_id)))
       and not can_manage_project(old.project_id) then
      raise exception 'Only the task''s owner, its department lead or an admin can set or clear a block' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_guard_department on public.tasks;
create trigger tasks_guard_department before insert or update of team_space_id, blocked_by_task_id, project_id on public.tasks
  for each row execute function public.tasks_guard_department();

-- ─── 6. Notifications ───────────────────────────────────────────────────────
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('assignment', 'mention', 'status_change', 'project_added',
                  'task_blocked', 'task_unblocked', 'department_nudge'));

-- The department lead of the department a task belongs to
create or replace function public.task_department_lead(p_task_id uuid)
returns uuid language sql stable security definer set search_path to 'public'
as $$
  select pd.lead_id
  from tasks t
  join project_spaces ps on ps.id = t.project_id
  join project_departments pd on pd.project_id = t.project_id and pd.team_space_id = coalesce(t.team_space_id, ps.team_space_id)
  where t.id = p_task_id;
$$;

create or replace function public.tasks_block_notify()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare
  v_actor text;
  v_blocker tasks%rowtype;
  v_lead uuid;
  v_waiting record;
begin
  select name into v_actor from users where id = auth.uid();

  -- A new block: tell the lead of the department being waited on
  if new.blocked_by_task_id is not null and new.blocked_by_task_id is distinct from old.blocked_by_task_id then
    select * into v_blocker from tasks where id = new.blocked_by_task_id;
    v_lead := task_department_lead(v_blocker.id);
    if v_lead is not null and v_lead is distinct from auth.uid() then
      perform notify_user(v_lead, 'task_blocked', 'task', v_blocker.id,
        coalesce(v_actor, 'Someone') || ' is waiting on "' || v_blocker.title || '" to finish "' || new.title || '"');
    end if;
  end if;

  -- The task is done: every task waiting on it can go ahead
  if new.status = 'done' and old.status is distinct from 'done' then
    perform set_config('spacer.auto_unblock', 'on', true);
    for v_waiting in
      update tasks set blocked_by_task_id = null where blocked_by_task_id = new.id
      returning id, title, assignee_id, created_by
    loop
      if coalesce(v_waiting.assignee_id, v_waiting.created_by) is distinct from auth.uid() then
        perform notify_user(coalesce(v_waiting.assignee_id, v_waiting.created_by), 'task_unblocked', 'task', v_waiting.id,
          '"' || new.title || '" is done, so "' || v_waiting.title || '" can go ahead');
      end if;
    end loop;
    perform set_config('spacer.auto_unblock', 'off', true);
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_block_notify on public.tasks;
create trigger tasks_block_notify after update of blocked_by_task_id, status on public.tasks
  for each row execute function public.tasks_block_notify();

-- Nudge a department's lead about the project. Project managers and any of the
-- project's department leads may nudge; once an hour per department per person.
create or replace function public.nudge_department(p_project_id uuid, p_team_space_id uuid)
returns void language plpgsql security definer set search_path to 'public'
as $$
declare
  v_lead uuid;
  v_actor text;
  v_project text;
  v_department text;
begin
  if not (can_manage_project(p_project_id)
          or exists (select 1 from project_departments where project_id = p_project_id and lead_id = auth.uid())) then
    raise exception 'Only project managers and department leads can send a nudge' using errcode = '42501';
  end if;
  select lead_id into v_lead from project_departments where project_id = p_project_id and team_space_id = p_team_space_id;
  if v_lead is null then
    raise exception 'That department has no lead to nudge' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from activity_log
    where action = 'department_nudged' and entity_id = p_project_id and actor_id = auth.uid()
      and new_state ->> 'team_space_id' = p_team_space_id::text
      and created_at > now() - interval '1 hour'
  ) then
    raise exception 'You already nudged this department in the last hour' using errcode = 'P0001';
  end if;

  select name into v_actor from users where id = auth.uid();
  select name into v_project from project_spaces where id = p_project_id;
  select name into v_department from team_spaces where id = p_team_space_id;
  perform notify_user(v_lead, 'department_nudge', 'project', p_project_id,
    coalesce(v_actor, 'Someone') || ' nudged ' || coalesce(v_department, 'your department')
      || ' about "' || coalesce(v_project, 'a project') || '"');
  insert into activity_log (entity_type, entity_id, actor_id, action, new_state)
  values ('project', p_project_id, auth.uid(), 'department_nudged',
          jsonb_build_object('project_id', p_project_id, 'team_space_id', p_team_space_id, 'department', v_department));
end;
$$;

revoke execute on function public.nudge_department(uuid, uuid) from public, anon;
grant execute on function public.nudge_department(uuid, uuid) to authenticated;
