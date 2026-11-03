-- Undo 20261030150000_org_team_memberships.sql
-- The app falls back to the memberships and team_spaces tables when this is missing.
drop function if exists public.org_team_memberships();
