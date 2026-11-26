-- Undo 20261126090000_realtime_project_departments.sql: stop broadcasting
-- project_departments. The project page then shows department changes made
-- elsewhere only after a refresh.

do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'project_departments'
  ) then
    alter publication supabase_realtime drop table public.project_departments;
  end if;
end $$;
