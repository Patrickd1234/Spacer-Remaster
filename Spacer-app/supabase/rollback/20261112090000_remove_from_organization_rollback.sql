-- Undo 20261112090000_remove_from_organization.sql
-- Nobody can leave or be removed from an organization again. People who
-- already left or were removed stay out; invite them to bring them back.

drop function if exists public.remove_from_organization(uuid);
