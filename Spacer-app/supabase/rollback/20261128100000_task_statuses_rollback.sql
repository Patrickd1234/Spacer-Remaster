-- Rollback for 20261128100000_task_statuses.
-- Waiting tasks go back to the status they came from (To do if unknown), In
-- review ones to In progress; board columns of those kinds become In progress
-- columns. Then the earlier rules return.

-- First the earlier functions (20261126120000_task_dependencies and the schema
-- snapshot): the newer tasks_dependencies_follow() reads status_before_waiting,
-- so with the column gone it would make every "mark as done" fail.
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

create or replace function public.refresh_team_space_stats(p_team_space_id uuid)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  insert into team_space_stats (team_space_id, open_tasks, in_progress, done_tasks, active_projects, updated_at)
  select
    p_team_space_id,
    count(*) filter (where t.status = 'todo'),
    count(*) filter (where t.status = 'in_progress'),
    count(*) filter (where t.status = 'done'),
    (select count(*) from project_spaces ps where ps.team_space_id = p_team_space_id and ps.status = 'active'),
    now()
  from tasks t
  join project_spaces ps on ps.id = t.project_id
  where ps.team_space_id = p_team_space_id
  on conflict (team_space_id) do update set
    open_tasks = excluded.open_tasks,
    in_progress = excluded.in_progress,
    done_tasks = excluded.done_tasks,
    active_projects = excluded.active_projects,
    updated_at = now();
end;
$$;

update public.tasks set status = coalesce(status_before_waiting, 'todo') where status = 'waiting';
update public.tasks set status = 'in_progress' where status in ('in_review', 'waiting');
update public.project_columns set base_status = 'in_progress' where base_status in ('waiting', 'in_review');

drop trigger if exists tasks_track_waiting on public.tasks;
drop function if exists public.tasks_track_waiting();
alter table public.tasks drop constraint if exists tasks_status_before_waiting_check;
alter table public.tasks drop column if exists status_before_waiting;

alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check check (status in ('todo', 'in_progress', 'done'));
alter table public.project_columns drop constraint if exists project_columns_base_status_check;
alter table public.project_columns add constraint project_columns_base_status_check
  check (base_status in ('todo', 'in_progress', 'done'));

select public.refresh_team_space_stats(id) from public.team_spaces;
