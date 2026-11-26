-- Mark as waiting, dependency notes and an auditable dependency history
-- (design doc "Project Creation & Cross-Department Workflow", screens 03, 05, 09).
-- Rollback: supabase/rollback/20261128110000_task_waiting_rollback.sql
--
-- * task_dependencies.note: why the task waits (optional, up to 500 characters)
-- * mark_task_waiting(): adds the dependency (with its note) and, unless only a
--   dependency is wanted, sets the task to Waiting, in one transaction. Security
--   invoker: the dependency and task policies decide, as before
-- * activity_log rows on the waiting task for a dependency added or removed by
--   someone, and for the task being unblocked when the last task it waits on
--   is done, so the task's History tells the whole story

-- ─── 1. The note ────────────────────────────────────────────────────────────
alter table public.task_dependencies add column if not exists note text;
alter table public.task_dependencies drop constraint if exists task_dependencies_note_length;
alter table public.task_dependencies
  add constraint task_dependencies_note_length check (note is null or char_length(note) <= 500);

-- ─── 2. History of dependencies ─────────────────────────────────────────────
-- A task's department name (its own, else its project's)
create or replace function public.task_department_name(p_task_id uuid)
returns text language sql stable security definer set search_path to 'public'
as $$
  select ts.name::text
  from tasks t
  left join project_spaces ps on ps.id = t.project_id
  join team_spaces ts on ts.id = coalesce(t.team_space_id, ps.team_space_id)
  where t.id = p_task_id;
$$;

revoke execute on function public.task_department_name(uuid) from public, anon, authenticated;

-- Added or removed by someone. Rows deleted as a side effect (a task deleted
-- or moved to another project) aren't logged: pg_trigger_depth() > 1.
create or replace function public.task_dependencies_log()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare
  v_row task_dependencies := case when tg_op = 'DELETE' then old else new end;
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  insert into activity_log (entity_type, entity_id, actor_id, action, prior_state, new_state)
  select 'task', v_row.task_id, auth.uid(),
         case when tg_op = 'INSERT' then 'dependency_added' else 'dependency_removed' end,
         null,
         jsonb_build_object(
           'title', w.title, 'project_id', v_row.project_id,
           'blocker_task_id', v_row.blocker_task_id, 'blocker_title', b.title,
           'blocker_department', task_department_name(v_row.blocker_task_id),
           'note', v_row.note)
  from tasks w, tasks b
  where w.id = v_row.task_id and b.id = v_row.blocker_task_id;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function public.task_dependencies_log() from public, anon, authenticated;

drop trigger if exists task_dependencies_log on public.task_dependencies;
create trigger task_dependencies_log
  after insert or delete on public.task_dependencies
  for each row execute function public.task_dependencies_log();

-- ─── 3. Unblocking is logged too ────────────────────────────────────────────
-- Same as 20261128100000_task_statuses, plus an "unblocked" row on the task
-- that has nothing left to wait on.
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
      insert into activity_log (entity_type, entity_id, actor_id, action, prior_state, new_state)
      values ('task', v_waiting.id, auth.uid(), 'unblocked', null,
              jsonb_build_object('title', v_waiting.title, 'project_id', new.project_id,
                                 'blocker_task_id', new.id, 'blocker_title', new.title,
                                 'blocker_department', task_department_name(new.id),
                                 'status', coalesce(v_back, v_waiting.status)));
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

-- ─── 4. Mark as waiting ─────────────────────────────────────────────────────
-- p_task_id waits on p_blocker_task_id, with an optional note. With
-- p_set_waiting (the default) the task also becomes Waiting; false only adds
-- the dependency ("Add dependency").
create or replace function public.mark_task_waiting(
  p_task_id uuid, p_blocker_task_id uuid, p_note text default null, p_set_waiting boolean default true
)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_task tasks;
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception 'The note can be at most 500 characters.' using errcode = '22023';
  end if;
  select * into v_task from tasks where id = p_task_id;
  if v_task.id is null then
    raise exception 'That task no longer exists' using errcode = 'P0002';
  end if;
  if v_task.status = 'done' then
    raise exception '"%" is already done', v_task.title using errcode = '23514';
  end if;
  if p_task_id = p_blocker_task_id then
    raise exception 'A task can''t wait on itself' using errcode = '23514';
  end if;
  if exists (select 1 from task_dependencies where task_id = p_task_id and blocker_task_id = p_blocker_task_id) then
    raise exception 'It already waits on that task' using errcode = '23514';
  end if;

  -- The guard checks the project, a finished blocker and loops; the policy, rights
  insert into task_dependencies (task_id, blocker_task_id, project_id, note)
  values (p_task_id, p_blocker_task_id, v_task.project_id, v_note);

  if p_set_waiting and v_task.status <> 'waiting' then
    update tasks set status = 'waiting', column_id = null where id = p_task_id;
    get diagnostics v_count = row_count;
    if v_count = 0 then
      raise exception 'You can''t change this task''s status' using errcode = '42501';
    end if;
  end if;
end;
$$;

revoke execute on function public.mark_task_waiting(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.mark_task_waiting(uuid, uuid, text, boolean) to authenticated;
