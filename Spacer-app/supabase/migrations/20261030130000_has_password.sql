-- Let the app ask whether the signed-in account has a password.
-- Rollback: supabase/rollback/20261030130000_has_password_rollback.sql
--
-- Accounts created with Google (or by an invite whose link was never finished)
-- have no password, so they could never sign in with email + password. The app
-- uses this to send them to the "Set a password" screen, and change-password
-- uses it instead of the identities list: setting a password with
-- auth.updateUser() does not add an 'email' identity, so identities can't tell.
--
-- auth.users is not readable by clients; this returns one boolean about the
-- caller only and never exposes the hash.

create or replace function public.has_password()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select coalesce(u.encrypted_password, '') <> ''
  from auth.users u
  where u.id = auth.uid();
$$;

revoke execute on function public.has_password() from public, anon;
grant execute on function public.has_password() to authenticated;
