-- Emergency undo for 20261017070000_enable_rls_group1.sql.
-- Turns RLS back off on the four tables (restores the previous, insecure state)
-- so the app works again while a broken policy is fixed. Use only if needed.
alter table public.memberships disable row level security;
alter table public.users disable row level security;
alter table public.direct_messages disable row level security;
alter table public.notification_queue disable row level security;
