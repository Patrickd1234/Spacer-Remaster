-- Turn on row-level security for organization structure and the tables the
-- app doesn't write to from the browser:
--   organizations, team_spaces, calendar_events, invites, team_space_stats,
--   comments, attachments, notifications, announcements, org_feed_items,
--   email_tickets.
-- Their existing policies are kept except where noted. Server code (service
-- role) and SECURITY DEFINER functions (claim_pending_invites, tasks_notify,
-- comments_notify, ...) are not affected by RLS.

-- ─── team_spaces ────────────────────────────────────────────────────────────
-- Also let project-only members see the department their project lives in;
-- project_page.jsx reads the organization through it.
create or replace function public.is_member_of_project_in_team(p_team_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from project_spaces ps
    join project_members pm on pm.project_id = ps.id
    where ps.team_space_id = p_team_space_id and pm.user_id = auth.uid()
  );
$$;

alter policy team_spaces_select on public.team_spaces
  using (
    organization_id = current_org_id()
    and (has_team_access(id) or is_org_admin() or is_member_of_project_in_team(id))
  );

alter policy team_spaces_update_admin on public.team_spaces
  using (organization_id = current_org_id() and is_org_admin())
  with check (organization_id = current_org_id() and is_org_admin());

-- Department.jsx deletes departments; there was no delete policy
drop policy if exists team_spaces_delete_admin on public.team_spaces;
create policy team_spaces_delete_admin on public.team_spaces
  for delete to authenticated
  using (organization_id = current_org_id() and is_org_admin());

alter table public.team_spaces enable row level security;

-- ─── organizations (select own org; admins rename it in Settings) ───────────
alter policy organizations_update_admin on public.organizations
  using (id = current_org_id() and is_org_admin())
  with check (id = current_org_id() and is_org_admin());

alter table public.organizations enable row level security;

-- ─── Read-only from the browser, existing policies already scoped ───────────
alter table public.calendar_events enable row level security;  -- select: own org
alter table public.invites enable row level security;          -- select: own org admins
alter table public.team_space_stats enable row level security; -- select: department members
alter table public.comments enable row level security;         -- task access
alter table public.attachments enable row level security;      -- task access
alter table public.notifications enable row level security;    -- own notifications
alter table public.announcements enable row level security;    -- own org
alter table public.org_feed_items enable row level security;   -- own org

-- No policies: only server code may touch these
alter table public.email_tickets enable row level security;
