-- Make two-factor optional again for every account.
--
-- 20261120110000_require_mfa.sql required it for everyone (with the
-- exemption list from 20261121090000_mfa_exempt_users.sql). From this
-- migration on nobody is required to set it up:
--   - no "Set up two-factor" screen after sign-in (mfa_setup_required() is false)
--   - Settings -> Security offers turning it on, and off again
--   - an account WITH an authenticator is still asked for its code (or uses a
--     remembered device): mfa_satisfied() is unchanged, so the restrictive
--     mfa_required policies and the edge functions keep protecting it
--
-- mfa_exempt_users stays in place but no longer matters while this is in
-- effect; the rollback brings back required two-factor with that list.
--
-- Rollback: supabase/rollback/20261123090000_mfa_optional_rollback.sql

create or replace function public.mfa_required_for_caller()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select false;
$$;
