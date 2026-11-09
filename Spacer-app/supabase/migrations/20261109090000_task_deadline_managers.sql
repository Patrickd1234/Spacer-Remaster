-- Only super admins, admins and project managers change a task's deadline.
-- tasks_update lets anyone who can edit the project update a task, so without
-- this a department member or project member could move any deadline.
-- Rollback: supabase/rollback/20261109090000_task_deadline_managers_rollback.sql
--
-- Project tasks: can_manage_project (team lead or above in the project's
-- department, or an admin/super admin of its organization). Tasks with no
-- project: an admin of the task's organization. The check uses the task as it
-- was, so moving a task into another project can't skip it. Setting a deadline
-- when creating a task is unchanged. auth.uid() is null for service-role and
-- SQL editor writes, which are let through.

create or replace function public.tasks_guard_due_date()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if auth.uid() is not null
     and new.due_date is distinct from old.due_date
     and not (
       case
         when old.project_id is not null then can_manage_project(old.project_id)
         else is_admin_of_org(old.organization_id)
       end
     ) then
    raise exception 'Only project managers and admins can change a task''s deadline'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_guard_due_date on public.tasks;
create trigger tasks_guard_due_date before update of due_date on public.tasks
  for each row execute function public.tasks_guard_due_date();
