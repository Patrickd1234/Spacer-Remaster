-- Rollback for 20261031090000_sprints.sql
-- Removes sprints and the task columns that belong to them (sprint_id,
-- story_points, completed_at), and restores the activity trigger that logs
-- every task update. Sprint history and story points are lost.

revoke execute on function public.complete_sprint(uuid, uuid, text, text, text) from authenticated;
revoke execute on function public.start_sprint(uuid) from authenticated;
drop function if exists public.complete_sprint(uuid, uuid, text, text, text);
drop function if exists public.start_sprint(uuid);

drop trigger if exists tasks_sprint_rules on public.tasks;
drop function if exists public.tasks_sprint_rules();

create or replace function public.tasks_log_activity()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if tg_op = 'INSERT' then
    insert into activity_log (entity_type, entity_id, actor_id, action, prior_state, new_state)
    values ('task', new.id, auth.uid(), 'created', null, to_jsonb(new));
  elsif tg_op = 'UPDATE' then
    insert into activity_log (entity_type, entity_id, actor_id, action, prior_state, new_state)
    values ('task', new.id, auth.uid(), 'updated', to_jsonb(old), to_jsonb(new));
  end if;
  return new;
end;
$$;

drop index if exists public.tasks_sprint_id_idx;
alter table public.tasks
  drop column if exists sprint_id,
  drop column if exists story_points,
  drop column if exists completed_at;

drop table if exists public.sprints;
