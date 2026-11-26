-- Rollback for 20261127090000_subtasks. Subtasks stay as tasks; detach them
-- first if the old cascade should not apply to them:
--   update public.tasks set parent_task_id = null where parent_task_id is not null;
drop trigger if exists tasks_guard_parent on public.tasks;
drop function if exists public.tasks_guard_parent();

alter table public.tasks drop constraint if exists tasks_parent_task_id_fkey;
alter table public.tasks
  add constraint tasks_parent_task_id_fkey
  foreign key (parent_task_id) references public.tasks(id) on delete cascade;
