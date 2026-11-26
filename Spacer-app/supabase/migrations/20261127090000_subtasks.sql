-- Subtasks (part E): a task can have subtasks, which are ordinary tasks with
-- parent_task_id set. The column and its index already exist and are unused.
--
-- Rules, checked by tasks_guard_parent:
--   * one level deep: a subtask can't have subtasks, and a task that has
--     subtasks can't become one;
--   * same project and organization as the parent (a task can't be its own);
--   * a task with subtasks can't move to another project (move or detach its
--     subtasks first), and a subtask can't move away from its parent's project.
-- Deleting a task keeps its subtasks as tasks of their own (the foreign key
-- was ON DELETE CASCADE, which would have removed other people's work without
-- their delete rights).
-- Rights are unchanged: adding a subtask is adding a task (tasks_insert), and
-- setting or clearing parent_task_id is editing a task (tasks_update).

alter table public.tasks drop constraint if exists tasks_parent_task_id_fkey;
alter table public.tasks
  add constraint tasks_parent_task_id_fkey
  foreign key (parent_task_id) references public.tasks(id) on delete set null;

create or replace function public.tasks_guard_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent record;
begin
  if new.parent_task_id is not null then
    if new.parent_task_id = new.id then
      raise exception 'A task can''t be its own subtask.'
        using errcode = 'P0001', hint = 'subtask';
    end if;

    select id, project_id, organization_id, parent_task_id
      into v_parent
      from tasks
     where id = new.parent_task_id;

    -- One message for "no such task" and "another project", so nothing about
    -- tasks elsewhere is revealed
    if not found
       or v_parent.organization_id is distinct from new.organization_id
       or v_parent.project_id is distinct from new.project_id then
      raise exception 'A subtask must be in the same project as its parent.'
        using errcode = 'P0001', hint = 'subtask';
    end if;

    if v_parent.parent_task_id is not null then
      raise exception 'A subtask can''t have subtasks of its own.'
        using errcode = 'P0001', hint = 'subtask';
    end if;

    if tg_op = 'UPDATE' and exists (select 1 from tasks where parent_task_id = new.id) then
      raise exception 'A task with subtasks can''t become a subtask.'
        using errcode = 'P0001', hint = 'subtask';
    end if;
  end if;

  if tg_op = 'UPDATE'
     and new.project_id is distinct from old.project_id
     and exists (select 1 from tasks where parent_task_id = new.id) then
    raise exception 'Move or detach this task''s subtasks before moving it to another project.'
      using errcode = 'P0001', hint = 'subtask';
  end if;

  return new;
end;
$$;

revoke all on function public.tasks_guard_parent() from public, anon, authenticated;

drop trigger if exists tasks_guard_parent on public.tasks;
create trigger tasks_guard_parent
  before insert or update of parent_task_id, project_id on public.tasks
  for each row execute function public.tasks_guard_parent();
