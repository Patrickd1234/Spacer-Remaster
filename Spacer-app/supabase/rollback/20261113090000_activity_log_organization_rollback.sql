-- Undo 20261113090000_activity_log_organization.sql
-- People can read their own activity from every organization again. The
-- organization recorded on each entry is dropped; nothing else is lost.

alter policy activity_log_select on public.activity_log
  using (can_see_activity(actor_id, entity_type, entity_id, new_state));

drop trigger if exists activity_log_set_organization on public.activity_log;
drop function if exists public.activity_log_set_organization();
drop index if exists public.activity_log_organization_created_idx;
alter table public.activity_log drop column if exists organization_id;

CREATE OR REPLACE FUNCTION public.remove_from_organization(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
