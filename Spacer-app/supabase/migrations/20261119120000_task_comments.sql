-- Task comments: the comments table existed (insert and read only) with no
-- screen using it. This lets authors edit and delete their own comments,
-- lets project managers remove comments in their projects, caps the length,
-- records edits, and tells the task's assignee and creator about new comments
-- (mentions already notified the people named).
-- Rollback: supabase/rollback/20261119120000_task_comments_rollback.sql
-- Additive: the table is empty on live (checked 2026-11-19).

alter table public.comments
  add column if not exists edited_at timestamptz,
  add constraint comments_body_length_check check (char_length(btrim(body)) between 1 and 5000);

-- The signed-in user may remove any comment on the task: project managers for
-- project tasks, task.manage_unfiled holders for tasks without a project
create or replace function public.can_moderate_task_comments(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path to public, pg_temp
as $$
  select exists (
    select 1 from tasks t
    where t.id = p_task_id
      and t.organization_id = current_org_id()
      and case when t.project_id is null then has_permission('task.manage_unfiled')
               else can_manage_project(t.project_id) end
  );
$$;

revoke execute on function public.can_moderate_task_comments(uuid) from public, anon;
grant execute on function public.can_moderate_task_comments(uuid) to authenticated;

drop policy if exists comments_update on public.comments;
create policy comments_update on public.comments as permissive for update to authenticated
  using (author_id = auth.uid() and has_task_access(task_id))
  with check (author_id = auth.uid() and has_task_access(task_id));

drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments as permissive for delete to authenticated
  using (author_id = auth.uid() or can_moderate_task_comments(task_id));

-- An edit changes only the text, and is stamped
create or replace function public.comments_before_update()
returns trigger
language plpgsql
set search_path to public, pg_temp
as $$
begin
  new.task_id := old.task_id;
  new.author_id := old.author_id;
  new.created_at := old.created_at;
  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists comments_before_update on public.comments;
create trigger comments_before_update
  before update on public.comments
  for each row execute function public.comments_before_update();

-- Notifications: 'comment' for the task's assignee and creator
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('assignment', 'mention', 'status_change', 'project_added', 'meeting_invite', 'comment'));

create or replace function public.comments_notify()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_actor_name text;
  v_task record;
  v_mentioned uuid[] := '{}';
  v_person record;
  v_user uuid;
begin
  select name into v_actor_name from users where id = auth.uid();
  select title, organization_id, assignee_id, created_by into v_task from tasks where id = new.task_id;

  -- "@Full Name" in the text
  for v_person in
    select u.id from users u
    where u.organization_id = v_task.organization_id
      and u.name is not null and u.name <> ''
      and position('@' || u.name in new.body) > 0
      and u.id is distinct from new.author_id
  loop
    v_mentioned := v_mentioned || v_person.id;
    perform notify_user(v_person.id, 'mention', 'comment', new.id,
      coalesce(v_actor_name, 'Someone') || ' mentioned you on "' || v_task.title || '"');
  end loop;

  -- The assignee and creator hear about every comment (once, and not about their own)
  foreach v_user in array array_remove(array[v_task.assignee_id, v_task.created_by], null) loop
    if v_user is distinct from new.author_id and not (v_user = any (v_mentioned)) then
      v_mentioned := v_mentioned || v_user;
      perform notify_user(v_user, 'comment', 'comment', new.id,
        coalesce(v_actor_name, 'Someone') || ' commented on "' || v_task.title || '"');
    end if;
  end loop;

  return new;
end;
$$;

revoke execute on function public.comments_notify() from public, anon, authenticated;
