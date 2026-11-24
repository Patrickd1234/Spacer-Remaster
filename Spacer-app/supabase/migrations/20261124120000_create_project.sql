-- Create a project in one transaction (Collab rework, step 1).
-- Rollback: supabase/rollback/20261124120000_create_project_rollback.sql
--
-- The Create Project forms used to send four separate requests: the project,
-- its people, its departments, the activity log. When the departments failed,
-- the project stayed behind without even its lead department row, and the
-- departments' leads had already been emailed. A function body runs as one
-- transaction, so any error now undoes every row it wrote (and the emails,
-- which pg_net only sends once the transaction commits).
--
-- Security invoker: every insert still passes the row-level security that
-- applied to the separate requests (project_spaces_insert, project_members_insert,
-- project_departments_insert, activity_log_insert) and the project_departments
-- guard trigger. Nothing new is allowed. The checks below run first only so
-- the person gets a readable message instead of a policy error.
--
-- p_departments: [{ team_space_id, lead_id, due_date }, ...], lead department
-- first. A department with no due date takes the overall deadline. With two or
-- more departments the overall deadline is required. The project lead must be
-- in the lead department.

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
