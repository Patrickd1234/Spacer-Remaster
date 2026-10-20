-- Turn on row-level security for the most sensitive tables:
-- memberships, users, direct_messages, notification_queue.
--
-- Before this, RLS was disabled on these tables, so anyone holding the public
-- anon key (it ships in the frontend) could read and write every row without
-- logging in. Server code (edge functions with the service role key) and the
-- SECURITY DEFINER database functions are unaffected by RLS.

-- ─── Helpers ────────────────────────────────────────────────────────────────

-- Role ranking: viewer < member < team_lead < admin < super_admin.
-- Before, admin and super_admin failed every "at least ..." check.
create or replace function public.team_role_at_least(p_team_space_id uuid, p_min membership_role)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    array_position(array['viewer','member','team_lead','admin','super_admin']::membership_role[], team_role(p_team_space_id))
      >= array_position(array['viewer','member','team_lead','admin','super_admin']::membership_role[], p_min),
    false
  );
$$;

-- is_org_admin() only says "admin of SOME organization"; this pins it to a specific one
create or replace function public.is_admin_of_org(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p_org_id is not null and p_org_id = current_org_id() and is_org_admin();
$$;

-- Which organization a membership row belongs to (org-level rows have no team space)
create or replace function public.membership_org(p_team_space_id uuid, p_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when p_team_space_id is not null then (select organization_id from team_spaces where id = p_team_space_id)
    else (select organization_id from users where id = p_user_id)
  end;
$$;

-- ─── memberships ────────────────────────────────────────────────────────────
-- Client code only reads and deletes; inserts/role changes go through edge
-- functions (service role) or claim_pending_invites (security definer).

alter policy memberships_select on public.memberships
  using (
    user_id = auth.uid()
    or is_admin_of_org(membership_org(team_space_id, user_id))
    or (team_space_id is not null and has_team_access(team_space_id))
  );

-- Only org admins of the same organization may grant or change roles directly
alter policy memberships_insert on public.memberships
  with check (is_admin_of_org(membership_org(team_space_id, user_id)));

alter policy memberships_update on public.memberships
  using (is_admin_of_org(membership_org(team_space_id, user_id)))
  with check (is_admin_of_org(membership_org(team_space_id, user_id)));

alter policy memberships_delete on public.memberships
  using (
    is_admin_of_org(membership_org(team_space_id, user_id))
    or (team_space_id is not null and team_role_at_least(team_space_id, 'team_lead'))
  );

alter table public.memberships enable row level security;

-- ─── users ──────────────────────────────────────────────────────────────────

alter policy users_select_same_org on public.users
  using (
    id = auth.uid()
    or (organization_id is not null and organization_id = current_org_id())
  );

alter policy users_update_self on public.users
  using (id = auth.uid())
  with check (id = auth.uid());

-- Profile.jsx creates a missing profile row; never with an organization attached
drop policy if exists users_insert_self on public.users;
create policy users_insert_self on public.users
  for insert to authenticated
  with check (id = auth.uid() and organization_id is null);

-- Signed-in users may edit their own name/description, but not the columns
-- that decide identity and organization. Server code and SECURITY DEFINER
-- functions (e.g. claim_pending_invites) run as a different role and pass.
create or replace function public.users_guard_protected_columns()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.email is distinct from old.email
    or new.auth_provider is distinct from old.auth_provider
  ) then
    raise exception 'Not allowed to change id, organization, email or auth provider';
  end if;
  return new;
end;
$$;

drop trigger if exists users_guard_protected_columns on public.users;
create trigger users_guard_protected_columns
  before update on public.users
  for each row execute function public.users_guard_protected_columns();

alter table public.users enable row level security;

-- ─── direct_messages ────────────────────────────────────────────────────────
-- Existing policies already restrict reads to sender/receiver and writes to the
-- sender. Also stop senders from re-pointing a message at someone else, and
-- only allow messaging people in your own organization.

alter policy "Allow senders to update their messages" on public.direct_messages
  using (auth.uid() = sender_id)
  with check (auth.uid() = sender_id);

alter policy "Allow users to send messages" on public.direct_messages
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.users r
      where r.id = direct_messages.receiver_id
        and r.organization_id = current_org_id()
    )
  );

alter table public.direct_messages enable row level security;

-- ─── notification_queue ─────────────────────────────────────────────────────
-- Only server code writes here (and the webhook on it sends email), so no
-- client policies at all: RLS on with zero policies blocks anon/authenticated.

alter table public.notification_queue enable row level security;
