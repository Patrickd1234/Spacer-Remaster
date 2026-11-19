-- Activity belongs to an organization.
-- Rollback: supabase/rollback/20261113090000_activity_log_organization_rollback.sql
--
-- activity_log had no organization. can_see_activity() lets everyone read
-- their own entries, so someone who left an organization and joined or
-- launched another still saw what they had done in the old one (My Space >
-- Recent Activities, Profile, the notifications bell).
--
-- Every entry now carries the organization it happened in, and is readable
-- only from inside that organization.
--
--   * New entries: a trigger sets organization_id. For the app it is always
--     the caller's own organization, whatever the request says. For database
--     functions and edge functions (service role) it is the caller's
--     organization, else the actor's.
--   * Old entries: filled in from what the entry is about (its organization,
--     task, project or department). What can't be traced that way goes to the
--     actor's current organization, unless they have since left or been
--     removed from one: then it stays empty, and is hidden, rather than be
--     shown in the wrong organization.
--   * "Left" and "removed from the organization" entries are readable by the
--     person who did it and by people who may remove members.

alter table public.activity_log
  add column organization_id uuid references public.organizations(id) on delete cascade;

create index activity_log_organization_created_idx
  on public.activity_log (organization_id, created_at desc);

-- Not security definer, so current_user is the role doing the insert
create or replace function public.activity_log_set_organization()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.organization_id := public.current_org_id();
  elsif new.organization_id is null then
    new.organization_id := coalesce(
      public.current_org_id(),
      (select u.organization_id from public.users u where u.id = new.actor_id)
    );
  end if;
  return new;
end;
$$;

create trigger activity_log_set_organization
  before insert on public.activity_log
  for each row execute function public.activity_log_set_organization();

-- Old entries, most certain source first
update public.activity_log a set organization_id = o.id
from public.organizations o
where a.organization_id is null and a.entity_type = 'organization' and o.id = a.entity_id;

update public.activity_log a set organization_id = o.id
from public.organizations o
where a.organization_id is null
  and o.id::text = coalesce(a.new_state ->> 'organization_id', a.prior_state ->> 'organization_id');

update public.activity_log a set organization_id = t.organization_id
from public.project_spaces ps
join public.team_spaces t on t.id = ps.team_space_id
where a.organization_id is null
  and ps.id::text = coalesce(a.new_state ->> 'project_id', a.prior_state ->> 'project_id',
                             case when a.entity_type = 'project' then a.entity_id::text end);

update public.activity_log a set organization_id = t.organization_id
from public.team_spaces t
where a.organization_id is null
  and t.id::text = coalesce(a.new_state ->> 'team_space_id', a.prior_state ->> 'team_space_id',
                            case when a.entity_type = 'department' then a.entity_id::text end);

update public.activity_log a set organization_id = k.organization_id
from public.tasks k
where a.organization_id is null and a.entity_type = 'task' and k.id = a.entity_id;

update public.activity_log a set organization_id = u.organization_id
from public.users u
where a.organization_id is null
  and u.id = a.actor_id
  and u.organization_id is not null
  and not exists (
    select 1 from public.activity_log x
    where x.entity_type = 'organization'
      and x.action in ('member_left', 'member_removed')
      and x.prior_state ->> 'user_id' = a.actor_id::text
      and x.created_at >= a.created_at
  );

-- So the feed can say who left without reading prior_state
update public.activity_log
set new_state = jsonb_build_object('user_id', prior_state -> 'user_id', 'name', prior_state -> 'name')
where entity_type = 'organization' and action in ('member_left', 'member_removed') and new_state is null;

alter policy activity_log_select on public.activity_log
  using (
    organization_id = current_org_id()
    and case
      when entity_type = 'organization'
        then actor_id = auth.uid() or has_permission('member.remove_from_organization')
      else can_see_activity(actor_id, entity_type, entity_id, new_state)
    end
  );

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

  -- organization_id is given here: by now the person leaving has none, so the
  -- insert trigger could not work it out. new_state names who left, for the feed.
  insert into activity_log (entity_type, entity_id, actor_id, action, prior_state, new_state, organization_id)
  values (
    'organization', v_org, v_caller,
    case when v_is_leaving then 'member_left' else 'member_removed' end,
    jsonb_build_object('user_id', v_target, 'name', v_name, 'email', v_email),
    jsonb_build_object('user_id', v_target, 'name', v_name),
    v_org
  );
end;
$function$;
