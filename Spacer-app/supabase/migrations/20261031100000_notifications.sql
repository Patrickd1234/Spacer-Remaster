-- Notifications: working email webhooks, "added to a project" in the app, and a
-- daily "due soon" email.
-- Rollback: supabase/rollback/20261031100000_notifications_rollback.sql
--
-- 1. Email webhooks were failing (every call answered 401): the dashboard
--    webhooks sent the service-role JWT in the trigger definition, and the
--    functions compared it with SUPABASE_SERVICE_ROLE_KEY, which no longer has
--    that format. They now send a shared secret from Vault in x-webhook-secret,
--    and only fire when there is something to email (the task webhook used to
--    call the function on every task update).
-- 2. Being added to a project now also makes an in-app notification.
-- 3. Once a day (07:00 UTC, 08:00 in Lagos) assignees get one email per open
--    task due today or tomorrow, unless they turned email off in Settings.
--
-- Before this works, store two Vault secrets (SQL editor, once):
--   select vault.create_secret('<random secret>', 'edge_webhook_secret');
--   select vault.create_secret('https://<project ref>.supabase.co', 'project_url');
-- and give the functions the same secret: supabase secrets set WEBHOOK_SECRET=<random secret>
-- Until then the webhooks skip quietly (a warning in the database log); nothing else breaks.

create extension if not exists pg_cron with schema pg_catalog;

-- ---------------------------------------------------------------------------
-- 1. Webhooks to edge functions
-- ---------------------------------------------------------------------------

-- Trigger function: POSTs { type, table, schema, record, old_record } (the
-- dashboard webhook format) to the edge function named in the first argument.
create or replace function public.dispatch_edge_webhook()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'edge_webhook_secret';
  if v_url is null or v_secret is null then
    raise warning 'Webhook to % skipped: add the project_url and edge_webhook_secret Vault secrets', tg_argv[0];
    return null;
  end if;

  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/' || tg_argv[0],
    body := jsonb_build_object(
      'type', tg_op,
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', to_jsonb(new),
      'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) end
    ),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    timeout_milliseconds := 5000
  );
  return null;
end;
$$;

revoke execute on function public.dispatch_edge_webhook() from public, anon, authenticated;

drop trigger if exists "Send_Task_Notification" on public.tasks;
drop trigger if exists "Send_Project_Member_Notification" on public.project_members;
drop trigger if exists send_email on public.notification_queue;

create trigger tasks_email_assignee_on_insert
  after insert on public.tasks
  for each row when (new.assignee_id is not null)
  execute function public.dispatch_edge_webhook('send-notification');

create trigger tasks_email_assignee_on_update
  after update of assignee_id on public.tasks
  for each row when (new.assignee_id is not null and new.assignee_id is distinct from old.assignee_id)
  execute function public.dispatch_edge_webhook('send-notification');

create trigger project_members_email_on_insert
  after insert on public.project_members
  for each row execute function public.dispatch_edge_webhook('send-notification');

create trigger notification_queue_send_email
  after insert on public.notification_queue
  for each row execute function public.dispatch_edge_webhook('send_email');

-- ---------------------------------------------------------------------------
-- 2. In-app: added to a project
-- ---------------------------------------------------------------------------

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('assignment', 'mention', 'status_change', 'project_added'));
alter table public.notifications drop constraint notifications_reference_type_check;
alter table public.notifications add constraint notifications_reference_type_check
  check (reference_type in ('task', 'comment', 'announcement', 'project'));

create or replace function public.project_members_notify()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_actor_name text;
  v_project_name text;
begin
  -- Joining a project yourself isn't news
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

create trigger project_members_notify_trigger
  after insert on public.project_members
  for each row execute function public.project_members_notify();

-- ---------------------------------------------------------------------------
-- 3. Daily "due soon" email
-- ---------------------------------------------------------------------------

-- One email per task and due date; moving the due date allows a new one
create table public.task_due_reminders (
  task_id uuid not null references public.tasks(id) on delete cascade,
  due_date date not null,
  sent_at timestamptz not null default now(),
  primary key (task_id, due_date)
);

alter table public.task_due_reminders enable row level security;
revoke all on public.task_due_reminders from anon, authenticated;

-- Email preferences live in the user's metadata (Settings → Notifications);
-- missing means on. Returns how many emails were queued.
create or replace function public.queue_due_soon_reminders()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_count integer;
begin
  with due as (
    select t.id, t.title, t.due_date, t.project_id, t.organization_id, u.email, p.name as project_name
    from tasks t
    join users u on u.id = t.assignee_id
    join auth.users au on au.id = t.assignee_id
    left join project_spaces p on p.id = t.project_id
    where t.status <> 'done'
      and t.due_date between current_date and current_date + 1
      and u.email is not null
      and coalesce(au.raw_user_meta_data #>> '{preferences,notifications,emailAlerts}', 'true') <> 'false'
      and coalesce(au.raw_user_meta_data #>> '{preferences,notifications,taskAssigned}', 'true') <> 'false'
      and not exists (select 1 from task_due_reminders r where r.task_id = t.id and r.due_date = t.due_date)
  ),
  remembered as (
    insert into task_due_reminders (task_id, due_date)
    select id, due_date from due
    returning task_id
  )
  insert into notification_queue (organization_id, recipient_email, notification, payload)
  select d.organization_id, d.email, 'deadline_incoming', jsonb_build_object(
    'task_name', d.title,
    'project_name', d.project_name,
    'task_id', d.id,
    'project_id', d.project_id,
    'due_label', case when d.due_date = current_date then 'today' else 'tomorrow' end,
    'due_date', to_char(d.due_date, 'FMDay, FMMonth FMDD'))
  from due d
  join remembered r on r.task_id = d.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.queue_due_soon_reminders() from public, anon, authenticated;

select cron.unschedule('due-soon-reminders') where exists (select 1 from cron.job where jobname = 'due-soon-reminders');
select cron.schedule('due-soon-reminders', '0 7 * * *', 'select public.queue_due_soon_reminders()');
