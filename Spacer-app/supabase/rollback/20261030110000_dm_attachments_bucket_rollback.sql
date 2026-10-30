-- Undo 20261030110000_dm_attachments_bucket.sql.
-- Deploy the previous front end first. Files already in the bucket stay
-- there (Supabase refuses to drop a bucket that still holds objects); empty it
-- in the dashboard first if you want the bucket gone too.

drop policy if exists dm_attachments_objects_select on storage.objects;
drop policy if exists dm_attachments_objects_insert on storage.objects;
drop policy if exists dm_attachments_objects_delete on storage.objects;
drop index if exists public.direct_messages_attachment_path_idx;
delete from storage.buckets
where id = 'dm-attachments'
  and not exists (select 1 from storage.objects where bucket_id = 'dm-attachments');
