-- Final group: activity_log, project_files, daily_standups and chat.
-- activity_log / project_files / daily_standups had RLS off; the chat tables
-- had RLS on but "true" policies, so any signed-in user of any organization
-- could read and write every channel and message.

-- ─── activity_log ───────────────────────────────────────────────────────────
-- Feeds in home.jsx / header.jsx read the latest entries with no filter, so
-- the policy does the scoping: your own actions, plus actions by people in
-- your organization — hiding entries about projects you can't access.
create or replace function public.can_see_activity(p_actor_id uuid, p_entity_type text, p_entity_id uuid, p_new_state jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_project_id uuid;
begin
  if p_actor_id = auth.uid() then
    return true;
  end if;

  if not exists (
    select 1 from users where id = p_actor_id and organization_id = current_org_id()
  ) then
    return false;
  end if;

  begin
    v_project_id := nullif(p_new_state ->> 'project_id', '')::uuid;
  exception when invalid_text_representation then
    v_project_id := null;
  end;
  if v_project_id is null and p_entity_type = 'project' then
    v_project_id := p_entity_id;
  end if;

  -- Deleted projects no longer exist; their history stays visible within the org
  if v_project_id is not null and exists (select 1 from project_spaces where id = v_project_id) then
    return has_project_access(v_project_id);
  end if;

  return true;
end;
$$;

drop policy if exists activity_log_select_task on public.activity_log;
drop policy if exists activity_log_select on public.activity_log;
create policy activity_log_select on public.activity_log
  for select to authenticated
  using (can_see_activity(actor_id, entity_type, entity_id, new_state));

-- Every client insert sets actor_id to the signed-in user; nobody may log as someone else
drop policy if exists activity_log_insert on public.activity_log;
create policy activity_log_insert on public.activity_log
  for insert to authenticated
  with check (actor_id = auth.uid());

alter table public.activity_log enable row level security;

-- ─── project_files ──────────────────────────────────────────────────────────
-- uploaded_by stores a display name, not a user id, so deletes follow project
-- edit rights (the same people who can upload).
drop policy if exists "Allow select for authenticated users" on public.project_files;
drop policy if exists "Allow insert for authenticated users" on public.project_files;
drop policy if exists "Allow delete for authenticated users" on public.project_files;

create policy project_files_select on public.project_files
  for select to authenticated
  using (has_project_access(project_id));

create policy project_files_insert on public.project_files
  for insert to authenticated
  with check (can_edit_project(project_id));

create policy project_files_delete on public.project_files
  for delete to authenticated
  using (can_edit_project(project_id));

alter table public.project_files enable row level security;

-- ─── daily_standups ─────────────────────────────────────────────────────────
drop policy if exists "Allow organization access" on public.daily_standups;

create policy daily_standups_select on public.daily_standups
  for select to authenticated
  using (organization_id = current_org_id());

create policy daily_standups_insert on public.daily_standups
  for insert to authenticated
  with check (user_id = auth.uid() and organization_id = current_org_id());

create policy daily_standups_update on public.daily_standups
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and organization_id = current_org_id());

create policy daily_standups_delete on public.daily_standups
  for delete to authenticated
  using (user_id = auth.uid());

alter table public.daily_standups enable row level security;

-- ─── chat ───────────────────────────────────────────────────────────────────
-- Remember who created a channel, so a private channel's creator can see it
-- before adding themselves as a member (GroupChat.jsx reads it back right away).
alter table public.chat_channels
  add column if not exists created_by uuid default auth.uid() references auth.users(id) on delete set null;

-- Access to the department/project a channel belongs to
create or replace function public.has_channel_scope_access(p_project_id uuid, p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select (p_project_id is not null and has_project_access(p_project_id))
      or (p_department_id is not null and (
            has_team_access(p_department_id)
            or is_admin_of_org(team_space_org(p_department_id))
         ));
$$;

-- Department team lead+ / org admin / project manager of the channel's scope
create or replace function public.can_manage_channel_scope(p_project_id uuid, p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select (p_project_id is not null and can_manage_project(p_project_id))
      or (p_department_id is not null and (
            team_role_at_least(p_department_id, 'team_lead')
            or is_admin_of_org(team_space_org(p_department_id))
         ));
$$;

create or replace function public.is_channel_member(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from chat_channel_members where channel_id = p_channel_id and user_id = auth.uid());
$$;

-- Public channels: anyone with access to the scope. Private: members (and creator).
create or replace function public.can_see_channel(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from chat_channels c
    where c.id = p_channel_id
      and (
        c.created_by = auth.uid()
        or exists (select 1 from chat_channel_members m where m.channel_id = c.id and m.user_id = auth.uid())
        or (not coalesce(c.is_private, false) and has_channel_scope_access(c.project_id, c.department_id))
      )
  );
$$;

create or replace function public.can_manage_channel(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from chat_channels c
    where c.id = p_channel_id
      and (c.created_by = auth.uid() or can_manage_channel_scope(c.project_id, c.department_id))
  );
$$;

-- chat_channels
drop policy if exists "Allow authenticated access to chat_channels" on public.chat_channels;

-- Checks the row's own columns (not can_see_channel(id)): when GroupChat.jsx
-- inserts and reads back in one statement, a lookup by id can't see the new row yet.
create policy chat_channels_select on public.chat_channels
  for select to authenticated
  using (
    created_by = auth.uid()
    or is_channel_member(id)
    or (not coalesce(is_private, false) and has_channel_scope_access(project_id, department_id))
  );

create policy chat_channels_insert on public.chat_channels
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and has_channel_scope_access(project_id, department_id)
  );

create policy chat_channels_update on public.chat_channels
  for update to authenticated
  using (created_by = auth.uid() or can_manage_channel_scope(project_id, department_id))
  with check (has_channel_scope_access(project_id, department_id));

create policy chat_channels_delete on public.chat_channels
  for delete to authenticated
  using (created_by = auth.uid() or can_manage_channel_scope(project_id, department_id));

-- chat_channel_members
drop policy if exists "Allow authenticated access to chat_channel_members" on public.chat_channel_members;

create policy chat_channel_members_select on public.chat_channel_members
  for select to authenticated
  using (can_see_channel(channel_id));

-- Channel creators/managers and existing members may add people from their own organization
create policy chat_channel_members_insert on public.chat_channel_members
  for insert to authenticated
  with check (
    (can_manage_channel(channel_id) or is_channel_member(channel_id))
    and exists (select 1 from users u where u.id = chat_channel_members.user_id and u.organization_id = current_org_id())
  );

-- Leave a channel yourself, or be removed by its creator/manager
create policy chat_channel_members_delete on public.chat_channel_members
  for delete to authenticated
  using (user_id = auth.uid() or can_manage_channel(channel_id));

-- messages
drop policy if exists "Allow authenticated access to messages" on public.messages;

create policy messages_select on public.messages
  for select to authenticated
  using (can_see_channel(channel_id));

create policy messages_insert on public.messages
  for insert to authenticated
  with check (user_id = auth.uid() and can_see_channel(channel_id));

create policy messages_update on public.messages
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and can_see_channel(channel_id));

create policy messages_delete on public.messages
  for delete to authenticated
  using (user_id = auth.uid() or can_manage_channel(channel_id));

-- message_reactions
create or replace function public.can_see_message(p_message_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from messages where id = p_message_id and can_see_channel(channel_id));
$$;

drop policy if exists "Allow authenticated access to message_reactions" on public.message_reactions;

create policy message_reactions_select on public.message_reactions
  for select to authenticated
  using (can_see_message(message_id));

create policy message_reactions_insert on public.message_reactions
  for insert to authenticated
  with check (user_id = auth.uid() and can_see_message(message_id));

create policy message_reactions_delete on public.message_reactions
  for delete to authenticated
  using (user_id = auth.uid());

-- message_attachments: readable with the message; only the message's author attaches files
drop policy if exists "Allow authenticated access to message_attachments" on public.message_attachments;

create policy message_attachments_select on public.message_attachments
  for select to authenticated
  using (can_see_message(message_id));

create policy message_attachments_insert on public.message_attachments
  for insert to authenticated
  with check (exists (select 1 from messages m where m.id = message_id and m.user_id = auth.uid()));

create policy message_attachments_delete on public.message_attachments
  for delete to authenticated
  using (exists (select 1 from messages m where m.id = message_id and m.user_id = auth.uid()));
