-- Emergency undo for 20261019090000_mfa_trusted_devices.sql.
-- Restores mfa_satisfied() without remembered devices (every sign-in needs a
-- code again) and removes the trusted-device table and functions.
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
      );
$$;

drop function if exists public.trust_this_device(text);
drop function if exists public.forget_trusted_devices();
drop function if exists public.is_trusted_device();
drop table if exists public.mfa_trusted_devices;
