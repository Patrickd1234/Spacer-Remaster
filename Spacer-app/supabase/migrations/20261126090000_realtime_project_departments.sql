-- Broadcast project_departments changes over Supabase Realtime (Collab rework,
-- part A). The project page listens for them, so an invite answered or a part
-- signed off in another browser shows up without a refresh.
-- Row-level security still applies: subscribers only receive rows they can read.
-- Rollback: supabase/rollback/20261126090000_realtime_project_departments_rollback.sql

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'project_departments'
  ) then
    alter publication supabase_realtime add table public.project_departments;
  end if;
end $$;
