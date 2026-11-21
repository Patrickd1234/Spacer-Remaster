-- Undo 20261119090000_meetings.sql
-- Invited meetings, their guest lists and agendas are DELETED (they would
-- otherwise become visible to the whole organization). Company events stay.
-- Meeting-invite notifications are deleted too.

drop trigger if exists calendar_event_attendees_notify_trigger on public.calendar_event_attendees;
drop function if exists public.calendar_event_attendees_notify();

delete from public.notifications where type = 'meeting_invite' or reference_type = 'event';
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('assignment', 'mention', 'status_change', 'project_added'));
alter table public.notifications drop constraint notifications_reference_type_check;
alter table public.notifications add constraint notifications_reference_type_check
  check (reference_type in ('task', 'comment', 'announcement', 'project'));

alter policy calendar_events_select on public.calendar_events to public
  using (organization_id = current_org_id());

alter policy calendar_events_insert on public.calendar_events to public
  with check (organization_id = current_org_id() and has_permission('event.manage'));

alter policy calendar_events_update on public.calendar_events
  using (organization_id = current_org_id() and (has_permission('event.manage') or created_by = auth.uid()))
  with check (organization_id = current_org_id() and (has_permission('event.manage') or created_by = auth.uid()));

alter policy calendar_events_delete on public.calendar_events
  using (organization_id = current_org_id() and (has_permission('event.manage') or created_by = auth.uid()));

drop table if exists public.calendar_event_attendees;
drop function if exists public.can_manage_calendar_event(uuid);
drop function if exists public.can_see_calendar_event(uuid);
drop function if exists public.is_event_attendee(uuid);

delete from public.calendar_events where audience = 'invited';
drop index if exists public.calendar_events_org_repeat_idx;
alter table public.calendar_events
  drop column if exists repeat,
  drop column if exists agenda,
  drop column if exists audience;
drop function if exists public.is_valid_meeting_agenda(jsonb);
