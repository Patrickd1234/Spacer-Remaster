-- Undo 20261030090000_standups_department.sql (stand-ups lose their department)
drop index if exists public.daily_standups_team_space_date_idx;
alter table public.daily_standups drop column if exists team_space_id;
