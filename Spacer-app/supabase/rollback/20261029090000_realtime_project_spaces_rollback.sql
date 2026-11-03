-- Undo 20261029090000_realtime_project_spaces.sql (project changes stop arriving live)
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'project_spaces'
  ) then
    alter publication supabase_realtime drop table public.project_spaces;
  end if;
end $$;
