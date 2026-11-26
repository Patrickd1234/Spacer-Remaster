-- Automatic alerts when one department holds another up (Collab rework, part B).
-- Rollback: supabase/rollback/20261126100000_department_holdup_alerts_rollback.sql
--
-- Until now the only alert was the manual Nudge on the Departments tab. Every
-- hour notify_department_holdups() looks at each open task waiting on another
-- department's open task in the same project, and when that wait holds the
-- waiting department up (the same rules as dependencyState() in the app's
-- crossDepartment.js):
--   late      the task waited on is past its due date
--   conflict  it is due after the waiting task's own due date
--   stalled   it has no due date and has been waited on for 2+ days
-- it tells the blocking department's lead and the blocking task's assignee
-- once, and if it is still holding up 3 days later, the project lead.
-- Waits that are on schedule raise nothing.
--
-- task_holdup_alerts remembers what was sent per (waiting task, blocking task),
-- so nobody hears twice; a pair that is no longer an open wait is forgotten, so
-- a later hold-up on it alerts again.

create table if not exists public.task_holdup_alerts (
  waiting_task_id uuid not null references public.tasks(id) on delete cascade,
  blocker_task_id uuid not null references public.tasks(id) on delete cascade,
  notified_at timestamptz not null default now(),
  escalated_at timestamptz,
  primary key (waiting_task_id, blocker_task_id)
);

-- Internal bookkeeping: no one reads or writes it from the app
alter table public.task_holdup_alerts enable row level security;
revoke all on public.task_holdup_alerts from anon, authenticated;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('assignment', 'mention', 'status_change', 'project_added',
                  'task_blocked', 'task_unblocked', 'department_nudge',
                  'meeting_invite', 'comment', 'department_invite', 'department_invite_reply',
                  'department_holdup'));

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

revoke execute on function public.notify_department_holdups() from public, anon, authenticated;

select cron.unschedule('department-holdups') where exists (select 1 from cron.job where jobname = 'department-holdups');
select cron.schedule('department-holdups', '15 * * * *', 'select public.notify_department_holdups()');
