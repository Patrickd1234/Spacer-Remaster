-- Record the 'signup' activity from the database instead of the browser.
-- Rollback: supabase/rollback/20261030120000_log_signup_in_trigger_rollback.sql
--
-- signup.jsx inserted the activity_log row itself, right after auth.signUp().
-- With "Confirm email" on there is no session yet, so RLS (actor_id = auth.uid())
-- rejected it every time, and the error was returned, not thrown, so nobody saw.
-- The on_auth_user_created trigger runs for every new account, so it logs here.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to ''
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

  -- Logging must never block account creation
  begin
    insert into public.activity_log (entity_type, entity_id, actor_id, action, new_state)
    values (
      'user', new.id, new.id, 'signup',
      jsonb_build_object('email', new.email, 'full_name', new.raw_user_meta_data ->> 'full_name')
    );
  exception when others then
    raise warning 'handle_new_user: could not log signup for %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;
