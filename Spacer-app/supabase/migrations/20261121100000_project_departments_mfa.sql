-- Add the two-factor rule to project_departments.
--
-- Every table with user data has the restrictive mfa_required policy
-- (20261018090000_enforce_mfa.sql), so a session that hasn't passed two-factor
-- gets nothing. project_departments (20261120090000) was created without it:
-- someone with only a password could read and change which departments work on
-- a project, within their normal permissions.
--
-- Restrictive: it narrows the existing policies, it doesn't grant anything.
-- Accounts exempt from two-factor (20261121090000_mfa_exempt_users.sql) pass
-- mfa_satisfied(), so they keep their access.
--
-- Rollback: supabase/rollback/20261121100000_project_departments_mfa_rollback.sql

create policy mfa_required on public.project_departments as restrictive for all to authenticated
  using (public.mfa_satisfied())
  with check (public.mfa_satisfied());
