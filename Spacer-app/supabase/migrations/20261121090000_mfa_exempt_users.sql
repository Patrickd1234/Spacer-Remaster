-- Exempt a fixed list of accounts from required two-factor.
--
-- 20261120110000_require_mfa.sql made two-factor required for every account.
-- This exempts the 16 @redtech.inc accounts that exist when it runs, by user id,
-- so people who sign up later with that domain are NOT exempt.
--
-- An exempt account is treated like before two-factor was required: it gets
-- data at aal1 as long as it has no verified authenticator factor. One that has
-- set one up still has to enter its code until the factor is removed
-- (Supabase -> Authentication -> Users -> the user -> delete the MFA factor).
--
-- The list is server-only: RLS is on with no policies, so the app can neither
-- read nor change it. Add or remove people with SQL in the SQL Editor.
--
-- Rollback: supabase/rollback/20261121090000_mfa_exempt_users_rollback.sql

create table public.mfa_exempt_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  reason text not null,
  created_at timestamp with time zone default now() not null
);

alter table public.mfa_exempt_users enable row level security;
revoke all on table public.mfa_exempt_users from anon, authenticated;

-- The accounts on the app today. Stops if the number has changed since it was
-- checked (16 on 21 Nov 2026), so nobody new is exempted by accident.
do $$
declare
  expected constant integer := 16;
  found integer;
begin
  select count(*) into found
  from auth.users
  where lower(email) like '%@redtech.inc';

  if found <> expected then
    raise exception 'Expected % @redtech.inc accounts, found %. Check the list before exempting.', expected, found;
  end if;

  insert into public.mfa_exempt_users (user_id, reason)
  select id, 'redtech.inc account, exempted 21 Nov 2026'
  from auth.users
  where lower(email) like '%@redtech.inc';
end $$;

-- Must the caller use two-factor? Every signed-in account, except the list above.
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
