-- Private storage for direct-message attachments.
-- Rollback: supabase/rollback/20261030110000_dm_attachments_bucket_rollback.sql
--
-- Before, a DM attachment was saved as a base64 data URL inside
-- direct_messages.file_attachment, so every message fetch and every realtime
-- event carried the whole file. Files now live in this bucket, and the message
-- stores only { name, size, type, path }.
--
-- Path: "<sender_id>/<message_id>/<file name>". The sender uploads into their
-- own folder before sending, then the message points at the file. Reading is
-- allowed to the sender and to the receiver of a message that points at it.
-- A message only unlocks files in its own sender's folder, so pointing a
-- message at someone else's file grants nothing.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dm-attachments', 'dm-attachments', false, 5 * 1024 * 1024,
  array[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf', 'text/plain', 'text/csv', 'application/zip',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The read policy looks messages up by attachment path
create index if not exists direct_messages_attachment_path_idx
  on public.direct_messages ((file_attachment ->> 'path'))
  where file_attachment ? 'path';

drop policy if exists dm_attachments_objects_select on storage.objects;
create policy dm_attachments_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'dm-attachments'
    and (
      public.storage_path_uuid(objects.name, 1) = auth.uid()
      or exists (
        select 1 from public.direct_messages dm
        where dm.file_attachment ->> 'path' = objects.name
          and dm.sender_id = public.storage_path_uuid(objects.name, 1)
          and auth.uid() in (dm.sender_id, dm.receiver_id)
      )
    )
  );

drop policy if exists dm_attachments_objects_insert on storage.objects;
create policy dm_attachments_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'dm-attachments'
    and public.storage_path_uuid(name, 1) = auth.uid()
    and public.storage_path_uuid(name, 2) is not null
  );

drop policy if exists dm_attachments_objects_delete on storage.objects;
create policy dm_attachments_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'dm-attachments'
    and public.storage_path_uuid(name, 1) = auth.uid()
  );
