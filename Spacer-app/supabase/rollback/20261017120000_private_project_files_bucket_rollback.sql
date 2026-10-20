-- Emergency undo for 20261017120000_private_project_files_bucket.sql.
-- Makes the bucket public again with the previous open policies (insecure).
-- The updated app still works with a public bucket (signed links work either way).
update storage.buckets set public = true where id = 'project-files';

drop policy if exists project_files_objects_select on storage.objects;
drop policy if exists project_files_objects_insert on storage.objects;
drop policy if exists project_files_objects_delete on storage.objects;

create policy "Allow public read" on storage.objects
  for select using (bucket_id = 'project-files');
create policy "Allow upload for authenticated users" on storage.objects
  for insert to authenticated with check (bucket_id = 'project-files');
create policy "Allow delete for authenticated users" on storage.objects
  for delete to authenticated using (bucket_id = 'project-files');
