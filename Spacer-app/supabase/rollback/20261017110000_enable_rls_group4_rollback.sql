-- Emergency undo for 20261017110000_enable_rls_group4.sql.
-- activity_log / project_files / daily_standups: turns RLS back off.
-- Chat tables: restores the previous allow-everything policies.
-- Restores the previous, insecure state; use only while fixing a broken policy.
alter table public.activity_log disable row level security;
alter table public.project_files disable row level security;
alter table public.daily_standups disable row level security;

do $$
declare t text;
begin
  foreach t in array array['chat_channels','chat_channel_members','messages','message_reactions','message_attachments'] loop
    execute format('drop policy if exists "Allow authenticated access to %1$s" on public.%1$I', t);
    execute format('create policy "Allow authenticated access to %1$s" on public.%1$I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
