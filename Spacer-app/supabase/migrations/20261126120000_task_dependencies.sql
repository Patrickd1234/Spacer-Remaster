-- A task can wait on several tasks, set from either side (Collab rework, part D1).
-- Rollback: supabase/rollback/20261126120000_task_dependencies_rollback.sql
--
-- Until now a task waited on at most one other task (tasks.blocked_by_task_id),
-- only one in another department, and only its own side could say so. Now each
-- wait is a row of task_dependencies (task_id waits on blocker_task_id), like
-- Jira's "is blocked by / blocks" links:
--   - any number per task, any task of the same project (same department too)
--   - set or removed by someone with rights on either task: its assignee or
--     creator, a lead of its department, or a project manager
--   - no loops (A waits on B waits on A)
--   - kept when the blocking task is done (resolved_at is set, cleared again if
--     it's reopened), so how long departments waited stays known
--   - a task moved to another project drops its dependencies
-- The old column is retired: its rows are copied here, it is emptied, and a
-- check keeps it empty. tasks_block_notify (on that column) is replaced, and
-- notify_department_holdups() reads the new table.

-- ─── 1. Table ───────────────────────────────────────────────────────────────
create table if not exists public.task_dependencies (
  task_id uuid not null references public.tasks(id) on delete cascade,
  blocker_task_id uuid not null references public.tasks(id) on delete cascade,
  project_id uuid not null references public.project_spaces(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  primary key (task_id, blocker_task_id),
  constraint task_dependencies_not_self check (task_id <> blocker_task_id)
);

create index if not exists task_dependencies_blocker_idx on public.task_dependencies (blocker_task_id);
create index if not exists task_dependencies_project_idx on public.task_dependencies (project_id);

-- The old single blocks become rows (resolved when the blocking task is done)
insert into public.task_dependencies (task_id, blocker_task_id, project_id, created_at, resolved_at)
select t.id, t.blocked_by_task_id, t.project_id, coalesce(t.blocked_at, now()),
       case when b.status = 'done' then now() end
from public.tasks t
join public.tasks b on b.id = t.blocked_by_task_id
where t.blocked_by_task_id is not null and t.project_id is not null
on conflict do nothing;

-- ─── 2. Who may set or remove a dependency ─────────────────────────────────
-- Rights on one task: its assignee or creator, a lead of its department, or a
-- project manager
create or replace function public.can_set_task_dependency(p_task_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from tasks t
    join project_spaces ps on ps.id = t.project_id
    where t.id = p_task_id
      and (t.assignee_id = auth.uid()
           or t.created_by = auth.uid()
           or can_manage_project(t.project_id)
           or leads_department_on_project(t.project_id, coalesce(t.team_space_id, ps.team_space_id)))
  );
$$;

revoke execute on function public.can_set_task_dependency(uuid) from public, anon;
grant execute on function public.can_set_task_dependency(uuid) to authenticated;

-- True when p_task waiting on p_blocker would loop back to p_task
create or replace function public.task_dependency_creates_cycle(p_task uuid, p_blocker uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  with recursive chain(id) as (
    select p_blocker
    union
    select d.blocker_task_id from task_dependencies d join chain c on d.task_id = c.id
  )
  select exists (select 1 from chain where id = p_task);
$$;

alter table public.task_dependencies enable row level security;

drop policy if exists task_dependencies_select on public.task_dependencies;
create policy task_dependencies_select on public.task_dependencies
  for select to authenticated using (has_project_access(project_id));

drop policy if exists task_dependencies_insert on public.task_dependencies;
create policy task_dependencies_insert on public.task_dependencies
  for insert to authenticated
  with check (has_project_access(project_id)
              and (can_set_task_dependency(task_id) or can_set_task_dependency(blocker_task_id)));

drop policy if exists task_dependencies_delete on public.task_dependencies;
create policy task_dependencies_delete on public.task_dependencies
  for delete to authenticated
  using (can_set_task_dependency(task_id) or can_set_task_dependency(blocker_task_id));

create policy mfa_required on public.task_dependencies as restrictive for all to authenticated
  using (public.mfa_satisfied()) with check (public.mfa_satisfied());

grant select, insert, delete on public.task_dependencies to authenticated;

-- ─── 3. Rules on a new dependency ──────────────────────────────────────────
create or replace function public.task_dependencies_guard()
returns trigger language plpgsql set search_path to 'public'
as $$
declare
  v_task tasks;
  v_blocker tasks;
begin
  select * into v_task from tasks where id = new.task_id;
  select * into v_blocker from tasks where id = new.blocker_task_id;
  if v_task.id is null or v_blocker.id is null then
    raise exception 'That task no longer exists' using errcode = 'P0002';
  end if;
  if v_task.project_id is null or v_task.project_id is distinct from v_blocker.project_id then
    raise exception 'A task can only wait on a task in the same project' using errcode = '23514';
  end if;
  if v_blocker.status = 'done' then
    raise exception '"%" is already done', v_blocker.title using errcode = '23514';
  end if;
  if task_dependency_creates_cycle(new.task_id, new.blocker_task_id) then
    raise exception 'That would make the tasks wait on each other' using errcode = '23514';
  end if;
  new.project_id := v_task.project_id;
  new.created_by := auth.uid();
  new.created_at := now();
  new.resolved_at := null;
  return new;
end;
$$;

drop trigger if exists task_dependencies_guard on public.task_dependencies;
create trigger task_dependencies_guard before insert on public.task_dependencies
  for each row execute function public.task_dependencies_guard();

-- A new wait on another department's task tells that department's lead
create or replace function public.task_dependencies_notify()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare
  v_actor text;
  v_task tasks;
  v_blocker tasks;
  v_lead uuid;
begin
  select * into v_task from tasks where id = new.task_id;
  select * into v_blocker from tasks where id = new.blocker_task_id;
  if coalesce(v_task.team_space_id, (select team_space_id from project_spaces where id = v_task.project_id))
     is not distinct from coalesce(v_blocker.team_space_id, (select team_space_id from project_spaces where id = v_blocker.project_id)) then
    return new; -- inside one department: no news for its lead
  end if;
  select name into v_actor from users where id = auth.uid();
  v_lead := task_department_lead(v_blocker.id);
  if v_lead is not null and v_lead is distinct from auth.uid() then
    perform notify_user(v_lead, 'task_blocked', 'task', v_blocker.id,
      coalesce(v_actor, 'Someone') || ' is waiting on "' || v_blocker.title || '" to finish "' || v_task.title || '"');
  end if;
  return new;
end;
$$;

drop trigger if exists task_dependencies_notify on public.task_dependencies;
create trigger task_dependencies_notify after insert on public.task_dependencies
  for each row execute function public.task_dependencies_notify();

-- ─── 4. Tasks: finishing, reopening, moving ─────────────────────────────────
-- Done: its waits are resolved, and a task with nothing left to wait on is
-- told it can go ahead. Reopened: its waits count again. Moved to another
-- project: its dependencies go.
create or replace function public.tasks_dependencies_follow()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare
  v_waiting record;
begin
  if tg_op = 'UPDATE' and new.project_id is distinct from old.project_id then
    delete from task_dependencies where task_id = new.id or blocker_task_id = new.id;
    return new;
  end if;
  if new.status = 'done' and old.status is distinct from 'done' then
    for v_waiting in
      update task_dependencies d set resolved_at = now()
      from tasks w
      where d.blocker_task_id = new.id and d.resolved_at is null and w.id = d.task_id
      returning w.id, w.title, w.status, w.assignee_id, w.created_by
    loop
      continue when v_waiting.status = 'done';
      continue when exists (
        select 1 from task_dependencies d2 join tasks b2 on b2.id = d2.blocker_task_id
        where d2.task_id = v_waiting.id and b2.status <> 'done' and b2.id <> new.id
      );
      if coalesce(v_waiting.assignee_id, v_waiting.created_by) is distinct from auth.uid() then
        perform notify_user(coalesce(v_waiting.assignee_id, v_waiting.created_by), 'task_unblocked', 'task', v_waiting.id,
          '"' || new.title || '" is done, so "' || v_waiting.title || '" can go ahead');
      end if;
    end loop;
  elsif old.status = 'done' and new.status is distinct from 'done' then
    update task_dependencies set resolved_at = null where blocker_task_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_block_notify on public.tasks;
drop function if exists public.tasks_block_notify();
drop trigger if exists tasks_dependencies_follow on public.tasks;
create trigger tasks_dependencies_follow after update of status, project_id on public.tasks
  for each row execute function public.tasks_dependencies_follow();

-- The department rule stays; blocks no longer live on the task
create or replace function public.tasks_guard_department()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  -- A task moved to another project drops its old department
  if tg_op = 'UPDATE' and new.project_id is distinct from old.project_id
     and new.team_space_id is not distinct from old.team_space_id then
    new.team_space_id := null;
  end if;
  if new.team_space_id is not null and new.project_id is not null
     and not project_has_department(new.project_id, new.team_space_id) then
    raise exception 'That department isn''t working on this project' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_guard_department on public.tasks;
create trigger tasks_guard_department before insert or update of team_space_id, project_id on public.tasks
  for each row execute function public.tasks_guard_department();

-- Retire the old column: emptied, and kept empty
update public.tasks set blocked_by_task_id = null, blocked_at = null where blocked_by_task_id is not null or blocked_at is not null;
do $$ begin
  alter table public.tasks add constraint tasks_blocked_by_retired
    check (blocked_by_task_id is null and blocked_at is null);
exception when duplicate_object then null; end $$;

-- ─── 5. Hourly hold-up alerts read the new table ────────────────────────────
create or replace function public.notify_department_holdups()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_escalate_after constant interval := interval '3 days';
  v_stalled_days constant int := 2;
  v_row record;
  v_reason text;
  v_line text;
  v_person uuid;
  v_sent integer := 0;
begin
  -- Forget pairs that are no longer an open wait
  delete from task_holdup_alerts a
  where not exists (
    select 1 from task_dependencies d
    join tasks w on w.id = d.task_id
    join tasks b on b.id = d.blocker_task_id
    where d.task_id = a.waiting_task_id and d.blocker_task_id = a.blocker_task_id
      and w.status <> 'done' and b.status <> 'done'
  );

  for v_row in
    select w.id as waiting_id, w.title as waiting_title, w.due_date as waiting_due, d.created_at as blocked_at,
           b.id as blocker_id, b.title as blocker_title, b.due_date as blocker_due, b.assignee_id as blocker_assignee,
           ps.id as project_id, ps.name as project_name, ps.team_lead as project_lead,
           coalesce(w.team_space_id, ps.team_space_id) as waiting_team,
           coalesce(b.team_space_id, ps.team_space_id) as blocker_team,
           a.notified_at, a.escalated_at
    from task_dependencies d
    join tasks w on w.id = d.task_id
    join tasks b on b.id = d.blocker_task_id and b.project_id = w.project_id
    join project_spaces ps on ps.id = w.project_id
    left join task_holdup_alerts a on a.waiting_task_id = w.id and a.blocker_task_id = b.id
    where w.status <> 'done' and b.status <> 'done'
      and coalesce(w.team_space_id, ps.team_space_id) is distinct from coalesce(b.team_space_id, ps.team_space_id)
      and (a.waiting_task_id is null or (a.escalated_at is null and a.notified_at <= now() - v_escalate_after))
  loop
    v_reason := case
      when v_row.blocker_due is not null and v_row.blocker_due < current_date
        then (current_date - v_row.blocker_due) || ' day' || case when current_date - v_row.blocker_due = 1 then '' else 's' end || ' late'
      when v_row.blocker_due is not null and v_row.waiting_due is not null and v_row.blocker_due > v_row.waiting_due
        then 'due after it''s needed'
      when v_row.blocker_due is null and v_row.blocked_at is not null and current_date - v_row.blocked_at::date >= v_stalled_days
        then 'waited on for ' || (current_date - v_row.blocked_at::date) || ' days, no due date'
    end;
    continue when v_reason is null; -- on schedule

    v_line := '"' || v_row.blocker_title || '" is holding up '
      || coalesce((select btrim(name) from team_spaces where id = v_row.waiting_team), 'another department')
      || ' on "' || v_row.project_name || '" (' || v_reason || ')';

    if v_row.notified_at is null then
      -- First alert: the blocking department's lead and the task's assignee
      for v_person in
        select distinct person from (
          select pd.lead_id as person from project_departments pd
          where pd.project_id = v_row.project_id and pd.team_space_id = v_row.blocker_team and pd.status <> 'invited'
          union select v_row.blocker_assignee
        ) people where person is not null
      loop
        perform notify_user(v_person, 'department_holdup', 'task', v_row.blocker_id, v_line);
        v_sent := v_sent + 1;
      end loop;
      insert into task_holdup_alerts (waiting_task_id, blocker_task_id) values (v_row.waiting_id, v_row.blocker_id)
      on conflict do nothing;
    else
      -- Still holding up after the first alert: the project lead hears too
      -- (team_lead can hold a stray id: the column used to default to a random uuid)
      if exists (select 1 from users where id = v_row.project_lead) then
        perform notify_user(v_row.project_lead, 'department_holdup', 'task', v_row.blocker_id,
          'Still: ' || v_line);
        v_sent := v_sent + 1;
      end if;
      update task_holdup_alerts set escalated_at = now()
      where waiting_task_id = v_row.waiting_id and blocker_task_id = v_row.blocker_id;
    end if;
  end loop;
  return v_sent;
end;
$$;

revoke execute on function public.notify_department_holdups() from public, anon, authenticated;

-- ─── 6. Live updates on the project page ────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_dependencies'
  ) then
    alter publication supabase_realtime add table public.task_dependencies;
  end if;
end $$;
