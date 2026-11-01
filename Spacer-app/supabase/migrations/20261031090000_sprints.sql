-- Real sprints for projects: a time box with a goal, planned work, a burndown
-- and a retrospective. Replaces the old Sprint tab, a 15-minute timer kept only
-- in the browser.
-- Rollback: supabase/rollback/20261031090000_sprints_rollback.sql
--
-- Lifecycle: planned -> active -> completed, one active sprint per project.
-- Project managers (can_manage_project: team lead or above in the project's
-- department, or an org admin) plan, start and complete sprints. Everyone with
-- access to the project sees them; anyone who can edit tasks can estimate them.

-- ---------------------------------------------------------------------------
-- Sprints
-- ---------------------------------------------------------------------------

create table public.sprints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.project_spaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  goal text check (goal is null or char_length(goal) <= 500),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'planned' check (status in ('planned', 'active', 'completed')),
  -- Snapshots: what the team committed to at start, and what was done at the end
  committed_points integer,
  committed_tasks integer,
  completed_points integer,
  completed_tasks integer,
  started_at timestamptz,
  completed_at timestamptz,
  -- Retrospective
  retro_went_well text check (retro_went_well is null or char_length(retro_went_well) <= 2000),
  retro_to_improve text check (retro_to_improve is null or char_length(retro_to_improve) <= 2000),
  retro_actions text check (retro_actions is null or char_length(retro_actions) <= 2000),
  created_by uuid default auth.uid() references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sprints_dates_check check (ends_on >= starts_on)
);

create index sprints_project_id_idx on public.sprints (project_id);

create unique index sprints_one_active_per_project on public.sprints (project_id) where status = 'active';

create trigger sprints_set_updated_at before update on public.sprints
  for each row execute function public.set_updated_at();

alter table public.sprints enable row level security;

revoke all on public.sprints from anon;

create policy mfa_required on public.sprints as restrictive for all to authenticated
  using (mfa_satisfied())
  with check (mfa_satisfied());

create policy sprints_select on public.sprints for select to authenticated
  using (has_project_access(project_id));

create policy sprints_insert on public.sprints for insert to authenticated
  with check (can_manage_project(project_id) and status = 'planned');

create policy sprints_update on public.sprints for update to authenticated
  using (can_manage_project(project_id))
  with check (can_manage_project(project_id));

-- Only sprints that never started can be deleted; history stays
create policy sprints_delete on public.sprints for delete to authenticated
  using (can_manage_project(project_id) and status = 'planned');

-- ---------------------------------------------------------------------------
-- Tasks: which sprint, how big, and when it was finished
-- ---------------------------------------------------------------------------

alter table public.tasks
  add column sprint_id uuid references public.sprints(id) on delete set null,
  add column story_points smallint
    check (story_points is null or story_points in (0, 1, 2, 3, 5, 8, 13, 21)),
  add column completed_at timestamptz;

create index tasks_sprint_id_idx on public.tasks (sprint_id) where sprint_id is not null;

-- completed_at follows the status (it drives the burndown), and a task can only
-- join a sprint of its own project that hasn't finished. Only project managers
-- move work in or out of sprints; auth.uid() is null for service-role writes.
create or replace function public.tasks_sprint_rules()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;

  if tg_op = 'UPDATE' and new.sprint_id is not distinct from old.sprint_id
     and new.project_id is not distinct from old.project_id then
    return new;
  end if;

  if new.sprint_id is not null and not exists (
    select 1 from sprints s
    where s.id = new.sprint_id and s.project_id = new.project_id and s.status <> 'completed'
  ) then
    raise exception 'A task can only join an unfinished sprint of its own project' using errcode = '22023';
  end if;

  if auth.uid() is not null
     and (tg_op = 'INSERT' and new.sprint_id is not null
          or tg_op = 'UPDATE' and new.sprint_id is distinct from old.sprint_id)
     and not can_manage_project(new.project_id) then
    raise exception 'Only project managers can plan sprints' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger tasks_sprint_rules before insert or update of status, sprint_id, project_id on public.tasks
  for each row execute function public.tasks_sprint_rules();

-- The activity feed skipped nothing: every task update made an entry, and the
-- feed shows planning-only updates as a bare name. Sprint start/finish now log
-- their own entries, so planning and bookkeeping columns don't.
create or replace function public.tasks_log_activity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_quiet text[] := array['sprint_id', 'story_points', 'completed_at', 'updated_at', 'search_vector'];
begin
  if tg_op = 'INSERT' then
    insert into activity_log (entity_type, entity_id, actor_id, action, prior_state, new_state)
    values ('task', new.id, auth.uid(), 'created', null, to_jsonb(new));
  elsif tg_op = 'UPDATE' and (to_jsonb(new) - v_quiet) is distinct from (to_jsonb(old) - v_quiet) then
    insert into activity_log (entity_type, entity_id, actor_id, action, prior_state, new_state)
    values ('task', new.id, auth.uid(), 'updated', to_jsonb(old), to_jsonb(new));
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Start and complete (one transaction each; run with the caller's own rights)
-- ---------------------------------------------------------------------------

create or replace function public.start_sprint(p_sprint_id uuid)
returns public.sprints
language plpgsql
set search_path to 'public'
as $$
declare
  v_sprint sprints;
begin
  -- Permission first: locking the row needs update rights, which members lack
  select * into v_sprint from sprints where id = p_sprint_id;
  if not found then
    raise exception 'Sprint not found' using errcode = 'P0002';
  end if;
  if not can_manage_project(v_sprint.project_id) then
    raise exception 'Only project managers can start a sprint' using errcode = '42501';
  end if;
  select * into v_sprint from sprints where id = p_sprint_id for update;
  if v_sprint.status <> 'planned' then
    raise exception 'Only a planned sprint can be started' using errcode = '22023';
  end if;
  if exists (select 1 from sprints where project_id = v_sprint.project_id and status = 'active') then
    raise exception 'Complete the active sprint first' using errcode = '22023';
  end if;

  update sprints set
    status = 'active',
    started_at = now(),
    committed_points = (select coalesce(sum(story_points), 0) from tasks where sprint_id = p_sprint_id),
    committed_tasks = (select count(*) from tasks where sprint_id = p_sprint_id)
  where id = p_sprint_id
  returning * into v_sprint;

  insert into activity_log (entity_type, entity_id, actor_id, action, new_state)
  values ('sprint', v_sprint.id, auth.uid(), 'sprint_started', jsonb_build_object(
    'project_id', v_sprint.project_id, 'name', v_sprint.name, 'goal', v_sprint.goal,
    'ends_on', v_sprint.ends_on,
    'committedPoints', v_sprint.committed_points, 'totalTasks', v_sprint.committed_tasks));

  return v_sprint;
end;
$$;

-- Unfinished tasks move to p_carry_over_to (a planned sprint of the same
-- project) or, when null, back to the backlog. Finished ones stay with the
-- sprint as its history.
create or replace function public.complete_sprint(
  p_sprint_id uuid,
  p_carry_over_to uuid default null,
  p_went_well text default null,
  p_to_improve text default null,
  p_actions text default null
)
returns public.sprints
language plpgsql
set search_path to 'public'
as $$
declare
  v_sprint sprints;
  v_done_points integer;
  v_done_tasks integer;
  v_open_tasks integer;
begin
  -- Permission first: locking the row needs update rights, which members lack
  select * into v_sprint from sprints where id = p_sprint_id;
  if not found then
    raise exception 'Sprint not found' using errcode = 'P0002';
  end if;
  if not can_manage_project(v_sprint.project_id) then
    raise exception 'Only project managers can complete a sprint' using errcode = '42501';
  end if;
  select * into v_sprint from sprints where id = p_sprint_id for update;
  if v_sprint.status <> 'active' then
    raise exception 'Only the active sprint can be completed' using errcode = '22023';
  end if;
  if p_carry_over_to is not null and not exists (
    select 1 from sprints
    where id = p_carry_over_to and project_id = v_sprint.project_id and status = 'planned'
  ) then
    raise exception 'Unfinished work can only move to a planned sprint of this project' using errcode = '22023';
  end if;

  select coalesce(sum(story_points) filter (where status = 'done'), 0),
         count(*) filter (where status = 'done'),
         count(*) filter (where status <> 'done')
    into v_done_points, v_done_tasks, v_open_tasks
    from tasks where sprint_id = p_sprint_id;

  update tasks set sprint_id = p_carry_over_to
  where sprint_id = p_sprint_id and status <> 'done';

  update sprints set
    status = 'completed',
    completed_at = now(),
    completed_points = v_done_points,
    completed_tasks = v_done_tasks,
    retro_went_well = nullif(btrim(p_went_well), ''),
    retro_to_improve = nullif(btrim(p_to_improve), ''),
    retro_actions = nullif(btrim(p_actions), '')
  where id = p_sprint_id
  returning * into v_sprint;

  -- completionPercent / completedCount / totalTasks: the feed's existing wording
  insert into activity_log (entity_type, entity_id, actor_id, action, new_state)
  values ('sprint', v_sprint.id, auth.uid(), 'sprint_completed', jsonb_build_object(
    'project_id', v_sprint.project_id, 'name', v_sprint.name,
    'completedCount', v_done_tasks, 'totalTasks', v_done_tasks + v_open_tasks,
    'completionPercent', case when v_done_tasks + v_open_tasks = 0 then 0
                              else round(100.0 * v_done_tasks / (v_done_tasks + v_open_tasks)) end,
    'completedPoints', v_done_points, 'committedPoints', v_sprint.committed_points,
    'carriedOver', v_open_tasks));

  return v_sprint;
end;
$$;

revoke execute on function public.start_sprint(uuid) from public, anon;

revoke execute on function public.complete_sprint(uuid, uuid, text, text, text) from public, anon;

grant execute on function public.start_sprint(uuid) to authenticated;

grant execute on function public.complete_sprint(uuid, uuid, text, text, text) to authenticated;
