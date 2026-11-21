-- Does has_permission() give the same answers as the rules it will replace?
--
-- For every person in an organization, every department and every
-- organization, this asks the old helper and the new function the same
-- question as that person and counts where they differ. It changes nothing:
-- it finishes by raising an error whose message is the report, which also
-- undoes the settings it made.
--
-- Run (needs migration 20261112100000_rbac_foundation applied):
--   npx supabase db query --remote --yes -f supabase/checks/rbac_parity.sql
-- (--read-only rejects do blocks, so it needs --yes; it still changes nothing)
--
-- Expected differences:
--   1. Organization roles gain two things the old rules gave only by
--      department role, leaving organization admins out:
--        milestone.manage   old: team lead or higher in the department
--        invitation.view    old: admin of the department
--   2. "another organization's department | old true, new false": a
--      membership in a department of an organization the person is not in.
--      The old helpers honour it; has_permission() does not.
-- Anything else in the report is a mistake in the permission data.
do $parity$
declare
  v_user record;
  v_team record;
  v_org record;
  v_check record;
  v_roles text;
  v_old boolean;
  v_new boolean;
  v_key text;
  v_checked integer := 0;
  v_differences jsonb := '{}'::jsonb;
begin
  for v_user in select id from users where organization_id is not null loop
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', v_user.id, 'role', 'authenticated', 'aal', 'aal2')::text,
      true
    );
    select coalesce(string_agg(distinct membership_role_key(team_space_id, role), '+' order by membership_role_key(team_space_id, role)), 'no role')
      into v_roles from memberships where user_id = v_user.id;

    for v_team in select id, organization_id from team_spaces loop
      for v_check in
        select * from (values
          ('department.view',  has_team_access(v_team.id) or is_admin_of_org(v_team.organization_id)),
          ('project.view',     has_team_access(v_team.id) or is_admin_of_org(v_team.organization_id)),
          ('project.edit',     team_role_at_least(v_team.id, 'member') or is_admin_of_org(v_team.organization_id)),
          ('project.create',   team_role_at_least(v_team.id, 'team_lead') or is_admin_of_org(v_team.organization_id)),
          ('project.manage',   team_role_at_least(v_team.id, 'team_lead') or is_admin_of_org(v_team.organization_id)),
          ('project.delete',   team_role_at_least(v_team.id, 'team_lead') or is_admin_of_org(v_team.organization_id)),
          ('chat.manage',      team_role_at_least(v_team.id, 'team_lead') or is_admin_of_org(v_team.organization_id)),
          ('member.remove',    team_role_at_least(v_team.id, 'team_lead') or is_admin_of_org(v_team.organization_id)),
          ('feed.post',        v_team.organization_id = current_org_id() and (is_org_admin() or team_role_at_least(v_team.id, 'team_lead'))),
          ('member.add',       is_admin_of_org(v_team.organization_id) or coalesce(team_role(v_team.id) = 'admin', false)),
          ('milestone.manage', team_role_at_least(v_team.id, 'team_lead')),
          ('invitation.view',  coalesce(team_role(v_team.id) in ('admin', 'super_admin'), false))
        ) as c(permission, old_answer)
      loop
        v_old := coalesce(v_check.old_answer, false);
        v_new := has_permission(v_check.permission, v_team.id);
        v_checked := v_checked + 1;
        if v_old is distinct from v_new then
          v_key := format('%s | holds %s | %s department | old %s, new %s', v_check.permission, v_roles,
            case when v_team.organization_id = current_org_id() then 'own' else 'another organization''s' end, v_old, v_new);
          v_differences := jsonb_set(v_differences, array[v_key], to_jsonb(coalesce((v_differences ->> v_key)::integer, 0) + 1));
        end if;
      end loop;
    end loop;

    for v_org in select id from organizations loop
      for v_check in select key as permission from rbac_permissions where scope = 'organization' loop
        v_old := is_admin_of_org(v_org.id);
        v_new := has_org_permission(v_check.permission, v_org.id);
        v_checked := v_checked + 1;
        if v_old is distinct from v_new then
          v_key := format('%s | holds %s | %s organization | old %s, new %s', v_check.permission, v_roles,
            case when v_org.id = current_org_id() then 'own' else 'another' end, v_old, v_new);
          v_differences := jsonb_set(v_differences, array[v_key], to_jsonb(coalesce((v_differences ->> v_key)::integer, 0) + 1));
        end if;
      end loop;
    end loop;
  end loop;

  raise exception 'RBAC PARITY: % answers compared. Differences: %', v_checked,
    case when v_differences = '{}'::jsonb then 'none'
         else (select string_agg(format('[%s x%s]', key, value), ' ' order by key) from jsonb_each_text(v_differences)) end;
end
$parity$;
