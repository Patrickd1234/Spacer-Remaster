-- notify_user() is SECURITY DEFINER and was executable by anon/authenticated,
-- so anyone holding the public anon key could call /rest/v1/rpc/notify_user
-- and insert arbitrary notification text for any user (phishing vector).
--
-- Only the notification triggers (tasks_notify, comments_notify) call it.
-- They are SECURITY DEFINER themselves, so they run as the function owner
-- and keep working after these grants are revoked.

revoke execute on function public.notify_user(uuid, text, text, uuid, text) from public, anon, authenticated;
