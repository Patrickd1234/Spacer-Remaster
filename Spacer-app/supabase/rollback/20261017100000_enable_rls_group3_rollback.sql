-- Emergency undo for 20261017100000_enable_rls_group3.sql.
-- Turns RLS back off (restores the previous, insecure state) so the app works
-- again while a broken policy is fixed. Use only if needed.
alter table public.team_spaces disable row level security;
alter table public.organizations disable row level security;
alter table public.calendar_events disable row level security;
alter table public.invites disable row level security;
alter table public.team_space_stats disable row level security;
alter table public.comments disable row level security;
alter table public.attachments disable row level security;
alter table public.notifications disable row level security;
alter table public.announcements disable row level security;
alter table public.org_feed_items disable row level security;
alter table public.email_tickets disable row level security;
