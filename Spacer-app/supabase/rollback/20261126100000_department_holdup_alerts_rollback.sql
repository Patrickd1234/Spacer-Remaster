-- Undo 20261126100000_department_holdup_alerts.sql: no more automatic hold-up
-- alerts. The department_holdup notification type stays allowed so existing
-- notifications keep working.

select cron.unschedule('department-holdups') where exists (select 1 from cron.job where jobname = 'department-holdups');
drop function if exists public.notify_department_holdups();
drop table if exists public.task_holdup_alerts;
