-- Private storage for group-chat attachments.
-- Before, GroupChat.jsx saved a browser-local blob: URL, so nobody but the
-- sender could ever open an attachment. Files now live in this bucket as
-- "<channel_id>/<message_id>/<file>", and access follows chat access.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-attachments', 'chat-attachments', false, 5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'text/plain']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The uuid in the given "/"-separated position of a storage path, or null
create or replace function public.storage_path_uuid(p_name text, p_position int)
returns uuid
language plpgsql
immutable
as $$
begin
  return split_part(p_name, '/', p_position)::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

drop policy if exists chat_attachments_objects_select on storage.objects;
create policy chat_attachments_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-attachments'
    and public.can_see_channel(public.storage_path_uuid(name, 1))
  );

-- Only the message's author uploads, and only into the message's own channel
drop policy if exists chat_attachments_objects_insert on storage.objects;
create policy chat_attachments_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and exists (
      select 1 from public.messages m
      where m.id = public.storage_path_uuid(name, 2)
        and m.channel_id = public.storage_path_uuid(name, 1)
        and m.user_id = auth.uid()
    )
  );

drop policy if exists chat_attachments_objects_delete on storage.objects;
create policy chat_attachments_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat-attachments'
    and exists (
      select 1 from public.messages m
      where m.id = public.storage_path_uuid(name, 2)
        and m.user_id = auth.uid()
    )
  );
