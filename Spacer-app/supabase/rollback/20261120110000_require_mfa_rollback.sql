-- Undo 20261120110000_require_mfa.sql: two-factor optional again.
-- Restores mfa_satisfied() as defined in 20261019090000_mfa_trusted_devices.sql.

create or replace function public.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors f
        where f.user_id = auth.uid() and f.status = 'verified'
      )
      or public.is_trusted_device();
$$;

drop function if exists public.mfa_setup_required();
drop function if exists public.has_verified_mfa_factor();
drop function if exists public.mfa_required_for_caller();
