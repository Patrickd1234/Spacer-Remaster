-- Undo 20261124120000_create_project.sql. The app's Create Project form calls
-- create_project(), so deploy an app version from before that migration first,
-- or creating projects stops working. Projects already created are unaffected.

drop function if exists public.create_project(text, date, uuid, jsonb);
