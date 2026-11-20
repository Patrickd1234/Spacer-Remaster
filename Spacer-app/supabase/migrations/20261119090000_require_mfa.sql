-- Require two-factor authentication for every account.
--
-- Until now two-factor was optional: an account without a verified factor got
-- data at aal1. From this migration on, a signed-in account gets NO data until
-- it has set up an authenticator app and passed it (aal2) or uses a remembered
-- device.
--
-- The app checks mfa_setup_required() right after sign-in and shows the setup
-- screen, so people are asked to enroll instead of seeing an empty app.
-- Enrolling goes through Supabase Auth (not these tables), so it still works
-- while the data is locked. Edge functions call mfa_satisfied() through
-- _shared/mfa.ts, so they follow the same rule. Service-role code is unaffected.
--
-- mfa_required_for_caller() is the single place that decides who must use it;
-- to limit it to some roles again, make it check public.memberships.role.
-- Rollback: supabase/rollback/20261119090000_require_mfa_rollback.sql

-- Must the caller use two-factor? Every signed-in account must.
create or replace function public.mfa_required_for_caller()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select auth.uid() is not null;
$$;

-- Does the caller have a verified authenticator factor?
create or replace function public.has_verified_mfa_factor()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1 from auth.mfa_factors f
    where f.user_id = auth.uid() and f.status = 'verified'
  );
$$;

-- Passed the second factor, or uses a remembered device, or has no factor and
-- isn't required to have one. Cheapest checks first: this runs inside the
-- restrictive mfa_required policy on every table.
create or replace function public.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or (not public.mfa_required_for_caller() and not public.has_verified_mfa_factor())
      or public.is_trusted_device();
$$;

-- For the app: must the caller set up two-factor before using Spacers?
create or replace function public.mfa_setup_required()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select public.mfa_required_for_caller()
     and not public.has_verified_mfa_factor();
$$;

revoke execute on function public.mfa_required_for_caller() from public, anon;
revoke execute on function public.has_verified_mfa_factor() from public, anon;
revoke execute on function public.mfa_setup_required() from public, anon;
grant execute on function public.mfa_required_for_caller() to authenticated;
grant execute on function public.has_verified_mfa_factor() to authenticated;
grant execute on function public.mfa_setup_required() to authenticated;
