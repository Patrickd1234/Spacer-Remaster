-- Undo 20261101090000_project_due_date.sql
-- Project deadlines are lost. The front end tolerates the missing column on
-- reads, but creating a project with a deadline would fail, so deploy a front
-- end that no longer sends due_date first.

alter table public.project_spaces
  drop column if exists due_date;
