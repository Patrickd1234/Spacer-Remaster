-- Undo 20261027090000_team_spaces_description.sql (drops any saved descriptions)
alter table public.team_spaces drop column if exists description;
