-- Organization launch in one transaction, plus two invite fixes.
-- Rollback: supabase/rollback/20261030100000_launch_organization_atomic_rollback.sql
--
-- 1. launch_organization(): the launch-organization edge function used to send
--    one request per row and ignored most errors, so a failure half way left an
--    organization with no admin or missing teams. A function body runs as one
--    transaction: any error undoes every row it wrote.
--
-- 2. The founder's org-level membership was inserted as 'super_admin', which the
--    memberships_org_role_admin_only check rejects (org-level rows must be
--    'admin'). The error was ignored, so founders never became admins. The
--    function inserts 'admin', and the backfill below repairs existing orgs.
--
-- 3. claim_pending_invites() added memberships from every pending invite for the
--    caller's email, even invites from a different organization than the one the
--    caller already belongs to. It now skips those.

create or replace function public.launch_organization(
  p_user_id uuid,
  p_organization_name text,
  p_team_spaces jsonb
)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  v_current_org uuid;
  v_founder_email text;
  v_org organizations;
  v_team team_spaces;
  v_team_input jsonb;
  v_teams jsonb := '[]'::jsonb;
  v_invites jsonb := '[]'::jsonb;
  v_invite record;
begin
  if coalesce(btrim(p_organization_name), '') = '' then
    raise exception 'organization_name is required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_team_spaces) is distinct from 'array'
     or jsonb_array_length(p_team_spaces) not between 1 and 5 then
    raise exception 'team_spaces must contain 1 to 5 entries' using errcode = '22023';
  end if;

  -- Row lock: a second launch from the same user (double click, two tabs) waits
  -- here, then sees the organization the first one set and stops
  select organization_id, lower(email) into v_current_org, v_founder_email
  from users where id = p_user_id
  for update;
  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;
  if v_current_org is not null then
    raise exception 'You already belong to an organization.' using errcode = '23505';
  end if;

  insert into organizations (name) values (btrim(p_organization_name)) returning * into v_org;
  update users set organization_id = v_org.id where id = p_user_id;
  insert into memberships (user_id, team_space_id, role) values (p_user_id, null, 'admin');

  for v_team_input in select value from jsonb_array_elements(p_team_spaces) loop
    continue when coalesce(btrim(v_team_input ->> 'name'), '') = '';

    insert into team_spaces (organization_id, name)
    values (v_org.id, btrim(v_team_input ->> 'name'))
    returning * into v_team;
    v_teams := v_teams || to_jsonb(v_team);

    -- One invite per address per team; if the lead is also listed as a member,
    -- the lead role wins. The founder never invites themselves.
    for v_invite in
      select distinct on (e.email) e.email, e.role
      from (
        select lower(btrim(v_team_input ->> 'team_lead_email')) as email, 'team_lead'::membership_role as role, 0 as rank
        union all
        select lower(btrim(m)), 'member'::membership_role, 1
        from jsonb_array_elements_text(coalesce(v_team_input -> 'member_emails', '[]'::jsonb)) as m
      ) e
      where coalesce(e.email, '') <> '' and e.email <> v_founder_email
      order by e.email, e.rank
    loop
      insert into invites (organization_id, team_space_id, email, role, invited_by)
      values (v_org.id, v_team.id, v_invite.email, v_invite.role, p_user_id);
      v_invites := v_invites || jsonb_build_object(
        'email', v_invite.email,
        'role', v_invite.role,
        'team_space_id', v_team.id,
        'team_name', v_team.name
      );
    end loop;
  end loop;

  if jsonb_array_length(v_teams) = 0 then
    raise exception 'At least one team space needs a name' using errcode = '22023';
  end if;

  return jsonb_build_object('organization', to_jsonb(v_org), 'team_spaces', v_teams, 'invites', v_invites);
end;
$$;

-- Takes the user id as a parameter, so only the edge function (service role,
-- after verifying the caller's JWT) may call it
revoke execute on function public.launch_organization(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.launch_organization(uuid, text, jsonb) to service_role;

create or replace function public.claim_pending_invites()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email text;
  v_org uuid;
  v_invite record;
begin
  select email into v_email from users where id = auth.uid();
  if v_email is null then
    return;
  end if;

  for v_invite in
    select * from invites
    where lower(email) = lower(v_email) and accepted_at is null
    order by created_at
  loop
    -- Re-read each time: the first claimed invite may have just set it
    select organization_id into v_org from users where id = auth.uid();
    continue when v_org is not null and v_org <> v_invite.organization_id;

    update users set organization_id = v_invite.organization_id
      where id = auth.uid() and organization_id is null;

    insert into memberships (user_id, team_space_id, role)
    values (auth.uid(), v_invite.team_space_id, v_invite.role)
    on conflict do nothing;

    update invites set accepted_at = now() where id = v_invite.id;
  end loop;
end;
$$;

-- Backfill: organizations left without an admin by the old launch flow. The
-- founder is the only person who sent that organization's launch invites.
insert into memberships (user_id, team_space_id, role)
select founder.invited_by, null, 'admin'
from (
  select i.organization_id, min(i.invited_by::text)::uuid as invited_by
  from invites i
  where i.invited_by is not null
  group by i.organization_id
  having count(distinct i.invited_by) = 1
) founder
join users u on u.id = founder.invited_by and u.organization_id = founder.organization_id
where not exists (
  select 1 from users ou
  join memberships m on m.user_id = ou.id and m.team_space_id is null
  where ou.organization_id = founder.organization_id
)
on conflict do nothing;
