-- Waiting and In review become task statuses (design doc "Project Creation &
-- Cross-Department Workflow", user decision of 26 Nov 2026).
-- Rollback: supabase/rollback/20261128100000_task_statuses_rollback.sql
--
-- * tasks.status and project_columns.base_status allow 'waiting' and 'in_review'
-- * tasks.status_before_waiting remembers what a task was before it became
--   Waiting; leaving Waiting by hand forgets it
-- * when the last task a Waiting task waits on is done, it goes back to that
--   status (To do if unknown). A task someone already moved out of Waiting is
--   left alone. The existing "can go ahead" notice says where it went.
-- * department stats count Waiting and In review as in progress

-- ─── 1. Allowed values ──────────────────────────────────────────────────────
alter table public.tasks drop constraint if exists tasks_status_check;
alter table public.tasks add constraint tasks_status_check
  check (status in ('todo', 'in_progress', 'waiting', 'in_review', 'done'));

alter table public.project_columns drop constraint if exists project_columns_base_status_check;
alter table public.project_columns add constraint project_columns_base_status_check
  check (base_status in ('todo', 'in_progress', 'waiting', 'in_review', 'done'));

-- ─── 2. Where a Waiting task came from ──────────────────────────────────────
alter table public.tasks add column if not exists status_before_waiting text;
alter table public.tasks drop constraint if exists tasks_status_before_waiting_check;
alter table public.tasks add constraint tasks_status_before_waiting_check
  check (status_before_waiting is null or status_before_waiting in ('todo', 'in_progress', 'in_review'));

create or replace function public.tasks_track_waiting()
returns trigger language plpgsql set search_path to 'public'
as $$
begin
  if new.status = 'waiting' then
    if tg_op = 'INSERT' then
      new.status_before_waiting := null;
    elsif old.status is distinct from 'waiting' then
      new.status_before_waiting := case when old.status in ('todo', 'in_progress', 'in_review') then old.status end;
    else
      new.status_before_waiting := old.status_before_waiting;
    end if;
  else
    new.status_before_waiting := null;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_track_waiting on public.tasks;
create trigger tasks_track_waiting
  before insert or update of status, status_before_waiting on public.tasks
  for each row execute function public.tasks_track_waiting();

-- ─── 3. Finishing the last task waited on ends the wait ─────────────────────
-- Same as 20261126120000_task_dependencies, plus: a task still Waiting with
-- nothing left open goes back to its earlier status.
create or replace function public.tasks_dependencies_follow()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare
  v_waiting record;
  v_back text;
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
      returning w.id, w.title, w.status, w.status_before_waiting, w.assignee_id, w.created_by
    loop
      continue when v_waiting.status = 'done';
      continue when exists (
        select 1 from task_dependencies d2 join tasks b2 on b2.id = d2.blocker_task_id
        where d2.task_id = v_waiting.id and b2.status <> 'done' and b2.id <> new.id
      );
      v_back := null;
      if v_waiting.status = 'waiting' then
        v_back := coalesce(v_waiting.status_before_waiting, 'todo');
        -- column_id cleared: the board puts it in the first column of that status
        update tasks set status = v_back, column_id = null where id = v_waiting.id and status = 'waiting';
      end if;
      if coalesce(v_waiting.assignee_id, v_waiting.created_by) is distinct from auth.uid() then
        perform notify_user(coalesce(v_waiting.assignee_id, v_waiting.created_by), 'task_unblocked', 'task', v_waiting.id,
          '"' || new.title || '" is done, so "' || v_waiting.title || '" can go ahead'
            || case v_back when 'todo' then ' (back in To do)' when 'in_progress' then ' (back in In progress)'
                           when 'in_review' then ' (back in In review)' else '' end);
      end if;
    end loop;
  elsif old.status = 'done' and new.status is distinct from 'done' then
    update task_dependencies set resolved_at = null where blocker_task_id = new.id;
  end if;
  return new;
end;
$$;

-- ─── 4. Department stats ────────────────────────────────────────────────────
create or replace function public.refresh_team_space_stats(p_team_space_id uuid)
returns void language plpgsql security definer set search_path to 'public'
as $$
begin
  insert into team_space_stats (team_space_id, open_tasks, in_progress, done_tasks, active_projects, updated_at)
  select
    p_team_space_id,
    count(*) filter (where t.status = 'todo'),
    count(*) filter (where t.status in ('in_progress', 'waiting', 'in_review')),
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

select public.refresh_team_space_stats(id) from public.team_spaces;
