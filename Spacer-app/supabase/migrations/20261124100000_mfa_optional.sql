-- Two-factor is optional again (decided 24 Nov 2026).
--
-- Live already ran this by hand in the SQL Editor before the file existed;
-- this records it, and re-running it changes nothing.
--
-- What it means:
-- - Nobody is asked to set up two-factor. mfa_setup_required() is false for
--   everyone, so the app never shows the setup screen.
-- - An account WITH a verified authenticator still gets no data until it has
--   entered its code (aal2) or uses a remembered device: mfa_satisfied() is
--   unchanged.
-- - An account without one gets its data with a password only.
-- - mfa_exempt_users stays, unused, so turning the requirement back on keeps
--   the redtech.inc exemptions (run the rollback below).
--
-- Rollback (two-factor required again, except mfa_exempt_users):
-- supabase/rollback/20261124100000_mfa_optional_rollback.sql

create or replace function public.mfa_required_for_caller()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select false;
$$;
