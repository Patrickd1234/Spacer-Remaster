-- Emergency undo for 20261017130000_chat_attachments_bucket.sql.
-- Removes the access policies (uploads/reads to chat-attachments then fail).
-- The bucket itself is left in place: Supabase won't drop a bucket that
-- still holds files; empty it in the dashboard first if you want it gone.
drop policy if exists chat_attachments_objects_select on storage.objects;
drop policy if exists chat_attachments_objects_insert on storage.objects;
drop policy if exists chat_attachments_objects_delete on storage.objects;
