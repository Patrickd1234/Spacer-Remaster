-- Undo 20261121090000_mfa_exempt_users.sql: two-factor required for every account again.
-- Restores mfa_required_for_caller() as defined in 20261120110000_require_mfa.sql.

create or replace function public.mfa_required_for_caller()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select auth.uid() is not null;
$$;

drop table if exists public.mfa_exempt_users;
