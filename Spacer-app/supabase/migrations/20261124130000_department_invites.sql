-- Invite departments to a project (Collab rework, step 2).
-- Rollback: supabase/rollback/20261124130000_department_invites_rollback.sql
--
-- Until now a department could only be added to a project by someone who could
-- create projects there too, so in practice only organization admins could
-- make Collab projects. Now a project manager can invite any department of the
-- organization. The invited department's managers (project.manage there) get a
-- notification and accept, picking who leads their part, or decline.
--
-- While invited, a department gets nothing: no access to the project, its
-- members aren't shown to the project's other departments, and no task can be
-- put in it. A department where the inviter can create projects themselves
-- joins at once, as before.
--
-- 1. project_departments: status 'invited', invited_by, invited_at
-- 2. organization_departments(): every department's name, for the pickers
--    (team_spaces only shows a team lead the departments they belong to)
-- 3. Access helpers ignore invited rows
-- 4. Guard: what an invited row may hold and who may move it on
-- 5. Insert policy: invites need no rights in the invited department
-- 6. Notifications and the log for invites, accepts and declines
-- 7. my_department_invites(), respond_to_department_invite()
-- 8. create_project() invites the departments the creator can't create in

-- ─── 1. Columns ─────────────────────────────────────────────────────────────
alter table public.project_departments
  add column if not exists invited_by uuid references public.users(id) on delete set null,
  add column if not exists invited_at timestamptz;

alter table public.project_departments drop constraint if exists project_departments_status_check;
alter table public.project_departments
  add constraint project_departments_status_check check (status in ('invited', 'active', 'signed_off'));

-- ─── 2. Department names for the pickers ───────────────────────────────────
create or replace function public.organization_departments()
returns table (id uuid, name text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select t.id, t.name::text
  from team_spaces t
  where t.organization_id = current_org_id()
    and mfa_satisfied()
  order by t.name;
$$;

revoke execute on function public.organization_departments() from public, anon;
grant execute on function public.organization_departments() to authenticated;

-- ─── 3. Access helpers: an invited department has no part in the project ──
create or replace function public.extra_department_has_permission(p_project_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path to public, pg_temp
as $$
  select exists (
    select 1 from project_departments pd
    where pd.project_id = p_project_id and pd.status <> 'invited'
      and has_permission(p_permission, pd.team_space_id)
  );
$$;

create or replace function public.shares_project_with_department(p_team_space_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1
    from project_departments theirs
    join project_departments mine on mine.project_id = theirs.project_id
    where theirs.team_space_id = p_team_space_id
      and theirs.status <> 'invited' and mine.status <> 'invited'
      and has_permission('department.view', mine.team_space_id)
  );
$$;

create or replace function public.leads_project_department(p_project_id uuid, p_team_space_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select has_permission('project.manage', p_team_space_id)
      or exists (
        select 1 from project_departments
        where project_id = p_project_id and team_space_id = p_team_space_id
          and status <> 'invited' and lead_id = auth.uid()
      );
$$;

create or replace function public.project_has_department(p_project_id uuid, p_team_space_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (select 1 from project_spaces where id = p_project_id and team_space_id = p_team_space_id)
      or exists (select 1 from project_departments
                 where project_id = p_project_id and team_space_id = p_team_space_id and status <> 'invited');
$$;

-- ─── 4. Guard ───────────────────────────────────────────────────────────────
-- An invite is (re)written as status 'invited', no lead, never the lead
-- department. Leaving 'invited' goes to 'active' only, by someone who manages
-- projects in the invited department, who may then set its lead and due date.
create or replace function public.project_departments_guard()
returns trigger language plpgsql set search_path to 'public'
as $$
declare
  v_project_due date;
  v_lead_team uuid;
  v_is_accepting boolean := tg_op = 'UPDATE' and old.status = 'invited' and new.status <> 'invited';
begin
  select due_date, team_space_id into v_project_due, v_lead_team from project_spaces where id = new.project_id;
  if new.is_lead_department and new.team_space_id is distinct from v_lead_team then
    raise exception 'The lead department must be the project''s own department' using errcode = '23514';
  end if;

  if new.status = 'invited' then
    if new.is_lead_department then
      raise exception 'The lead department can''t be invited' using errcode = '23514';
    end if;
    if tg_op = 'UPDATE' and old.status <> 'invited' then
      raise exception 'A department that joined can''t go back to invited' using errcode = '23514';
    end if;
    if new.lead_id is not null then
      raise exception 'An invited department''s lead is picked when it accepts' using errcode = '23514';
    end if;
    if tg_op = 'INSERT' then
      new.invited_by := auth.uid();
      new.invited_at := now();
    else
      new.invited_by := old.invited_by;
      new.invited_at := old.invited_at;
    end if;
  end if;

  if v_is_accepting then
    if new.status <> 'active' then
      raise exception 'An invited department joins as active' using errcode = '23514';
    end if;
    if auth.uid() is not null and not has_permission('project.manage', new.team_space_id) then
      raise exception 'Only the invited department''s leads can accept the invite' using errcode = '42501';
    end if;
    if (new.is_lead_department, new.team_space_id, new.project_id) is distinct from (old.is_lead_department, old.team_space_id, old.project_id) then
      raise exception 'Accepting an invite can only set the lead and due date' using errcode = '23514';
    end if;
  end if;

  -- Checked only when the date is set, so a later, earlier project deadline
  -- doesn't stop a lead signing off
  if (tg_op = 'INSERT' or new.due_date is distinct from old.due_date)
     and new.due_date is not null and v_project_due is not null and new.due_date > v_project_due then
    raise exception 'A department can''t be due after the project''s overall deadline' using errcode = '23514';
  end if;
  -- A department's lead must belong to that department
  if new.lead_id is not null and (tg_op = 'INSERT' or new.lead_id is distinct from old.lead_id)
     and auth.uid() is not null
     and not is_department_member(new.lead_id, new.team_space_id) then
    raise exception 'A department''s lead must be a member of that department' using errcode = '23514';
  end if;
  -- A department's lead (not a project manager) may only sign the part off or undo that
  if tg_op = 'UPDATE' and not v_is_accepting and auth.uid() is not null and not can_manage_project(new.project_id)
     and (new.lead_id, new.due_date, new.is_lead_department, new.team_space_id, new.project_id)
         is distinct from (old.lead_id, old.due_date, old.is_lead_department, old.team_space_id, old.project_id) then
    raise exception 'Only project managers can change a department''s lead or due date' using errcode = '42501';
  end if;
  if new.status = 'signed_off' and (tg_op = 'INSERT' or old.status is distinct from 'signed_off') then
    new.signed_off_at := now();
  elsif new.status in ('active', 'invited') then
    new.signed_off_at := null;
  end if;
  return new;
end;
$$;

-- ─── 5. Insert policy ───────────────────────────────────────────────────────
-- A project manager adds a department of the same organization: at once where
-- they could create projects themselves, otherwise as an invite
alter policy project_departments_insert on public.project_departments
  with check (
    can_manage_project(project_id)
    and team_space_org(team_space_id) = (
      select team_space_org(ps.team_space_id) from project_spaces ps where ps.id = project_departments.project_id
    )
    and (has_permission('project.create', team_space_id)
         or (status = 'invited' and lead_id is null and not is_lead_department))
  );

-- ─── 6. Notifications and the log ───────────────────────────────────────────
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('assignment', 'mention', 'status_change', 'project_added',
                  'task_blocked', 'task_unblocked', 'department_nudge',
                  'meeting_invite', 'comment', 'department_invite', 'department_invite_reply'));

-- Who answers a department's invites: those holding project.manage through a
-- role on that department; when nobody does, the organization's admins
create or replace function public.department_invite_recipients(p_team_space_id uuid)
returns setof uuid
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  v_org uuid := team_space_org(p_team_space_id);
begin
  return query
    select distinct m.user_id
    from memberships m
    join rbac_role_permissions rp on rp.role_key = membership_role_key(m.team_space_id, m.role)
    where m.team_space_id = p_team_space_id and rp.permission_key = 'project.manage';
  if found then return; end if;
  return query
    select distinct m.user_id
    from memberships m
    join users u on u.id = m.user_id
    join rbac_roles r on r.key = membership_role_key(m.team_space_id, m.role) and r.scope = 'organization'
    join rbac_role_permissions rp on rp.role_key = r.key and rp.permission_key = 'project.manage'
    where u.organization_id = v_org
      and (m.team_space_id is null or team_space_org(m.team_space_id) = v_org);
end;
$$;

revoke execute on function public.department_invite_recipients(uuid) from public, anon, authenticated;

-- A new invite: tell the department and log it on the project
create or replace function public.project_departments_invite_notify()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare
  v_actor text;
  v_project text;
  v_department text;
  v_person uuid;
begin
  if new.status <> 'invited' then return new; end if;
  select name into v_actor from users where id = auth.uid();
  select name into v_project from project_spaces where id = new.project_id;
  select name into v_department from team_spaces where id = new.team_space_id;
  for v_person in select * from department_invite_recipients(new.team_space_id) loop
    if v_person is distinct from auth.uid() then
      perform notify_user(v_person, 'department_invite', 'project', new.project_id,
        coalesce(v_actor, 'Someone') || ' invited ' || coalesce(v_department, 'your department')
          || ' to work on "' || coalesce(v_project, 'a project') || '"');
    end if;
  end loop;
  insert into activity_log (entity_type, entity_id, actor_id, action, new_state)
  values ('project', new.project_id, auth.uid(), 'department_invited',
          jsonb_build_object('project_id', new.project_id, 'project_name', v_project,
                             'team_space_id', new.team_space_id, 'department', v_department));
  return new;
end;
$$;

drop trigger if exists project_departments_invite_notify on public.project_departments;
create trigger project_departments_invite_notify after insert on public.project_departments
  for each row execute function public.project_departments_invite_notify();

-- ─── 7. Answering invites ───────────────────────────────────────────────────
-- Invites the caller can answer: departments where they hold project.manage
create or replace function public.my_department_invites()
returns table (
  project_id uuid, project_name text, project_due_date date, lead_team_space_id uuid, lead_department_name text,
  team_space_id uuid, department_name text, due_date date, invited_by_name text, invited_at timestamptz
)
language sql stable security definer set search_path to 'public'
as $$
  select ps.id, ps.name::text, ps.due_date, ps.team_space_id, lead.name::text,
         pd.team_space_id, t.name::text, pd.due_date, u.name::text, pd.invited_at
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

-- Accept (with the department's lead, and optionally another due date on or
-- before the project's deadline) or decline. Declining removes the invite.
create or replace function public.respond_to_department_invite(
  p_project_id uuid,
  p_team_space_id uuid,
  p_accept boolean,
  p_lead_id uuid default null,
  p_due_date date default null
)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare
  v_row project_departments;
  v_actor text;
  v_project text;
  v_department text;
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
    update project_departments
    set status = 'active', lead_id = p_lead_id, due_date = coalesce(p_due_date, due_date)
    where project_id = p_project_id and team_space_id = p_team_space_id;
    if p_lead_id is not null then
      insert into project_members (project_id, user_id) values (p_project_id, p_lead_id)
      on conflict (project_id, user_id) do nothing;
    end if;
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

revoke execute on function public.respond_to_department_invite(uuid, uuid, boolean, uuid, date) from public, anon;
grant execute on function public.respond_to_department_invite(uuid, uuid, boolean, uuid, date) to authenticated;

-- ─── 8. create_project(): invite where the creator can't create ─────────────
-- Same as 20261124120000_create_project, except: a department other than the
-- lead one where the creator lacks project.create is invited (no lead, its due
-- date proposed), and the result is { project, invited_department_ids }.
create or replace function public.create_project(
  p_name text,
  p_due_date date,
  p_project_lead uuid,
  p_departments jsonb
)
returns jsonb
language plpgsql
set search_path to public, pg_temp
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
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
    v_seen := v_seen || v_team;
  end loop;

  -- team_lead is written even when null: the column's default is a random uuid
  insert into project_spaces (team_space_id, name, team_lead, due_date)
  values (v_lead_team, v_name, p_project_lead, p_due_date)
  returning * into v_project;

  for v_dept in select value from jsonb_array_elements(p_departments) loop
    v_team := (v_dept ->> 'team_space_id')::uuid;
    v_dept_lead := nullif(v_dept ->> 'lead_id', '')::uuid;
    v_is_direct := v_index = 0 or has_permission('project.create', v_team);
    insert into project_departments (project_id, team_space_id, lead_id, due_date, is_lead_department, status)
    values (
      v_project.id, v_team,
      case when v_is_direct then v_dept_lead end,
      coalesce(nullif(v_dept ->> 'due_date', '')::date, p_due_date),
      v_index = 0,
      case when v_is_direct then 'active' else 'invited' end
    );
    if v_is_direct and v_dept_lead is not null then v_people := v_people || v_dept_lead; end if;
    if not v_is_direct then v_invited := v_invited || v_team; end if;
    v_index := v_index + 1;
  end loop;

  -- The project lead and the joined departments' leads join the project (the
  -- project_members triggers send their "added to a project" notice and email)
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

revoke execute on function public.create_project(text, date, uuid, jsonb) from public, anon;
grant execute on function public.create_project(text, date, uuid, jsonb) to authenticated;
