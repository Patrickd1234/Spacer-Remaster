-- Broadcast new direct messages over Supabase Realtime (P-04, B-07).
-- The chat already subscribes to direct_messages, but the table was never in
-- the publication, so messages only arrived by re-fetching every 3 seconds and
-- the unread badge didn't change until a reload.
-- Row-level security still applies: subscribers only receive messages they
-- can read ("Allow users to read their own messages": sender or receiver).

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_messages'
  ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
end $$;
