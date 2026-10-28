-- Undo for 20261026090000_project_columns.sql.
-- Tasks keep their status, so boards fall back to the default
-- Backlog / Doing / Done columns. Custom column names and order are lost.

drop trigger if exists tasks_column_matches_project on public.tasks;
drop function if exists public.tasks_column_matches_project();

drop index if exists public.tasks_column_id_idx;
alter table public.tasks drop column if exists column_id;

drop table if exists public.project_columns;
