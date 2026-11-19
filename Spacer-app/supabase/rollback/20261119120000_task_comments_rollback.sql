-- Undo 20261119120000_task_comments.sql
-- Comments stay; they can no longer be edited or deleted, and comment
-- notifications are removed. comments_notify goes back to mentions only.

delete from public.notifications where type = 'comment';
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('assignment', 'mention', 'status_change', 'project_added', 'meeting_invite'));

create or replace function public.comments_notify()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor_name text;
  v_task_title text;
  v_org_id uuid;
  mentioned record;
begin
  select name into v_actor_name from users where id = auth.uid();
  select title, organization_id into v_task_title, v_org_id from tasks where id = new.task_id;

  for mentioned in
    select u.id, u.name from users u
    where u.organization_id = v_org_id
      and position('@' || u.name in new.body) > 0
      and u.id != new.author_id
  loop
    perform notify_user(mentioned.id, 'mention', 'comment', new.id,
      coalesce(v_actor_name, 'Someone') || ' mentioned you on "' || v_task_title || '"');
  end loop;

  return new;
end;
$$;

drop trigger if exists comments_before_update on public.comments;
drop function if exists public.comments_before_update();
drop policy if exists comments_delete on public.comments;
drop policy if exists comments_update on public.comments;
drop function if exists public.can_moderate_task_comments(uuid);

alter table public.comments
  drop constraint if exists comments_body_length_check,
  drop column if exists edited_at;
