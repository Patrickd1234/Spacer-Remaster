-- Create a public.users profile row whenever an auth user is created
-- (email signup, Google OAuth, or admin invite), so the app never depends
-- on a client-side insert that RLS blocks before email confirmation.
--
-- organization_id is deliberately NOT read from user metadata: signup metadata
-- is user-controlled, so trusting it would let anyone join any organization.
-- Server code (e.g. invite-department-member) sets organization_id itself.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, name, auth_provider)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      split_part(new.email, '@', 1)
    ),
    coalesce(new.raw_app_meta_data ->> 'provider', 'email')
  )
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill: create profiles for existing auth users that don't have one yet
insert into public.users (id, email, name, auth_provider)
select
  au.id,
  au.email,
  coalesce(
    nullif(trim(au.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(au.raw_user_meta_data ->> 'name'), ''),
    split_part(au.email, '@', 1)
  ),
  coalesce(au.raw_app_meta_data ->> 'provider', 'email')
from auth.users au
where au.email is not null
  and not exists (select 1 from public.users pu where pu.id = au.id)
on conflict do nothing;
