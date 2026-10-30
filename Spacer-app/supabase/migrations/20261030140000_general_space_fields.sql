-- Fields for the General Space screens: Announcements, Company Calendar and
-- the People Directory (Spacers UI Screen Documentation, screens 1-4).
-- Rollback: supabase/rollback/20261030140000_general_space_fields_rollback.sql
--
-- Additive only: new nullable columns or columns with defaults, so existing
-- rows and queries keep working. announcements and calendar_events were empty
-- when this was written, so their new checks hold for every row.

-- ---------------------------------------------------------------------------
-- Announcements: category, cover image, optional event details
-- ---------------------------------------------------------------------------
alter table public.announcements
  add column category text not null default 'company_update'
    constraint announcements_category_check
    check (category in ('company_update', 'policy', 'event', 'people_culture')),
  add column cover_path text,
  add column event_starts_at timestamptz,
  add column event_ends_at timestamptz,
  -- Only https links: rendered as clickable links, so no javascript: or data: URLs
  add column meeting_url text
    constraint announcements_meeting_url_check check (meeting_url ~ '^https://'),
  add constraint announcements_event_order_check
    check (event_ends_at is null or event_starts_at is null or event_ends_at >= event_starts_at),
  add constraint announcements_title_length_check check (char_length(title) between 1 and 200);

create index announcements_org_created_idx on public.announcements (organization_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Calendar events: times, category, edit/delete rights
-- ---------------------------------------------------------------------------
-- event_date stays the day the event is on (existing code reads it); timed
-- events also set starts_at/ends_at.
alter table public.calendar_events
  add column starts_at timestamptz,
  add column ends_at timestamptz,
  add column category text not null default 'meeting'
    constraint calendar_events_category_check
    check (category in ('meeting', 'holiday', 'training', 'social', 'review', 'other')),
  add constraint calendar_events_time_order_check
    check (ends_at is null or starts_at is null or ends_at >= starts_at),
  add constraint calendar_events_external_url_check check (external_url ~ '^https://'),
  add constraint calendar_events_title_length_check check (char_length(title) between 1 and 200);

create index calendar_events_org_date_idx on public.calendar_events (organization_id, event_date);

-- Until now events could be added but never edited or removed
create policy calendar_events_update on public.calendar_events as permissive for update to authenticated
  using (organization_id = current_org_id() and (is_org_admin() or created_by = auth.uid()))
  with check (organization_id = current_org_id() and (is_org_admin() or created_by = auth.uid()));

create policy calendar_events_delete on public.calendar_events as permissive for delete to authenticated
  using (organization_id = current_org_id() and (is_org_admin() or created_by = auth.uid()));

-- ---------------------------------------------------------------------------
-- People profiles: job title, photo, location, time zone, manager
-- ---------------------------------------------------------------------------
alter table public.users
  add column job_title text constraint users_job_title_length_check check (char_length(job_title) <= 100),
  add column location text constraint users_location_length_check check (char_length(location) <= 100),
  add column timezone text constraint users_timezone_length_check check (char_length(timezone) <= 64),
  add column avatar_path text,
  add column reports_to uuid references public.users (id) on delete set null,
  add constraint users_reports_to_not_self_check check (reports_to is distinct from id);

-- Everyone edits their own profile, but only an org admin sets who they report to
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
  if current_user in ('authenticated', 'anon')
     and new.reports_to is distinct from old.reports_to
     and not public.is_org_admin() then
    raise exception 'Only an organization admin can change who someone reports to';
  end if;
  return new;
end;
$$;

-- RLS lets people update only their own row, so admins set managers through this
create or replace function public.set_reports_to(p_user_id uuid, p_manager_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid := current_org_id();
begin
  if v_org is null or not is_org_admin() then
    raise exception 'Only an organization admin can change who someone reports to' using errcode = '42501';
  end if;
  if p_user_id = p_manager_id then
    raise exception 'Someone cannot report to themselves' using errcode = '22023';
  end if;
  if not exists (select 1 from users where id = p_user_id and organization_id = v_org)
     or (p_manager_id is not null and not exists (select 1 from users where id = p_manager_id and organization_id = v_org)) then
    raise exception 'Both people must be in your organization' using errcode = '22023';
  end if;
  -- No loops: the new manager can't already report (directly or not) to this person
  if p_manager_id is not null and exists (
    with recursive chain(id) as (
      select reports_to from users where id = p_manager_id
      union
      select u.reports_to from users u join chain c on u.id = c.id where u.reports_to is not null
    )
    select 1 from chain where id = p_user_id
  ) then
    raise exception 'That would make a reporting loop' using errcode = '22023';
  end if;
  update users set reports_to = p_manager_id where id = p_user_id;
end;
$$;

revoke execute on function public.set_reports_to(uuid, uuid) from public, anon;
grant execute on function public.set_reports_to(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Images: profile photos and announcement covers (private bucket, signed links)
-- Policies say objects.name: inside the users subquery a bare 'name' is users.name
--   avatars/<user id>/<file>         uploaded by that user, seen by their organization
--   announcements/<org id>/<file>    uploaded by org admins, seen by that organization
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('general-media', 'general-media', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy general_media_select on storage.objects as permissive for select to authenticated
  using (
    bucket_id = 'general-media' and (
      (split_part(objects.name, '/', 1) = 'avatars' and exists (
        select 1 from public.users u
        where u.id = public.storage_path_uuid(objects.name, 2)
          and (u.id = auth.uid() or u.organization_id = public.current_org_id())))
      or (split_part(objects.name, '/', 1) = 'announcements'
          and public.storage_path_uuid(objects.name, 2) = public.current_org_id())
    )
  );

create policy general_media_insert on storage.objects as permissive for insert to authenticated
  with check (
    bucket_id = 'general-media' and (
      (split_part(objects.name, '/', 1) = 'avatars' and public.storage_path_uuid(objects.name, 2) = auth.uid())
      or (split_part(objects.name, '/', 1) = 'announcements'
          and public.storage_path_uuid(objects.name, 2) = public.current_org_id()
          and public.is_org_admin())
    )
  );

create policy general_media_delete on storage.objects as permissive for delete to authenticated
  using (
    bucket_id = 'general-media' and (
      (split_part(objects.name, '/', 1) = 'avatars' and public.storage_path_uuid(objects.name, 2) = auth.uid())
      or (split_part(objects.name, '/', 1) = 'announcements'
          and public.storage_path_uuid(objects.name, 2) = public.current_org_id()
          and public.is_org_admin())
    )
  );
