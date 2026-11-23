-- Keep public.users.email in step with the sign-in email (X-05).
--
-- Changing your email on the Profile page goes through Supabase Auth, which
-- applies it to auth.users only after the confirmation links are clicked.
-- Nothing copied it to public.users, so the Directory, mentions and invites
-- kept the old address (2 accounts were out of step on 21 Nov 2026).
--
-- The trigger runs as the function owner, so users_guard_protected_columns
-- (which only stops the 'authenticated' and 'anon' roles) lets it through.
-- If the new address is already on another profile (users_email_key), the
-- sign-in change still goes ahead and a warning is logged, rather than
-- failing the user's confirmation click.
--
-- Rollback: supabase/rollback/20261121110000_sync_user_email_rollback.sql

create or replace function public.sync_user_email()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  update public.users
     set email = new.email
   where id = new.id
     and email is distinct from new.email;
  return new;
exception
  when unique_violation then
    raise warning 'sync_user_email: % is already on another profile; users.email for % not updated', new.email, new.id;
    return new;
end;
$$;

revoke execute on function public.sync_user_email() from public, anon, authenticated;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (new.email is distinct from old.email)
  execute function public.sync_user_email();

-- Bring the accounts that are already out of step up to date
update public.users u
   set email = a.email
  from auth.users a
 where a.id = u.id
   and u.email is distinct from a.email
   and not exists (
     select 1 from public.users o
      where o.id <> u.id and o.email = a.email
   );
