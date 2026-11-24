-- Undo 20261124100000_mfa_optional.sql: two-factor required for every account
-- again, except those in mfa_exempt_users.
-- Restores mfa_required_for_caller() as defined in 20261121090000_mfa_exempt_users.sql.
-- Everyone without an authenticator gets the setup screen at their next sign-in.

create or replace function public.mfa_required_for_caller()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select auth.uid() is not null
     and not exists (
       select 1 from public.mfa_exempt_users e
       where e.user_id = auth.uid()
     );
$$;
