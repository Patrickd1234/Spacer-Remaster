-- What does a rules migration change for real people?
--
-- Takes a snapshot of what every person can see and do, applies a migration,
-- takes the snapshot again and reports who gained or lost what. It then
-- raises an error whose message is the report, which rolls the migration
-- back: nothing is kept.
--
-- To use: replace the line marked MIGRATION below with
--     execute $mig$ <the migration's SQL> $mig$;
-- and run the result with
--     npx supabase db query --remote --yes -f <file>
--
-- The snapshot, per person:
--   * which projects they can open, edit and manage (has_project_access,
--     can_edit_project, can_manage_project)
--   * which departments' channels they can see and manage
--   * exactly which rows of each table row-level security lets them read
-- Insert, update and delete rules are not exercised row by row; they call
-- has_permission() directly, which supabase/checks/rbac_parity.sql compares
-- with the old rules.
--
-- Written for 20261112110000_rbac_rules, whose intended effects are:
--   * people with an organization role see more invitations and
--     team_space_stats rows
--   * people holding a role in another organization's department lose what
--     that role gave them there
-- The report lists those as "expected" totals and anything else in full.
do $compare$
declare
  v_phase integer;
  v_user record;
  v_metric record;
  v_table text;
  v_value text;
  v_roles text;
  v_is_org_role boolean;
  v_is_cross_org boolean;
  v_before jsonb := '{}'::jsonb;
  v_now jsonb;
  v_was text;
  v_expected_gain integer := 0;
  v_expected_loss integer := 0;
  v_unexpected text := '';
  v_compared integer := 0;
  v_tables text[] := array[
    'project_spaces', 'tasks', 'milestones', 'memberships', 'invitations', 'invites', 'team_spaces',
    'announcements', 'calendar_events', 'messages', 'chat_channels', 'project_files', 'sprints',
    'comments', 'activity_log', 'org_feed_items', 'organizations', 'users', 'project_columns',
    'project_members', 'daily_standups', 'notifications', 'attachments', 'direct_messages'
  ];
begin
  for v_phase in 1..2 loop
    if v_phase = 2 then
      -- MIGRATION
      null;
    end if;

    for v_user in select id from users where organization_id is not null order by id loop
      perform set_config(
        'request.jwt.claims',
        json_build_object('sub', v_user.id, 'role', 'authenticated', 'aal', 'aal2')::text,
        true
      );
      v_now := '{}'::jsonb;

      -- Answers of the helpers the policies call, as this person
      for v_metric in
        select 'can open projects' as name, count(*) filter (where has_project_access(ps.id)) as n,
               md5(coalesce(string_agg(ps.id::text, ',' order by ps.id) filter (where has_project_access(ps.id)), '')) as fingerprint
        from project_spaces ps
        union all
        select 'can edit projects', count(*) filter (where can_edit_project(ps.id)),
               md5(coalesce(string_agg(ps.id::text, ',' order by ps.id) filter (where can_edit_project(ps.id)), ''))
        from project_spaces ps
        union all
        select 'can manage projects', count(*) filter (where can_manage_project(ps.id)),
               md5(coalesce(string_agg(ps.id::text, ',' order by ps.id) filter (where can_manage_project(ps.id)), ''))
        from project_spaces ps
        union all
        select 'can see department channels', count(*) filter (where has_channel_scope_access(null, t.id)),
               md5(coalesce(string_agg(t.id::text, ',' order by t.id) filter (where has_channel_scope_access(null, t.id)), ''))
        from team_spaces t
        union all
        select 'can manage department channels', count(*) filter (where can_manage_channel_scope(null, t.id)),
               md5(coalesce(string_agg(t.id::text, ',' order by t.id) filter (where can_manage_channel_scope(null, t.id)), ''))
        from team_spaces t
      loop
        v_now := v_now || jsonb_build_object(v_metric.name, v_metric.n || ':' || v_metric.fingerprint);
      end loop;

      -- The rows row-level security lets this person read
      set local role authenticated;
      foreach v_table in array v_tables loop
        execute format(
          'select count(*) || '':'' || md5(coalesce(string_agg(id::text, '','' order by id::text), '''')) from public.%I',
          v_table
        ) into v_value;
        v_now := v_now || jsonb_build_object('reads ' || v_table, v_value);
      end loop;
      select count(*) || ':' || md5(coalesce(string_agg(team_space_id::text, ',' order by team_space_id::text), ''))
        into v_value from public.team_space_stats;
      v_now := v_now || jsonb_build_object('reads team_space_stats', v_value);
      reset role;

      if v_phase = 1 then
        v_before := v_before || jsonb_build_object(v_user.id::text, v_now);
        continue;
      end if;

      select coalesce(string_agg(distinct membership_role_key(m.team_space_id, m.role), '+' order by membership_role_key(m.team_space_id, m.role)), 'no role'),
             coalesce(bool_or(membership_role_key(m.team_space_id, m.role) in ('owner', 'org_admin')), false),
             coalesce(bool_or(m.team_space_id is not null and team_space_org(m.team_space_id) is distinct from u.organization_id), false)
        into v_roles, v_is_org_role, v_is_cross_org
      from users u left join memberships m on m.user_id = u.id
      where u.id = v_user.id
      group by u.id;

      for v_metric in select key as name, value as now from jsonb_each_text(v_now) loop
        v_compared := v_compared + 1;
        v_was := v_before -> v_user.id::text ->> v_metric.name;
        continue when v_was = v_metric.now;
        if split_part(v_metric.now, ':', 1)::integer > split_part(v_was, ':', 1)::integer
           and v_is_org_role and v_metric.name in ('reads invitations', 'reads team_space_stats') then
          v_expected_gain := v_expected_gain + 1;
        elsif split_part(v_metric.now, ':', 1)::integer < split_part(v_was, ':', 1)::integer and v_is_cross_org then
          v_expected_loss := v_expected_loss + 1;
        else
          v_unexpected := v_unexpected || format('[%s | %s%s | %s -> %s] ', v_metric.name, v_roles,
            case when v_is_cross_org then ' (has a cross-organization role)' else '' end,
            split_part(v_was, ':', 1), split_part(v_metric.now, ':', 1));
        end if;
      end loop;
    end loop;
  end loop;

  raise exception 'RULES COMPARE: % answers compared per phase. Expected gains (organization roles): %. Expected losses (cross-organization roles): %. Unexpected: %',
    v_compared, v_expected_gain, v_expected_loss, case when v_unexpected = '' then 'none' else left(v_unexpected, 700) end;
end
$compare$;
