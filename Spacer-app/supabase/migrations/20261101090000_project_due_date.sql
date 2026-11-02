-- A deadline for projects. The Create Project form already asks for one and
-- the project page already reads project_spaces.due_date; neither had a column.
-- Rollback: supabase/rollback/20261101090000_project_due_date_rollback.sql
--
-- A plain date (no time), like tasks.due_date. Optional: older projects and
-- open-ended ones have none. The existing project_spaces_update policy (team
-- lead or above, or an org admin) decides who can change it.

alter table public.project_spaces
  add column if not exists due_date date;
