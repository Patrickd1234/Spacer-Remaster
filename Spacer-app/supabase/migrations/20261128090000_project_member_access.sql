-- A project is open to the people picked for it (design doc "Project Creation
-- & Cross-Department Workflow", user decision of 26 Nov 2026).
-- Rollback: supabase/rollback/20261128090000_project_member_access_rollback.sql
--
-- Before: anyone holding project.view (every role, Viewer included) in the
-- project's department or one of its joined departments could open it, and
-- project.edit (Member and up) could change its tasks.
-- After: a project is open to
--   * its members (project_members), and
--   * whoever manages projects (project.manage: team leads, department admins,
--     Owner, Organization Admin) in one of its joined departments.
-- Existing projects keep their people: everyone who could open one only through
-- project.view is added as a member first, without a notice or an email.
-- A Viewer stays read-only: membership lets a project member edit unless their
-- only role in the project's departments lacks project.edit
-- (project_member_is_viewer_only()).
--
-- Also:
--   * project_spaces.description (optional, up to 250 characters)
--   * create_project() takes the description and the members picked per
--     department; for an invited department they are a proposal
--     (project_departments.proposed_member_ids) its lead confirms on accepting
--   * respond_to_department_invite() takes the members the accepting lead keeps
--   * my_department_invites() returns the proposal
--   * someone given a task in a project they can't open, who belongs to one of
--     its departments, is added to it (quietly: the assignment is the news)

-- ─── 1. Columns ─────────────────────────────────────────────────────────────
alter table public.project_spaces add column if not exists description text;
alter table public.project_spaces drop constraint if exists project_spaces_description_length;
alter table public.project_spaces
  add constraint project_spaces_description_length check (description is null or char_length(description) <= 250);

alter table public.project_departments
  add column if not exists proposed_member_ids uuid[] not null default '{}';

-- ─── 2. Quiet adds ──────────────────────────────────────────────────────────
-- While spacer.quiet_member_add is 'on' (set locally to the transaction),
-- adding a project member sends neither the in-app notice nor the email.
create or replace function public.project_members_notify()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare
  v_actor_name text;
  v_project_name text;
begin
  -- Joining a project yourself isn't news, nor is a quiet add
  if new.user_id is null or new.user_id = auth.uid()
     or coalesce(current_setting('spacer.quiet_member_add', true), '') = 'on' then
    return new;
  end if;
  select name into v_actor_name from users where id = auth.uid();
  select name into v_project_name from project_spaces where id = new.project_id;
  perform notify_user(new.user_id, 'project_added', 'project', new.project_id,
    coalesce(v_actor_name, 'Someone') || ' added you to "' || coalesce(v_project_name, 'a project') || '"');
  return new;
end;
$$;

drop trigger if exists project_members_email_on_insert on public.project_members;
create trigger project_members_email_on_insert
  after insert on public.project_members
  for each row
  when (coalesce(current_setting('spacer.quiet_member_add', true), '') <> 'on')
  execute function dispatch_edge_webhook('send-notification');

-- ─── 3. Nobody loses a project they can open today ──────────────────────────
-- Department-role holders whose role gives project.view but not
-- project.manage (Member, Viewer) in a joined department become members.
-- Managers keep their access through their role and aren't added.
select set_config('spacer.quiet_member_add', 'on', true);

insert into public.project_members (project_id, user_id)
select distinct d.project_id, m.user_id
from (
  select ps.id as project_id, ps.team_space_id from public.project_spaces ps
  union
  select pd.project_id, pd.team_space_id from public.project_departments pd where pd.status <> 'invited'
) d
join public.memberships m on m.team_space_id = d.team_space_id
join public.users u on u.id = m.user_id and u.organization_id = public.team_space_org(d.team_space_id)
join public.rbac_roles r on r.key = public.membership_role_key(m.team_space_id, m.role) and r.scope = 'department'
where m.user_id is not null
  and exists (select 1 from public.rbac_role_permissions rp where rp.role_key = r.key and rp.permission_key = 'project.view')
  and not exists (select 1 from public.rbac_role_permissions rp where rp.role_key = r.key and rp.permission_key = 'project.manage')
on conflict (project_id, user_id) do nothing;

select set_config('spacer.quiet_member_add', 'off', true);

-- ─── 4. Access: members, plus managers of a joined department ───────────────
create or replace function public.has_project_access(p_project_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from project_spaces ps
    where ps.id = p_project_id
      and (has_permission('project.manage', ps.team_space_id)
           or is_project_member(ps.id)
           or extra_department_has_permission(ps.id, 'project.manage'))
  );
$$;

-- The caller can see the project's departments' projects through a role there
-- (a Viewer) but holds project.edit in none of them: added to a project, they
-- read it but don't change it. A member from outside its departments isn't.
create or replace function public.project_member_is_viewer_only(p_project_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  with departments as (
    select ps.team_space_id from project_spaces ps where ps.id = p_project_id
    union
    select pd.team_space_id from project_departments pd
    where pd.project_id = p_project_id and pd.status <> 'invited'
  )
  select exists (select 1 from departments d where has_permission('project.view', d.team_space_id))
     and not exists (select 1 from departments d where has_permission('project.edit', d.team_space_id));
$$;

revoke execute on function public.project_member_is_viewer_only(uuid) from public, anon;
grant execute on function public.project_member_is_viewer_only(uuid) to authenticated;

create or replace function public.can_edit_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from project_spaces ps
    where ps.id = p_project_id
      and (has_permission('project.manage', ps.team_space_id)
           or extra_department_has_permission(ps.id, 'project.manage')
           or (is_project_member(ps.id) and not project_member_is_viewer_only(ps.id)))
  );
$$;

-- Kept for older callers: "can open the project through another department"
create or replace function public.has_extra_department_access(p_project_id uuid)
returns boolean language sql stable security definer set search_path to public, pg_temp
as $$
  select extra_department_has_permission(p_project_id, 'project.manage');
$$;

alter policy project_spaces_select on public.project_spaces
  using (has_permission('project.manage', team_space_id) or is_project_member(id)
         or extra_department_has_permission(id, 'project.manage'));

-- ─── 5. An assignee from one of the project's departments can open it ───────
create or replace function public.tasks_add_assignee_to_project()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
begin
  if new.project_id is null or new.assignee_id is null then
    return new;
  end if;
  if exists (select 1 from project_members where project_id = new.project_id and user_id = new.assignee_id) then
    return new;
  end if;
  if not exists (
    select 1 from project_spaces ps
    where ps.id = new.project_id and is_department_member(new.assignee_id, ps.team_space_id)
    union all
    select 1 from project_departments pd
    where pd.project_id = new.project_id and pd.status <> 'invited'
      and is_department_member(new.assignee_id, pd.team_space_id)
  ) then
    return new;
  end if;
  perform set_config('spacer.quiet_member_add', 'on', true);
  insert into project_members (project_id, user_id) values (new.project_id, new.assignee_id)
  on conflict (project_id, user_id) do nothing;
  perform set_config('spacer.quiet_member_add', 'off', true);
  return new;
end;
$$;

revoke execute on function public.tasks_add_assignee_to_project() from public, anon, authenticated;

drop trigger if exists tasks_add_assignee_to_project on public.tasks;
create trigger tasks_add_assignee_to_project
  after insert or update of assignee_id, project_id on public.tasks
  for each row execute function public.tasks_add_assignee_to_project();

-- ─── 6. create_project(): description and picked members ────────────────────
-- Each department item may carry member_ids: people of that department.
-- Joined departments: they become members (and get the "added" notice).
-- Invited departments: kept as proposed_member_ids for their lead to confirm.
drop function if exists public.create_project(text, date, uuid, jsonb);

create or replace function public.create_project(
  p_name text, p_due_date date, p_project_lead uuid, p_departments jsonb, p_description text default null
)
returns jsonb
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_description text := nullif(btrim(coalesce(p_description, '')), '');
  v_count int;
  v_lead_team uuid;
  v_org uuid;
  v_project project_spaces;
  v_dept jsonb;
  v_team uuid;
  v_team_name text;
  v_dept_lead uuid;
  v_dept_due date;
  v_is_direct boolean;
  v_index int := 0;
  v_seen uuid[] := '{}';
  v_people uuid[] := '{}';
  v_invited uuid[] := '{}';
  v_members uuid[];
  v_member uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if v_name = '' then
    raise exception 'Please specify a project name.' using errcode = '22023';
  end if;
  if length(v_name) > 200 then
    raise exception 'The project name can be at most 200 characters.' using errcode = '22023';
  end if;
  if v_description is not null and char_length(v_description) > 250 then
    raise exception 'The description can be at most 250 characters.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_departments) is distinct from 'array'
     or jsonb_array_length(p_departments) not between 1 and 20 then
    raise exception 'A project needs 1 to 20 departments.' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_departments);
  if v_count > 1 and p_due_date is null then
    raise exception 'Please pick the overall deadline.' using errcode = '22023';
  end if;

  v_lead_team := nullif(p_departments -> 0 ->> 'team_space_id', '')::uuid;
  v_org := team_space_org(v_lead_team);
  if v_lead_team is null or v_org is null or not has_permission('project.create', v_lead_team) then
    raise exception 'You can only create projects in a department where you''re a team lead or admin.' using errcode = '42501';
  end if;
  if p_project_lead is not null and not is_department_member(p_project_lead, v_lead_team) then
    raise exception 'The project lead must be a member of the lead department.' using errcode = '23514';
  end if;

  -- Every department checked before anything is written
  for v_dept in select value from jsonb_array_elements(p_departments) loop
    v_team := nullif(v_dept ->> 'team_space_id', '')::uuid;
    v_dept_lead := nullif(v_dept ->> 'lead_id', '')::uuid;
    v_dept_due := coalesce(nullif(v_dept ->> 'due_date', '')::date, p_due_date);
    select name into v_team_name from team_spaces where id = v_team;
    if v_team_name is null and v_team is not null then
      select d.name into v_team_name from organization_departments() d where d.id = v_team;
    end if;
    v_team_name := coalesce(v_team_name, 'A department');

    if v_team is null then
      raise exception 'Every department needs to be picked.' using errcode = '22023';
    end if;
    if v_team = any(v_seen) then
      raise exception '% is on the project twice.', v_team_name using errcode = '23514';
    end if;
    if team_space_org(v_team) is distinct from v_org then
      raise exception 'Every department must be in the same organization.' using errcode = '23514';
    end if;
    v_is_direct := has_permission('project.create', v_team);
    if not v_is_direct and v_dept_lead is not null then
      raise exception '%''s lead is picked by % when they accept the invite.', v_team_name, v_team_name using errcode = '23514';
    end if;
    if v_dept_lead is not null and not is_department_member(v_dept_lead, v_team) then
      raise exception '%''s lead must be a member of %.', v_team_name, v_team_name using errcode = '23514';
    end if;
    if p_due_date is not null and v_dept_due > p_due_date then
      raise exception '% is due after the overall deadline.', v_team_name using errcode = '23514';
    end if;
    if v_dept ? 'member_ids' and jsonb_typeof(v_dept -> 'member_ids') is distinct from 'array' then
      raise exception '%''s members must be a list.', v_team_name using errcode = '22023';
    end if;
    if jsonb_array_length(coalesce(v_dept -> 'member_ids', '[]'::jsonb)) > 500 then
      raise exception 'Too many members picked for %.', v_team_name using errcode = '22023';
    end if;
    for v_member in select nullif(value, '')::uuid from jsonb_array_elements_text(coalesce(v_dept -> 'member_ids', '[]'::jsonb)) loop
      if v_member is null or not is_department_member(v_member, v_team) then
        raise exception 'Everyone picked for % must be a member of %.', v_team_name, v_team_name using errcode = '23514';
      end if;
    end loop;
    v_seen := v_seen || v_team;
  end loop;

  -- team_lead is written even when null: the column's default is a random uuid
  insert into project_spaces (team_space_id, name, team_lead, due_date, description)
  values (v_lead_team, v_name, p_project_lead, p_due_date, v_description)
  returning * into v_project;

  for v_dept in select value from jsonb_array_elements(p_departments) loop
    v_team := (v_dept ->> 'team_space_id')::uuid;
    v_dept_lead := nullif(v_dept ->> 'lead_id', '')::uuid;
    v_is_direct := v_index = 0 or has_permission('project.create', v_team);
    select coalesce(array_agg(distinct value::uuid), '{}') into v_members
    from jsonb_array_elements_text(coalesce(v_dept -> 'member_ids', '[]'::jsonb));
    insert into project_departments (project_id, team_space_id, lead_id, due_date, is_lead_department, status, proposed_member_ids)
    values (
      v_project.id, v_team,
      case when v_is_direct then v_dept_lead end,
      coalesce(nullif(v_dept ->> 'due_date', '')::date, p_due_date),
      v_index = 0,
      case when v_is_direct then 'active' else 'invited' end,
      case when v_is_direct then '{}'::uuid[] else v_members end
    );
    if v_is_direct then
      if v_dept_lead is not null then v_people := v_people || v_dept_lead; end if;
      v_people := v_people || v_members;
    else
      v_invited := v_invited || v_team;
    end if;
    v_index := v_index + 1;
  end loop;

  -- The project lead, the joined departments' leads and their picked members
  -- join the project (the project_members triggers send the "added to a
  -- project" notice and email)
  if p_project_lead is not null then v_people := v_people || p_project_lead; end if;
  insert into project_members (project_id, user_id)
  select distinct v_project.id, person from unnest(v_people) as person
  on conflict (project_id, user_id) do nothing;

  insert into activity_log (entity_type, entity_id, actor_id, action, new_state)
  values ('project', v_project.id, auth.uid(), 'created',
          jsonb_build_object('project_name', v_project.name, 'team_space_id', v_project.team_space_id));

  return jsonb_build_object('project', to_jsonb(v_project), 'invited_department_ids', to_jsonb(v_invited));
end;
$$;

revoke execute on function public.create_project(text, date, uuid, jsonb, text) from public, anon;
grant execute on function public.create_project(text, date, uuid, jsonb, text) to authenticated;

-- ─── 7. Answering an invite: the lead keeps or changes the proposed members ─
drop function if exists public.respond_to_department_invite(uuid, uuid, boolean, uuid, date);

create or replace function public.respond_to_department_invite(
  p_project_id uuid, p_team_space_id uuid, p_accept boolean,
  p_lead_id uuid default null, p_due_date date default null, p_member_ids uuid[] default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_row project_departments;
  v_actor text;
  v_project text;
  v_department text;
  v_members uuid[];
begin
  if auth.uid() is null or not mfa_satisfied() then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  if not has_permission('project.manage', p_team_space_id) then
    raise exception 'Only the invited department''s leads can answer this invite' using errcode = '42501';
  end if;
  select * into v_row from project_departments
  where project_id = p_project_id and team_space_id = p_team_space_id
  for update;
  if not found or v_row.status <> 'invited' then
    raise exception 'This invite is no longer open' using errcode = 'P0002';
  end if;

  select name into v_actor from users where id = auth.uid();
  select name into v_project from project_spaces where id = p_project_id;
  select name into v_department from team_spaces where id = p_team_space_id;

  if p_accept then
    if p_lead_id is not null and not is_department_member(p_lead_id, p_team_space_id) then
      raise exception '%''s lead must be a member of %.', coalesce(v_department, 'The department'), coalesce(v_department, 'it') using errcode = '23514';
    end if;
    -- null keeps the proposal; people who left the department since drop out
    select coalesce(array_agg(distinct person), '{}') into v_members
    from unnest(coalesce(p_member_ids, v_row.proposed_member_ids)) as person
    where person is not null;
    if exists (select 1 from unnest(v_members) as person where not is_department_member(person, p_team_space_id)) then
      if p_member_ids is not null then
        raise exception 'Everyone picked must be a member of %.', coalesce(v_department, 'the department') using errcode = '23514';
      end if;
      select coalesce(array_agg(person), '{}') into v_members
      from unnest(v_members) as person where is_department_member(person, p_team_space_id);
    end if;

    update project_departments
    set status = 'active', lead_id = p_lead_id, due_date = coalesce(p_due_date, due_date), proposed_member_ids = '{}'
    where project_id = p_project_id and team_space_id = p_team_space_id;
    insert into project_members (project_id, user_id)
    select distinct p_project_id, person
    from unnest(v_members || case when p_lead_id is null then '{}'::uuid[] else array[p_lead_id] end) as person
    on conflict (project_id, user_id) do nothing;
  else
    delete from project_departments where project_id = p_project_id and team_space_id = p_team_space_id;
  end if;

  insert into activity_log (entity_type, entity_id, actor_id, action, new_state)
  values ('project', p_project_id, auth.uid(), case when p_accept then 'department_joined' else 'department_declined' end,
          jsonb_build_object('project_id', p_project_id, 'project_name', v_project,
                             'team_space_id', p_team_space_id, 'department', v_department));
  if v_row.invited_by is distinct from auth.uid() then
    perform notify_user(v_row.invited_by, 'department_invite_reply', 'project', p_project_id,
      coalesce(v_actor, 'Someone') || case when p_accept then ' accepted' else ' declined' end
        || ' the invite for ' || coalesce(v_department, 'their department')
        || ' to work on "' || coalesce(v_project, 'a project') || '"');
  end if;
end;
$$;

revoke execute on function public.respond_to_department_invite(uuid, uuid, boolean, uuid, date, uuid[]) from public, anon;
grant execute on function public.respond_to_department_invite(uuid, uuid, boolean, uuid, date, uuid[]) to authenticated;

-- ─── 8. The invites list carries the proposal ───────────────────────────────
drop function if exists public.my_department_invites();

create or replace function public.my_department_invites()
returns table (
  project_id uuid, project_name text, project_due_date date, lead_team_space_id uuid, lead_department_name text,
  team_space_id uuid, department_name text, due_date date, invited_by_name text, invited_at timestamptz,
  proposed_member_ids uuid[]
)
language sql stable security definer set search_path to 'public'
as $$
  select ps.id, ps.name::text, ps.due_date, ps.team_space_id, lead.name::text,
         pd.team_space_id, t.name::text, pd.due_date, u.name::text, pd.invited_at,
         pd.proposed_member_ids
  from project_departments pd
  join project_spaces ps on ps.id = pd.project_id
  join team_spaces t on t.id = pd.team_space_id
  left join team_spaces lead on lead.id = ps.team_space_id
  left join users u on u.id = pd.invited_by
  where pd.status = 'invited'
    and t.organization_id = current_org_id()
    and has_permission('project.manage', pd.team_space_id)
    and mfa_satisfied()
  order by pd.invited_at desc;
$$;

revoke execute on function public.my_department_invites() from public, anon;
grant execute on function public.my_department_invites() to authenticated;
