-- Undo 20261026090000_lock_notify_user.sql (re-opens the hole; use only to debug)
grant execute on function public.notify_user(uuid, text, text, uuid, text) to public, anon, authenticated;
