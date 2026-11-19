-- Meetings: anyone in the organization can schedule a meeting with chosen
-- people and departments, an agenda checklist and a repeat rule.
-- Rollback: supabase/rollback/20261119090000_meetings_rollback.sql
--
-- calendar_events gets an audience:
--   'company' (default, every existing row): company-wide events, seen by the
--             whole organization, added and changed only with event.manage.
--   'invited': meetings anyone may schedule, seen only by the organizer and
--             the attendees (people, or members of an invited department).
-- Additive: existing rows become 'company' with no agenda and no repeat, so
-- they look and behave exactly as before.

-- ---------------------------------------------------------------------------
-- 1. New columns
-- ---------------------------------------------------------------------------

-- Agenda: [{ "text": "Review progress", "done": false }, ...], at most 20 items
create or replace function public.is_valid_meeting_agenda(p_agenda jsonb)
returns boolean
language sql
immutable
set search_path to ''
as $$
  select jsonb_typeof(p_agenda) = 'array'
    and jsonb_array_length(p_agenda) <= 20
    and not exists (
      select 1 from jsonb_array_elements(p_agenda) item
      where jsonb_typeof(item) <> 'object'
         or jsonb_typeof(item -> 'text') is distinct from 'string'
         or jsonb_typeof(item -> 'done') is distinct from 'boolean'
         or char_length(item ->> 'text') not between 1 and 200
    );
$$;

alter table public.calendar_events
  add column if not exists audience text not null default 'company'
    constraint calendar_events_audience_check check (audience in ('company', 'invited')),
  add column if not exists agenda jsonb not null default '[]'::jsonb
    constraint calendar_events_agenda_check check (public.is_valid_meeting_agenda(agenda)),
  add column if not exists repeat text not null default 'none'
    constraint calendar_events_repeat_check check (repeat in ('none', 'daily', 'weekly', 'monthly'));

-- Recurring events are fetched regardless of their first date
create index if not exists calendar_events_org_repeat_idx
  on public.calendar_events (organization_id) where repeat <> 'none';

-- ---------------------------------------------------------------------------
-- 2. Attendees: one row per invited person or department
-- ---------------------------------------------------------------------------

create table if not exists public.calendar_event_attendees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.calendar_events(id) on delete cascade,
  user_id uuid references public.users(id) on delete cascade,
  team_space_id uuid references public.team_spaces(id) on delete cascade,
  added_by uuid references public.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint calendar_event_attendees_one_target check (num_nonnulls(user_id, team_space_id) = 1),
  constraint calendar_event_attendees_user_unique unique (event_id, user_id),
  constraint calendar_event_attendees_team_unique unique (event_id, team_space_id)
);

create index if not exists calendar_event_attendees_user_idx on public.calendar_event_attendees (user_id);
create index if not exists calendar_event_attendees_team_idx on public.calendar_event_attendees (team_space_id);

-- ---------------------------------------------------------------------------
-- 3. Helpers (security definer, so the policies below don't recurse)
-- ---------------------------------------------------------------------------

-- The signed-in user is invited, directly or through a department
create or replace function public.is_event_attendee(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path to public, pg_temp
as $$
  select exists (
    select 1 from calendar_event_attendees a
    where a.event_id = p_event_id
      and (a.user_id = auth.uid()
           or exists (select 1 from memberships m
                      where m.team_space_id = a.team_space_id and m.user_id = auth.uid()))
  );
$$;

-- The signed-in user may see the event: company-wide, organized by them, or invited
create or replace function public.can_see_calendar_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path to public, pg_temp
as $$
  select exists (
    select 1 from calendar_events e
    where e.id = p_event_id
      and e.organization_id = current_org_id()
      and (e.audience = 'company' or e.created_by = auth.uid() or is_event_attendee(e.id))
  );
$$;

-- The signed-in user may change the event's guest list
create or replace function public.can_manage_calendar_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path to public, pg_temp
as $$
  select exists (
    select 1 from calendar_events e
    where e.id = p_event_id
      and e.organization_id = current_org_id()
      and (e.created_by = auth.uid() or (e.audience = 'company' and has_permission('event.manage')))
  );
$$;

revoke execute on function public.is_event_attendee(uuid) from public, anon;
revoke execute on function public.can_see_calendar_event(uuid) from public, anon;
revoke execute on function public.can_manage_calendar_event(uuid) from public, anon;
grant execute on function public.is_event_attendee(uuid) to authenticated;
grant execute on function public.can_see_calendar_event(uuid) to authenticated;
grant execute on function public.can_manage_calendar_event(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Row-level security
-- ---------------------------------------------------------------------------

-- Events: invited meetings are private to the organizer and the attendees.
-- Signed-in users only (these were `to public`; anon never reads events).
alter policy calendar_events_select on public.calendar_events to authenticated
  using (organization_id = current_org_id()
         and (audience = 'company' or created_by = auth.uid() or is_event_attendee(id)));

-- Anyone may schedule a meeting as themselves; company events need event.manage
alter policy calendar_events_insert on public.calendar_events to authenticated
  with check (organization_id = current_org_id()
              and (has_permission('event.manage') or (audience = 'invited' and created_by = auth.uid())));

-- Organizers edit their meetings; event.manage edits company events. A meeting
-- can't be turned into a company event without event.manage.
alter policy calendar_events_update on public.calendar_events
  using (organization_id = current_org_id()
         and (created_by = auth.uid() or (audience = 'company' and has_permission('event.manage'))))
  with check (organization_id = current_org_id()
              and (has_permission('event.manage') or (audience = 'invited' and created_by = auth.uid())));

alter policy calendar_events_delete on public.calendar_events
  using (organization_id = current_org_id()
         and (created_by = auth.uid() or (audience = 'company' and has_permission('event.manage'))));

alter table public.calendar_event_attendees enable row level security;
revoke all on public.calendar_event_attendees from anon;
grant select, insert, delete on public.calendar_event_attendees to authenticated;

create policy mfa_required on public.calendar_event_attendees as restrictive for all to authenticated
  using (mfa_satisfied())
  with check (mfa_satisfied());

create policy calendar_event_attendees_select on public.calendar_event_attendees
  as permissive for select to authenticated
  using (can_see_calendar_event(event_id));

-- Only people and departments of the event's own organization can be invited
create policy calendar_event_attendees_insert on public.calendar_event_attendees
  as permissive for insert to authenticated
  with check (
    can_manage_calendar_event(event_id)
    and added_by = auth.uid()
    and (user_id is null or exists (select 1 from users u where u.id = user_id and u.organization_id = current_org_id()))
    and (team_space_id is null or team_space_org(team_space_id) = current_org_id())
  );

-- The organizer removes guests; anyone may take themselves off the list
create policy calendar_event_attendees_delete on public.calendar_event_attendees
  as permissive for delete to authenticated
  using (can_manage_calendar_event(event_id) or user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. In-app notification when you are invited
-- ---------------------------------------------------------------------------

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('assignment', 'mention', 'status_change', 'project_added', 'meeting_invite'));
alter table public.notifications drop constraint notifications_reference_type_check;
alter table public.notifications add constraint notifications_reference_type_check
  check (reference_type in ('task', 'comment', 'announcement', 'project', 'event'));

create or replace function public.calendar_event_attendees_notify()
returns trigger
language plpgsql
security definer
set search_path to public, pg_temp
as $$
declare
  v_actor_name text;
  v_event calendar_events%rowtype;
  v_body text;
  v_user uuid;
begin
  select * into v_event from calendar_events where id = new.event_id;
  if v_event.id is null then
    return new;
  end if;
  select name into v_actor_name from users where id = auth.uid();
  v_body := coalesce(v_actor_name, 'Someone') || ' invited you to "' || v_event.title || '" on '
    || to_char(v_event.event_date, 'FMDy, FMDD FMMon');

  for v_user in
    select new.user_id where new.user_id is not null
    union
    select m.user_id from memberships m where new.team_space_id is not null and m.team_space_id = new.team_space_id
  loop
    -- Inviting yourself isn't news
    if v_user is distinct from auth.uid() then
      perform notify_user(v_user, 'meeting_invite', 'event', new.event_id, v_body);
    end if;
  end loop;
  return new;
end;
$$;

revoke execute on function public.calendar_event_attendees_notify() from public, anon, authenticated;

drop trigger if exists calendar_event_attendees_notify_trigger on public.calendar_event_attendees;
create trigger calendar_event_attendees_notify_trigger
  after insert on public.calendar_event_attendees
  for each row execute function public.calendar_event_attendees_notify();
