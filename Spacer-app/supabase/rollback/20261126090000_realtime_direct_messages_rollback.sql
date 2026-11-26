-- Undo 20261126090000_realtime_direct_messages.sql (direct messages stop arriving live;
-- the chat's 15-second re-fetch still delivers them)
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_messages'
  ) then
    alter publication supabase_realtime drop table public.direct_messages;
  end if;
end $$;
