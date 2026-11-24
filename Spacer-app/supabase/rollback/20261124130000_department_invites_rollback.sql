-- Undo 20261124130000_department_invites.sql: departments can again only be
-- added by someone who could create projects there, and nothing is invited.
-- Open invites are deleted (their departments never had access). The two new
-- notification types stay allowed so existing notifications keep working.
-- Deploy an app version from before step 2 first: this build reads
-- create_project()'s { project, invited_department_ids } result.

drop trigger if exists project_departments_invite_notify on public.project_departments;
drop function if exists public.project_departments_invite_notify();
drop function if exists public.respond_to_department_invite(uuid, uuid, boolean, uuid, date);
drop function if exists public.my_department_invites();
drop function if exists public.department_invite_recipients(uuid);
drop function if exists public.organization_departments();

delete from public.project_departments where status = 'invited';

alter table public.project_departments drop constraint if exists project_departments_status_check;
alter table public.project_departments
  add constraint project_departments_status_check check (status in ('active', 'signed_off'));
alter table public.project_departments
  drop column if exists invited_by,
  drop column if exists invited_at;

-- As in 20261120120000_cross_department_permissions
create or replace function public.extra_department_has_permission(p_project_id uuid, p_permission text)
returns boolean language sql stable security definer set search_path to public, pg_temp
as $$
  select exists (
    select 1 from project_departments pd
    where pd.project_id = p_project_id and has_permission(p_permission, pd.team_space_id)
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
      and has_permission('department.view', mine.team_space_id)
  );
$$;

create or replace function public.leads_project_department(p_project_id uuid, p_team_space_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select has_permission('project.manage', p_team_space_id)
      or exists (
        select 1 from project_departments
        where project_id = p_project_id and team_space_id = p_team_space_id and lead_id = auth.uid()
      );
$$;

alter policy project_departments_insert on public.project_departments
  with check (
    can_manage_project(project_id)
    and team_space_org(team_space_id) = (
      select team_space_org(ps.team_space_id) from project_spaces ps where ps.id = project_departments.project_id
    )
    and has_permission('project.create', team_space_id)
  );

-- As in 20261120100000_cross_department_projects
create or replace function public.project_has_department(p_project_id uuid, p_team_space_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (select 1 from project_spaces where id = p_project_id and team_space_id = p_team_space_id)
      or exists (select 1 from project_departments where project_id = p_project_id and team_space_id = p_team_space_id);
$$;

create or replace function public.project_departments_guard()
returns trigger language plpgsql set search_path to 'public'
as $$
declare
  v_project_due date;
  v_lead_team uuid;
begin
  select due_date, team_space_id into v_project_due, v_lead_team from project_spaces where id = new.project_id;
  if new.is_lead_department and new.team_space_id is distinct from v_lead_team then
    raise exception 'The lead department must be the project''s own department' using errcode = '23514';
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
  if tg_op = 'UPDATE' and auth.uid() is not null and not can_manage_project(new.project_id)
     and (new.lead_id, new.due_date, new.is_lead_department, new.team_space_id, new.project_id)
         is distinct from (old.lead_id, old.due_date, old.is_lead_department, old.team_space_id, old.project_id) then
    raise exception 'Only project managers can change a department''s lead or due date' using errcode = '42501';
  end if;
  if new.status = 'signed_off' and (tg_op = 'INSERT' or old.status is distinct from 'signed_off') then
    new.signed_off_at := now();
  elsif new.status = 'active' then
    new.signed_off_at := null;
  end if;
  return new;
end;
$$;

-- As in 20261124120000_create_project
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
  v_index int := 0;
  v_seen uuid[] := '{}';
  v_people uuid[] := '{}';
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
    if not has_permission('project.create', v_team) then
      raise exception 'You can''t add %: you can only add departments where you can create projects.', v_team_name using errcode = '42501';
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
    v_dept_lead := nullif(v_dept ->> 'lead_id', '')::uuid;
    insert into project_departments (project_id, team_space_id, lead_id, due_date, is_lead_department)
    values (
      v_project.id,
      (v_dept ->> 'team_space_id')::uuid,
      v_dept_lead,
      coalesce(nullif(v_dept ->> 'due_date', '')::date, p_due_date),
      v_index = 0
    );
    if v_dept_lead is not null then v_people := v_people || v_dept_lead; end if;
    v_index := v_index + 1;
  end loop;

  -- The project lead and the department leads join the project (the
  -- project_members triggers send their "added to a project" notice and email)
  if p_project_lead is not null then v_people := v_people || p_project_lead; end if;
  insert into project_members (project_id, user_id)
  select distinct v_project.id, person from unnest(v_people) as person
  on conflict (project_id, user_id) do nothing;

  insert into activity_log (entity_type, entity_id, actor_id, action, new_state)
  values ('project', v_project.id, auth.uid(), 'created',
          jsonb_build_object('project_name', v_project.name, 'team_space_id', v_project.team_space_id));

  return to_jsonb(v_project);
end;
$$;

revoke execute on function public.create_project(text, date, uuid, jsonb) from public, anon;
grant execute on function public.create_project(text, date, uuid, jsonb) to authenticated;
