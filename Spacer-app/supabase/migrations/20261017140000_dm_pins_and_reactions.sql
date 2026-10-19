-- Pins and reactions for direct messages.
-- SidebarRouter.jsx wrote `pinned` and `reactions` onto direct_messages, but
-- those columns never existed, so pins/reactions were lost on reload. Either
-- participant may pin or react, while only the sender may edit the message,
-- so pins go through a narrow function and reactions get their own table.

-- ─── Pins ───────────────────────────────────────────────────────────────────
alter table public.direct_messages
  add column if not exists pinned boolean not null default false;

-- Either participant flips the pin; nothing else about the message changes
create or replace function public.toggle_dm_pin(p_message_id uuid)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_pinned boolean;
begin
  update public.direct_messages
     set pinned = not pinned
   where id = p_message_id
     and auth.uid() in (sender_id, receiver_id)
  returning pinned into v_pinned;

  if v_pinned is null then
    raise exception 'Message not found';
  end if;
  return v_pinned;
end;
$$;

revoke execute on function public.toggle_dm_pin(uuid) from public, anon;
grant execute on function public.toggle_dm_pin(uuid) to authenticated;

-- ─── Reactions ──────────────────────────────────────────────────────────────
create table if not exists public.direct_message_reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.direct_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  unique (message_id, user_id)  -- one reaction per person per message, as in the UI
);

create index if not exists direct_message_reactions_message_id_idx
  on public.direct_message_reactions (message_id);

create or replace function public.is_dm_participant(p_message_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from direct_messages
    where id = p_message_id and auth.uid() in (sender_id, receiver_id)
  );
$$;

alter table public.direct_message_reactions enable row level security;

create policy direct_message_reactions_select on public.direct_message_reactions
  for select to authenticated
  using (is_dm_participant(message_id));

create policy direct_message_reactions_insert on public.direct_message_reactions
  for insert to authenticated
  with check (user_id = auth.uid() and is_dm_participant(message_id));

create policy direct_message_reactions_delete on public.direct_message_reactions
  for delete to authenticated
  using (user_id = auth.uid());
