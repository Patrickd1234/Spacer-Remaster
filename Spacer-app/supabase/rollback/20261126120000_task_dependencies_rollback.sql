-- Undo 20261126120000_task_dependencies.sql: back to one blocker per task in
-- tasks.blocked_by_task_id. Each task keeps its oldest open dependency on
-- another task; the rest are lost. Deploy an app version from before part D1 first.

do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_dependencies') then
    alter publication supabase_realtime drop table public.task_dependencies;
  end if;
end $$;

drop trigger if exists tasks_dependencies_follow on public.tasks;
drop function if exists public.tasks_dependencies_follow();
alter table public.tasks drop constraint if exists tasks_blocked_by_retired;

update public.tasks t set blocked_by_task_id = d.blocker_task_id, blocked_at = d.created_at
from (
  select distinct on (d.task_id) d.task_id, d.blocker_task_id, d.created_at
  from public.task_dependencies d join public.tasks b on b.id = d.blocker_task_id
  where b.status <> 'done'
  order by d.task_id, d.created_at
) d
where t.id = d.task_id;

-- As in 20261126100000_department_holdup_alerts
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
    select 1 from tasks w join tasks b on b.id = w.blocked_by_task_id
    where w.id = a.waiting_task_id and b.id = a.blocker_task_id
      and w.status <> 'done' and b.status <> 'done'
  );

  for v_row in
    select w.id as waiting_id, w.title as waiting_title, w.due_date as waiting_due, w.blocked_at,
           b.id as blocker_id, b.title as blocker_title, b.due_date as blocker_due, b.assignee_id as blocker_assignee,
           ps.id as project_id, ps.name as project_name, ps.team_lead as project_lead,
           coalesce(w.team_space_id, ps.team_space_id) as waiting_team,
           coalesce(b.team_space_id, ps.team_space_id) as blocker_team,
           a.notified_at, a.escalated_at
    from tasks w
    join tasks b on b.id = w.blocked_by_task_id and b.project_id = w.project_id
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

-- As in 20261120100000_cross_department_projects
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

drop table if exists public.task_dependencies;
drop function if exists public.task_dependencies_guard();
drop function if exists public.task_dependencies_notify();
drop function if exists public.task_dependency_creates_cycle(uuid, uuid);
drop function if exists public.can_set_task_dependency(uuid);
