-- Emergency undo for 20261017090000_enable_rls_group2.sql.
-- Turns RLS back off on the four tables (restores the previous, insecure state)
-- so the app works again while a broken policy is fixed. Use only if needed.
alter table public.tasks disable row level security;
alter table public.project_spaces disable row level security;
alter table public.project_members disable row level security;
alter table public.milestones disable row level security;
