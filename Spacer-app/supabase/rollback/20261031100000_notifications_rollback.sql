-- Undo 20261031100000_notifications.sql
-- The old dashboard webhooks (Send_Task_Notification, Send_Project_Member_Notification,
-- send_email) are not recreated here: their definitions held the service-role key,
-- which must not be committed, and they were being rejected with 401. Recreate
-- them under Database -> Webhooks if needed.

select cron.unschedule('due-soon-reminders') where exists (select 1 from cron.job where jobname = 'due-soon-reminders');
drop function if exists public.queue_due_soon_reminders();
drop table if exists public.task_due_reminders;

drop trigger if exists project_members_notify_trigger on public.project_members;
drop function if exists public.project_members_notify();
delete from public.notifications where type = 'project_added';
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('assignment', 'mention', 'status_change'));
alter table public.notifications drop constraint notifications_reference_type_check;
alter table public.notifications add constraint notifications_reference_type_check
  check (reference_type in ('task', 'comment', 'announcement'));

drop trigger if exists tasks_email_assignee_on_insert on public.tasks;
drop trigger if exists tasks_email_assignee_on_update on public.tasks;
drop trigger if exists project_members_email_on_insert on public.project_members;
drop trigger if exists notification_queue_send_email on public.notification_queue;
drop function if exists public.dispatch_edge_webhook();

-- pg_cron stays installed; drop it from the dashboard if nothing else uses it.
