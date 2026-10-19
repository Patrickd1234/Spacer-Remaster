-- Make the project-files storage bucket private.
-- It was public (anyone could list and download every file without logging
-- in) and any signed-in user of any organization could upload or delete.
-- Files are stored as "<project_id>/...", so access follows project access.
-- The app now opens files through short-lived signed links (src/projectFiles.js).

create or replace function public.project_id_from_storage_path(p_name text)
returns uuid
language plpgsql
immutable
as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

update storage.buckets set public = false where id = 'project-files';

drop policy if exists "Allow public read" on storage.objects;
drop policy if exists "Allow upload for authenticated users" on storage.objects;
drop policy if exists "Allow delete for authenticated users" on storage.objects;

drop policy if exists project_files_objects_select on storage.objects;
create policy project_files_objects_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'project-files'
    and public.has_project_access(public.project_id_from_storage_path(name))
  );

drop policy if exists project_files_objects_insert on storage.objects;
create policy project_files_objects_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'project-files'
    and public.can_edit_project(public.project_id_from_storage_path(name))
  );

drop policy if exists project_files_objects_delete on storage.objects;
create policy project_files_objects_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'project-files'
    and public.can_edit_project(public.project_id_from_storage_path(name))
  );

-- Stored URLs were permanent public links that no longer work; links are signed on demand now
update public.project_files set url = '' where url like '%/storage/v1/object/public/project-files/%';
