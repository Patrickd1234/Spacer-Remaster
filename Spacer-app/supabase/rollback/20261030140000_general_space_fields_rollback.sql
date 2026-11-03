-- Undo 20261030140000_general_space_fields.sql
-- Drops the new columns and their data (categories, times, profile fields).
-- Files in the general-media bucket must be removed through the Storage API
-- before the bucket can be dropped.

drop policy if exists general_media_select on storage.objects;
drop policy if exists general_media_insert on storage.objects;
drop policy if exists general_media_delete on storage.objects;
delete from storage.buckets where id = 'general-media';

drop function if exists public.set_reports_to(uuid, uuid);

create or replace function public.users_guard_protected_columns()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.id is distinct from old.id
    or new.organization_id is distinct from old.organization_id
    or new.email is distinct from old.email
    or new.auth_provider is distinct from old.auth_provider
  ) then
    raise exception 'Not allowed to change id, organization, email or auth provider';
  end if;
  return new;
end;
$$;

alter table public.users
  drop constraint if exists users_reports_to_not_self_check,
  drop column if exists reports_to,
  drop column if exists avatar_path,
  drop column if exists timezone,
  drop column if exists location,
  drop column if exists job_title;

drop policy if exists calendar_events_update on public.calendar_events;
drop policy if exists calendar_events_delete on public.calendar_events;
drop index if exists public.calendar_events_org_date_idx;
alter table public.calendar_events
  drop constraint if exists calendar_events_title_length_check,
  drop constraint if exists calendar_events_external_url_check,
  drop constraint if exists calendar_events_time_order_check,
  drop column if exists category,
  drop column if exists ends_at,
  drop column if exists starts_at;

drop index if exists public.announcements_org_created_idx;
alter table public.announcements
  drop constraint if exists announcements_title_length_check,
  drop constraint if exists announcements_event_order_check,
  drop column if exists meeting_url,
  drop column if exists event_ends_at,
  drop column if exists event_starts_at,
  drop column if exists cover_path,
  drop column if exists category;
