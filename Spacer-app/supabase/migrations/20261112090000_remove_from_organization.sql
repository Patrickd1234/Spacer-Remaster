-- Leave an organization, or remove someone from it, for good.
-- Rollback: supabase/rollback/20261112090000_remove_from_organization_rollback.sql
--
-- Until now "Remove" on the Department page only deleted one department
-- membership; the person stayed in the organization. users.organization_id
-- can't be changed from the browser (users_guard_protected_columns), so this
-- function is the only way out.
--
--   remove_from_organization(null)      the caller leaves their organization
--   remove_from_organization(<user id>) an organization admin removes that user
--
-- Afterwards the person has no organization, so the app sends them to
-- /welcome like a new sign-up: they can launch an organization or accept an
-- invite. Their sign-in, name, bio and photo stay. What they made (tasks,
-- comments, messages) stays in the organization.
--
-- Rules:
--   * the caller must be signed in and past MFA
--   * removing someone else needs is_org_admin() in the same organization
--   * an organization admin can't be removed by someone else; they leave themselves
--   * the last organization admin can't leave while other people remain
--
-- Refusals are raised with hint 'org_exit' so the app can show them as written.

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
      and ((m.team_space_id is null and m.role = 'admin') or m.role = 'super_admin')
  ) into v_target_is_org_admin;

  if v_is_leaving then
    if v_target_is_org_admin
       and exists (select 1 from users u where u.organization_id = v_org and u.id <> v_target)
       and not exists (
         select 1 from memberships m
         join users u on u.id = m.user_id
         where u.organization_id = v_org
           and u.id <> v_target
           and ((m.team_space_id is null and m.role = 'admin') or m.role = 'super_admin')
       ) then
      raise exception 'You are the only organization admin. Make someone else an admin before you leave.'
        using errcode = 'P0001', hint = 'org_exit';
    end if;
  else
    -- is_admin_of_org: the caller is in that same organization and is_org_admin()
    if not is_admin_of_org(v_org) then
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

revoke execute on function public.remove_from_organization(uuid) from public, anon;
grant execute on function public.remove_from_organization(uuid) to authenticated;
