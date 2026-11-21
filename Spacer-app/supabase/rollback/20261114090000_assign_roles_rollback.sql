-- Undo 20261114090000_assign_roles.sql
-- Roles can no longer be assigned from the Directory; announcements go back
-- to being editable by their authors as well. Roles already assigned stay.

alter policy announcements_update on public.announcements
  using (organization_id = current_org_id() and (has_permission('announcement.manage') or author_id = auth.uid()))
  with check (organization_id = current_org_id() and (has_permission('announcement.manage') or author_id = auth.uid()));

alter policy announcements_delete on public.announcements
  using (organization_id = current_org_id() and (has_permission('announcement.manage') or author_id = auth.uid()));

drop trigger if exists memberships_guard_org_roles on public.memberships;
drop function if exists public.memberships_guard_org_roles();
drop function if exists public.revoke_role(uuid, uuid);
drop function if exists public.assign_role(uuid, uuid, text);
drop function if exists public.assert_may_change_roles(uuid, uuid);
drop function if exists public.org_member_roles();
