-- Rollback for 20261127100000_task_views. Deletes every saved view.
drop table if exists public.task_views;
drop function if exists public.task_views_keep_owner();
