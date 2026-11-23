-- Undo 20261121110000_sync_user_email.sql: stop copying sign-in email changes
-- to public.users. Emails already copied stay as they are.

drop trigger if exists on_auth_user_email_changed on auth.users;
drop function if exists public.sync_user_email();
