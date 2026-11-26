-- Undo 20261126100000_delete_channel_message.sql (group chat's Delete button
-- then fails with an error; nothing is deleted)
drop function if exists public.delete_channel_message(uuid);
