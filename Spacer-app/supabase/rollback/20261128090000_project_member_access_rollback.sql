-- Rollback for 20261128090000_project_member_access.
-- Puts project access back on project.view / project.edit and the earlier
-- create_project(), respond_to_department_invite() and my_department_invites().
-- Members added by the migration's backfill and by the assignee trigger stay
-- (they could open those projects before anyway). The description and the
-- proposals are dropped.

drop trigger if exists tasks_add_assignee_to_project on public.tasks;
drop function if exists public.tasks_add_assignee_to_project();

create or replace function public.has_project_access(p_project_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from project_spaces ps
    where ps.id = p_project_id
      and (has_permission('project.view', ps.team_space_id)
           or is_project_member(ps.id)
           or extra_department_has_permission(ps.id, 'project.view'))
  );
$$;

create or replace function public.can_edit_project(p_project_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from project_spaces ps
    where ps.id = p_project_id
      and (has_permission('project.edit', ps.team_space_id)
           or is_project_member(ps.id)
           or extra_department_has_permission(ps.id, 'project.edit'))
  );
$$;

create or replace function public.has_extra_department_access(p_project_id uuid)
returns boolean language sql stable security definer set search_path to public, pg_temp
as $$
  select extra_department_has_permission(p_project_id, 'project.view');
$$;

drop function if exists public.project_member_is_viewer_only(uuid);

alter policy project_spaces_select on public.project_spaces
  using (has_permission('project.view', team_space_id) or is_project_member(id)
         or extra_department_has_permission(id, 'project.view'));

drop trigger if exists project_members_email_on_insert on public.project_members;
create trigger project_members_email_on_insert
  after insert on public.project_members
  for each row execute function dispatch_edge_webhook('send-notification');

create or replace function public.project_members_notify()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare
  v_actor_name text;
  v_project_name text;
begin
  if new.user_id is null or new.user_id = auth.uid() then
    return new;
  end if;
  select name into v_actor_name from users where id = auth.uid();
  select name into v_project_name from project_spaces where id = new.project_id;
  perform notify_user(new.user_id, 'project_added', 'project', new.project_id,
    coalesce(v_actor_name, 'Someone') || ' added you to "' || coalesce(v_project_name, 'a project') || '"');
  return new;
end;
$$;

-- The earlier functions: re-run their definitions from
-- 20261124130000_department_invites.sql (create_project,
-- respond_to_department_invite, my_department_invites) after dropping these:
drop function if exists public.create_project(text, date, uuid, jsonb, text);
drop function if exists public.respond_to_department_invite(uuid, uuid, boolean, uuid, date, uuid[]);
drop function if exists public.my_department_invites();

alter table public.project_departments drop column if exists proposed_member_ids;
alter table public.project_spaces drop constraint if exists project_spaces_description_length;
alter table public.project_spaces drop column if exists description;
