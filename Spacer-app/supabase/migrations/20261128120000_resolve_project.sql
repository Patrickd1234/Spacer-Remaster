-- The Resolve tab: close a project, reopen it, and log a note (design doc
-- "Project Creation & Cross-Department Workflow", screen 06).
-- Rollback: supabase/rollback/20261128120000_resolve_project_rollback.sql
--
-- * project_spaces.status may be 'closed'; closed_at and closed_by say when
--   and by whom. closed_by has no foreign key on purpose: a second link from
--   project_spaces to users would make the app's users(...) embeds ambiguous
--   once a first one exists (see the project_departments lead fix, 27 Nov).
-- * close_project(): the project's managers close it once every task is done
--   and no department is still invited; or reopen it. Logged.
-- * add_project_note(): anyone who can open the project logs a decision or
--   some context; it shows on the Resolve tab and in Recent Activity.
-- Both are security invoker: the existing policies decide (project_spaces
-- update needs project.manage in the lead department; activity_log insert
-- needs the caller as the actor).

-- ─── 1. Closed projects ─────────────────────────────────────────────────────
alter table public.project_spaces drop constraint if exists project_spaces_status_check;
alter table public.project_spaces
  add constraint project_spaces_status_check check (status in ('active', 'archived', 'closed'));
alter table public.project_spaces add column if not exists closed_at timestamptz;
alter table public.project_spaces add column if not exists closed_by uuid;

-- ─── 2. Close or reopen ─────────────────────────────────────────────────────
create or replace function public.close_project(p_project_id uuid, p_reopen boolean default false)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_project project_spaces;
  v_open int;
  v_invited int;
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if not can_manage_project(p_project_id) then
    raise exception 'Only the project''s managers can close or reopen it' using errcode = '42501';
  end if;
  -- Locked while checking, so closing and a task added at that moment don't cross
  select * into v_project from project_spaces where id = p_project_id for update;
  if v_project.id is null then
    raise exception 'That project no longer exists' using errcode = 'P0002';
  end if;

  if p_reopen then
    if v_project.status <> 'closed' then
      raise exception 'This project isn''t closed' using errcode = '23514';
    end if;
    update project_spaces set status = 'active', closed_at = null, closed_by = null where id = p_project_id;
  else
    if v_project.status = 'closed' then
      raise exception 'This project is already closed' using errcode = '23514';
    end if;
    select count(*) into v_open from tasks where project_id = p_project_id and status <> 'done';
    if v_open > 0 then
      raise exception '% still open. Every task must be done before the project closes.',
        case when v_open = 1 then '1 task is' else v_open || ' tasks are' end using errcode = '23514';
    end if;
    select count(*) into v_invited from project_departments where project_id = p_project_id and status = 'invited';
    if v_invited > 0 then
      raise exception 'A department''s invite is still waiting for an answer. Cancel it or wait for it first.' using errcode = '23514';
    end if;
    update project_spaces set status = 'closed', closed_at = now(), closed_by = auth.uid() where id = p_project_id;
  end if;
  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'Only the project''s managers can close or reopen it' using errcode = '42501';
  end if;

  insert into activity_log (entity_type, entity_id, actor_id, action, new_state)
  values ('project', p_project_id, auth.uid(), case when p_reopen then 'project_reopened' else 'project_closed' end,
          jsonb_build_object('project_id', p_project_id, 'project_name', v_project.name));
end;
$$;

revoke execute on function public.close_project(uuid, boolean) from public, anon;
grant execute on function public.close_project(uuid, boolean) to authenticated;

-- ─── 3. Notes ───────────────────────────────────────────────────────────────
create or replace function public.add_project_note(p_project_id uuid, p_note text)
returns void
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_note text := btrim(coalesce(p_note, ''));
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if v_note = '' then
    raise exception 'Write the note first.' using errcode = '22023';
  end if;
  if char_length(v_note) > 1000 then
    raise exception 'A note can be at most 1000 characters.' using errcode = '22023';
  end if;
  if not has_project_access(p_project_id) then
    raise exception 'Only people on the project can add a note' using errcode = '42501';
  end if;
  select name into v_name from project_spaces where id = p_project_id;
  insert into activity_log (entity_type, entity_id, actor_id, action, new_state)
  values ('project', p_project_id, auth.uid(), 'note_added',
          jsonb_build_object('project_id', p_project_id, 'project_name', v_name, 'note', v_note));
end;
$$;

revoke execute on function public.add_project_note(uuid, text) from public, anon;
grant execute on function public.add_project_note(uuid, text) to authenticated;
