-- Undo 20261109090000_task_deadline_managers.sql
-- Anyone who can edit a project can change its tasks' deadlines again.
-- No data is lost.

drop trigger if exists tasks_guard_due_date on public.tasks;
drop function if exists public.tasks_guard_due_date();
