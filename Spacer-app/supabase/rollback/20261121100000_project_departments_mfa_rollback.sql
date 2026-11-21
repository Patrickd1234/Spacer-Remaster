-- Undo 20261121100000_project_departments_mfa.sql: removes the two-factor rule
-- from project_departments (the previous, weaker state).

drop policy if exists mfa_required on public.project_departments;
