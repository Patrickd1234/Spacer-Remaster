-- Broadcast project_spaces changes over Supabase Realtime.
-- The Reports page already subscribes to this table, but only tasks were in
-- the publication, so new, renamed or deleted projects never arrived live.
-- Row-level security still applies: subscribers only receive rows they can read.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'project_spaces'
  ) then
    alter publication supabase_realtime add table public.project_spaces;
  end if;
end $$;
