-- Rollback for 20261128110000_task_waiting.
-- The dependency history rows already written stay (History shows them as
-- nothing once the app no longer knows them). Notes are dropped.

-- The 20261128100000_task_statuses version (no "unblocked" row)
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

drop function if exists public.mark_task_waiting(uuid, uuid, text, boolean);
drop trigger if exists task_dependencies_log on public.task_dependencies;
drop function if exists public.task_dependencies_log();
drop function if exists public.task_department_name(uuid);
alter table public.task_dependencies drop constraint if exists task_dependencies_note_length;
alter table public.task_dependencies drop column if exists note;
