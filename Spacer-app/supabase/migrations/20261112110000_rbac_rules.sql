-- Role-based access control, step 3: every access rule now asks has_permission().
-- Rollback: supabase/rollback/20261112110000_rbac_rules_rollback.sql
--
-- Before this, 5 helper functions, 28 policies and 4 other functions decided
-- access by role rank (team_role_at_least), by department membership
-- (has_team_access) or by "organization admin" (is_org_admin,
-- is_admin_of_org). Each now names the permission it needs, and
-- rbac_role_permissions says which roles grant it. To change what a role can
-- do, change that table; no policy has to be touched.
--
-- What changes for people (measured by supabase/checks/rbac_rules_compare.sql):
--   * Organization roles (owner, org_admin) can now manage milestones, see a
--     department's pending invitations and read its task counts. The old
--     rules for those three looked only at the department role.
--   * A role in a department of an organization the person is not in no
--     longer gives any access there.
-- Everything else is unchanged.
--
-- is_org_admin(), is_admin_of_org(), has_team_access(), team_role() and
-- team_role_at_least() stay defined (edge functions and the app still call
-- some of them) but no policy uses them any more.

-- "Delete tasks that belong to no project" also covers changing their
-- deadline (tasks_guard_due_date), so the permission is renamed.
insert into public.rbac_permissions (key, scope, description)
values ('task.manage_unfiled', 'organization', 'Delete tasks that belong to no project and change their deadlines');
insert into public.rbac_role_permissions (role_key, permission_key)
select role_key, 'task.manage_unfiled' from public.rbac_role_permissions where permission_key = 'task.delete_unfiled';
delete from public.rbac_permissions where key = 'task.delete_unfiled';

-- ---------------------------------------------------------------------------
-- Project and channel helpers (used by about 35 policies, which stay as they are)
-- ---------------------------------------------------------------------------

create or replace function public.has_project_access(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from project_spaces ps
    where ps.id = p_project_id
      and (has_permission('project.view', ps.team_space_id) or is_project_member(ps.id))
  );
$$;

create or replace function public.can_edit_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from project_spaces ps
    where ps.id = p_project_id
      and (has_permission('project.edit', ps.team_space_id) or is_project_member(ps.id))
  );
$$;

create or replace function public.can_manage_project(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from project_spaces ps
    where ps.id = p_project_id
      and has_permission('project.manage', ps.team_space_id)
  );
$$;

create or replace function public.has_channel_scope_access(p_project_id uuid, p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select (p_project_id is not null and has_project_access(p_project_id))
      or (p_department_id is not null and has_permission('department.view', p_department_id));
$$;

create or replace function public.can_manage_channel_scope(p_project_id uuid, p_department_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select (p_project_id is not null and can_manage_project(p_project_id))
      or (p_department_id is not null and has_permission('chat.manage', p_department_id));
$$;

-- ---------------------------------------------------------------------------
-- Functions that checked for an organization admin themselves
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_reports_to(p_user_id uuid, p_manager_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_org uuid := current_org_id();
begin
  if v_org is null or not has_permission('directory.manage') then
    raise exception 'Only an organization admin can change who someone reports to' using errcode = '42501';
  end if;
  if p_user_id = p_manager_id then
    raise exception 'Someone cannot report to themselves' using errcode = '22023';
  end if;
  if not exists (select 1 from users where id = p_user_id and organization_id = v_org)
     or (p_manager_id is not null and not exists (select 1 from users where id = p_manager_id and organization_id = v_org)) then
    raise exception 'Both people must be in your organization' using errcode = '22023';
  end if;
  -- No loops: the new manager can't already report (directly or not) to this person
  if p_manager_id is not null and exists (
    with recursive chain(id) as (
      select reports_to from users where id = p_manager_id
      union
      select u.reports_to from users u join chain c on u.id = c.id where u.reports_to is not null
    )
    select 1 from chain where id = p_user_id
  ) then
    raise exception 'That would make a reporting loop' using errcode = '22023';
  end if;
  update users set reports_to = p_manager_id where id = p_user_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.users_guard_protected_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if current_user in ('authenticated', 'anon') and (
       new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.email is distinct from old.email
    or new.auth_provider is distinct from old.auth_provider
  ) then
    raise exception 'Not allowed to change id, organization, email or auth provider';
  end if;
  if current_user in ('authenticated', 'anon')
     and new.reports_to is distinct from old.reports_to
     and not public.has_permission('directory.manage') then
    raise exception 'Only an organization admin can change who someone reports to';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.tasks_guard_due_date()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is not null
     and new.due_date is distinct from old.due_date
     and not (
       case
         when old.project_id is not null then can_manage_project(old.project_id)
         else has_org_permission('task.manage_unfiled', old.organization_id)
       end
     ) then
    raise exception 'Only project managers and admins can change a task''s deadline'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

create or replace function public.remove_from_organization(p_user_id uuid default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_caller uuid := auth.uid();
  v_target uuid := coalesce(p_user_id, auth.uid());
  v_is_leaving boolean;
  v_org uuid;
  v_name text;
  v_email text;
  v_target_is_org_admin boolean;
begin
  if v_caller is null then
    raise exception 'Sign in first.' using errcode = '42501', hint = 'org_exit';
  end if;
  if not mfa_satisfied() then
    raise exception 'Enter your authenticator code first.' using errcode = '42501', hint = 'org_exit';
  end if;

  v_is_leaving := v_target = v_caller;

  select organization_id into v_org from users where id = v_target;
  if v_org is null then
    raise exception 'That person is not in an organization.' using errcode = 'P0001', hint = 'org_exit';
  end if;

  -- One exit per organization at a time. Without this, two admins leaving at
  -- the same moment would each still see the other as an admin and both get
  -- through, leaving nobody in charge. Every check below runs after the lock.
  perform 1 from organizations where id = v_org for update;

  select name, email into v_name, v_email
  from users where id = v_target and organization_id = v_org for update;
  if not found then
    raise exception 'That person is not in an organization.' using errcode = 'P0001', hint = 'org_exit';
  end if;

  select exists (
    select 1 from memberships m
    where m.user_id = v_target
      and membership_role_key(m.team_space_id, m.role) in (select r.key from rbac_roles r where r.scope = 'organization')
  ) into v_target_is_org_admin;

  if v_is_leaving then
    if v_target_is_org_admin
       and exists (select 1 from users u where u.organization_id = v_org and u.id <> v_target)
       and not exists (
         select 1 from memberships m
         join users u on u.id = m.user_id
         where u.organization_id = v_org
           and u.id <> v_target
           and membership_role_key(m.team_space_id, m.role) in (select r.key from rbac_roles r where r.scope = 'organization')
       ) then
      raise exception 'You are the only organization admin. Make someone else an admin before you leave.'
        using errcode = 'P0001', hint = 'org_exit';
    end if;
  else
    if not has_org_permission('member.remove_from_organization', v_org) then
      raise exception 'Only an organization admin can remove people.' using errcode = '42501', hint = 'org_exit';
    end if;
    if v_target_is_org_admin then
      raise exception 'Organization admins can''t be removed. They have to leave themselves.'
        using errcode = 'P0001', hint = 'org_exit';
    end if;
  end if;

  -- Unfinished work goes back to "unassigned" so someone picks it up;
  -- finished tasks keep their name
  update tasks set assignee_id = null
  where assignee_id = v_target and organization_id = v_org and status <> 'done';

  delete from project_members pm
  using project_spaces ps, team_spaces ts
  where pm.user_id = v_target
    and ps.id = pm.project_id
    and ts.id = ps.team_space_id
    and ts.organization_id = v_org;

  -- A person is in one organization at a time, so every channel and
  -- membership they hold belongs to this one
  delete from chat_channel_members where user_id = v_target;
  delete from memberships where user_id = v_target;

  -- A channel's creator can always read and manage it (can_see_channel,
  -- can_manage_channel), member or not. The channels stay; whoever manages
  -- the project or department still manages them.
  update chat_channels set created_by = null where created_by = v_target;

  -- A pending invite would pull them straight back in at the next sign-in
  -- (claim_pending_invites)
  delete from invites
  where organization_id = v_org and accepted_at is null and lower(email) = lower(v_email);
  delete from invitations
  where organization_id = v_org and status = 'pending'
    and (invited_user_id = v_target or lower(email) = lower(v_email));

  -- Their bell only held this organization's tasks and projects
  delete from notifications where user_id = v_target;

  update users set reports_to = null
  where reports_to = v_target and organization_id = v_org;

  update users set organization_id = null, reports_to = null, job_title = null
  where id = v_target;

  insert into activity_log (entity_type, entity_id, actor_id, action, prior_state, new_state)
  values (
    'organization', v_org, v_caller,
    case when v_is_leaving then 'member_left' else 'member_removed' end,
    jsonb_build_object('user_id', v_target, 'name', v_name, 'email', v_email),
    null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Policies that named a role or an admin helper directly
-- ---------------------------------------------------------------------------

alter policy "announcements_insert" on public.announcements
  with check (organization_id = current_org_id() and has_permission('announcement.manage'));

alter policy "announcements_update" on public.announcements
  using (organization_id = current_org_id() and (has_permission('announcement.manage') or author_id = auth.uid()));

alter policy "announcements_delete" on public.announcements
  using (organization_id = current_org_id() and (has_permission('announcement.manage') or author_id = auth.uid()));

alter policy "calendar_events_insert" on public.calendar_events
  with check (organization_id = current_org_id() and has_permission('event.manage'));

alter policy "calendar_events_update" on public.calendar_events
  using (organization_id = current_org_id() and (has_permission('event.manage') or created_by = auth.uid()))
  with check (organization_id = current_org_id() and (has_permission('event.manage') or created_by = auth.uid()));

alter policy "calendar_events_delete" on public.calendar_events
  using (organization_id = current_org_id() and (has_permission('event.manage') or created_by = auth.uid()));

alter policy "Admins can view invitations for their org" on public.invitations
  using (has_permission('invitation.view', team_space_id));

alter policy "invites_select" on public.invites
  using (organization_id = current_org_id() and has_permission('member.invite'));

alter policy "memberships_select" on public.memberships
  using (user_id = auth.uid() or has_org_permission('member.assign_role', membership_org(team_space_id, user_id)) or (team_space_id is not null and has_permission('department.view', team_space_id)));

alter policy "memberships_insert" on public.memberships
  with check (has_org_permission('member.assign_role', membership_org(team_space_id, user_id)));

alter policy "memberships_update" on public.memberships
  using (has_org_permission('member.assign_role', membership_org(team_space_id, user_id)))
  with check (has_org_permission('member.assign_role', membership_org(team_space_id, user_id)));

alter policy "memberships_delete" on public.memberships
  using (has_org_permission('member.assign_role', membership_org(team_space_id, user_id)) or (team_space_id is not null and has_permission('member.remove', team_space_id)));

alter policy "milestones_insert" on public.milestones
  with check (has_permission('milestone.manage', (select ps.team_space_id from project_spaces ps where ps.id = milestones.project_id)));

alter policy "milestones_update" on public.milestones
  using (has_permission('milestone.manage', (select ps.team_space_id from project_spaces ps where ps.id = milestones.project_id)));

alter policy "org_feed_insert" on public.org_feed_items
  with check (organization_id = current_org_id() and has_permission('feed.post', team_space_id));

alter policy "organizations_update_admin" on public.organizations
  using (id = current_org_id() and has_permission('organization.update'))
  with check (id = current_org_id() and has_permission('organization.update'));

alter policy "project_spaces_select" on public.project_spaces
  using (has_permission('project.view', team_space_id) or is_project_member(id));

alter policy "project_spaces_insert" on public.project_spaces
  with check (has_permission('project.create', team_space_id));

alter policy "project_spaces_update" on public.project_spaces
  using (has_permission('project.manage', team_space_id))
  with check (has_permission('project.manage', team_space_id));

alter policy "project_spaces_delete" on public.project_spaces
  using (has_permission('project.delete', team_space_id));

alter policy "tasks_delete" on public.tasks
  using (created_by = auth.uid() or (project_id is null and has_org_permission('task.manage_unfiled', organization_id)) or (project_id is not null and can_manage_project(project_id)));

alter policy "team_space_stats_select" on public.team_space_stats
  using (has_permission('department.view', team_space_id));

alter policy "team_spaces_select" on public.team_spaces
  using (organization_id = current_org_id() and (has_permission('department.view', id) or is_member_of_project_in_team(id)));

alter policy "team_spaces_insert_admin" on public.team_spaces
  with check (organization_id = current_org_id() and has_permission('department.create'));

alter policy "team_spaces_update_admin" on public.team_spaces
  using (organization_id = current_org_id() and has_permission('department.update'))
  with check (organization_id = current_org_id() and has_permission('department.update'));

alter policy "team_spaces_delete_admin" on public.team_spaces
  using (organization_id = current_org_id() and has_permission('department.delete'));

alter policy "general_media_insert" on storage.objects
  with check (bucket_id = 'general-media' and ((split_part(name, '/', 1) = 'avatars' and storage_path_uuid(name, 2) = auth.uid()) or (split_part(name, '/', 1) = 'announcements' and storage_path_uuid(name, 2) = current_org_id() and has_permission('announcement.manage'))));

alter policy "general_media_delete" on storage.objects
  using (bucket_id = 'general-media' and ((split_part(name, '/', 1) = 'avatars' and storage_path_uuid(name, 2) = auth.uid()) or (split_part(name, '/', 1) = 'announcements' and storage_path_uuid(name, 2) = current_org_id() and has_permission('announcement.manage'))));
