-- Undo 20261030120000_log_signup_in_trigger.sql (signups stop being logged)
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

  return new;
end;
$$;
