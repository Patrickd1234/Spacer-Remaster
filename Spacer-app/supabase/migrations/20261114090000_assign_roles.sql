-- Role-based access control, step 5a: assigning roles from the app, and
-- announcements editable only by people who may post them.
-- Rollback: supabase/rollback/20261114090000_assign_roles_rollback.sql
--
-- assign_role(person, department, role)   give someone a role (replaces their role in that department)
-- revoke_role(person, department)         take it away
-- org_member_roles()                      everyone's roles in the caller's organization, for the Directory
--
-- Both writers need member.assign_role in the caller's organization, and the
-- person must be in that organization. What can be assigned: org_admin (no
-- department), department_admin, team_lead, member, viewer. Owner is not
-- assigned here; it changes only by migration until ownership transfer is
-- built. An owner's roles can't be changed by anyone else.
--
-- Refusals carry hint 'rbac' so the app shows them as written.
--
-- The memberships policies still let people with member.assign_role write
-- the table directly, so the "last organization admin" rule is also a
-- trigger: an organization must keep one organization-level role holder
-- while anyone else is in it.

create or replace function public.org_member_roles()
returns table (user_id uuid, team_space_id uuid, team_name text, role text, role_key text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select m.user_id, m.team_space_id, t.name::text, m.role::text, membership_role_key(m.team_space_id, m.role)
  from memberships m
  join users u on u.id = m.user_id
  left join team_spaces t on t.id = m.team_space_id
  where u.organization_id = current_org_id()
    and (m.team_space_id is null or t.organization_id = u.organization_id)
    and mfa_satisfied();
$$;

revoke execute on function public.org_member_roles() from public, anon;
grant execute on function public.org_member_roles() to authenticated;

-- Shared checks: the caller may assign roles here, the person is in the same
-- organization, and the person is not an owner.
create or replace function public.assert_may_change_roles(p_user_id uuid, p_org_id uuid)
returns void
language plpgsql
set search_path to 'public'
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in first.' using errcode = '42501', hint = 'rbac';
  end if;
  if not mfa_satisfied() then
    raise exception 'Enter your authenticator code first.' using errcode = '42501', hint = 'rbac';
  end if;
  if p_org_id is null or not has_org_permission('member.assign_role', p_org_id) then
    raise exception 'Only an organization admin can change roles.' using errcode = '42501', hint = 'rbac';
  end if;
  if exists (select 1 from memberships m where m.user_id = p_user_id and m.role = 'super_admin') then
    raise exception 'The owner''s roles can''t be changed here.' using errcode = '42501', hint = 'rbac';
  end if;
end;
$$;

revoke execute on function public.assert_may_change_roles(uuid, uuid) from public, anon, authenticated;

create or replace function public.assign_role(p_user_id uuid, p_team_space_id uuid, p_role_key text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from users where id = p_user_id;
  if v_org is null or v_org <> current_org_id() then
    raise exception 'That person is not in your organization.' using errcode = 'P0001', hint = 'rbac';
  end if;
  perform assert_may_change_roles(p_user_id, v_org);

  if p_role_key = 'org_admin' then
    if p_team_space_id is not null then
      raise exception 'Organization Admin covers the whole organization, not one department.' using errcode = '22023', hint = 'rbac';
    end if;
    insert into memberships (user_id, team_space_id, role) values (p_user_id, null, 'admin')
    on conflict (user_id) where team_space_id is null do nothing;
    return;
  end if;

  if p_role_key not in ('department_admin', 'team_lead', 'member', 'viewer') then
    raise exception 'Unknown role.' using errcode = '22023', hint = 'rbac';
  end if;
  if p_team_space_id is null
     or not exists (select 1 from team_spaces t where t.id = p_team_space_id and t.organization_id = v_org) then
    raise exception 'Choose a department in your organization.' using errcode = '22023', hint = 'rbac';
  end if;

  insert into memberships (user_id, team_space_id, role)
  values (p_user_id, p_team_space_id, case when p_role_key = 'department_admin' then 'admin' else p_role_key end::membership_role)
  on conflict (user_id, team_space_id) do update set role = excluded.role;
end;
$$;

create or replace function public.revoke_role(p_user_id uuid, p_team_space_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from users where id = p_user_id;
  if v_org is null or v_org <> current_org_id() then
    raise exception 'That person is not in your organization.' using errcode = 'P0001', hint = 'rbac';
  end if;
  perform assert_may_change_roles(p_user_id, v_org);

  -- One exit per organization at a time, like remove_from_organization
  perform 1 from organizations where id = v_org for update;

  if p_team_space_id is null then
    if exists (select 1 from users u where u.organization_id = v_org and u.id <> p_user_id)
       and not exists (
         select 1 from memberships m join users u on u.id = m.user_id
         where u.organization_id = v_org and u.id <> p_user_id
           and membership_role_key(m.team_space_id, m.role) in ('owner', 'org_admin')
       ) then
      raise exception 'They are the only organization admin. Make someone else an organization admin first.'
        using errcode = 'P0001', hint = 'rbac';
    end if;
    delete from memberships where user_id = p_user_id and team_space_id is null;
  else
    delete from memberships m
    using team_spaces t
    where m.user_id = p_user_id and m.team_space_id = p_team_space_id
      and t.id = m.team_space_id and t.organization_id = v_org;
  end if;

  if not found then
    raise exception 'They don''t hold that role.' using errcode = 'P0001', hint = 'rbac';
  end if;
end;
$$;

revoke execute on function public.assign_role(uuid, uuid, text) from public, anon;
revoke execute on function public.revoke_role(uuid, uuid) from public, anon;
grant execute on function public.assign_role(uuid, uuid, text) to authenticated;
grant execute on function public.revoke_role(uuid, uuid) to authenticated;

-- Direct writes from the app (the policies allow them for member.assign_role
-- holders) must keep the same two rules. Not security definer, so
-- current_user is the role doing the write; the functions above run as the
-- owner and are not affected.
create or replace function public.memberships_guard_org_roles()
returns trigger
language plpgsql
set search_path to 'public'
as $$
declare
  v_org uuid;
begin
  if current_user not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;
  if old.role = 'super_admin' and not exists (
       select 1 from memberships m where m.user_id = auth.uid() and m.role = 'super_admin') then
    raise exception 'The owner''s roles can''t be changed here.' using errcode = '42501', hint = 'rbac';
  end if;
  if membership_role_key(old.team_space_id, old.role) in ('owner', 'org_admin')
     and (tg_op = 'DELETE' or membership_role_key(new.team_space_id, new.role) not in ('owner', 'org_admin')) then
    select organization_id into v_org from users where id = old.user_id;
    if exists (select 1 from users u where u.organization_id = v_org and u.id <> old.user_id)
       and not exists (
         select 1 from memberships m join users u on u.id = m.user_id
         where u.organization_id = v_org and u.id <> old.user_id
           and membership_role_key(m.team_space_id, m.role) in ('owner', 'org_admin')
       ) then
      raise exception 'They are the only organization admin. Make someone else an organization admin first.'
        using errcode = 'P0001', hint = 'rbac';
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

create trigger memberships_guard_org_roles
  before update or delete on public.memberships
  for each row execute function public.memberships_guard_org_roles();

-- Announcements: editing and deleting need the same permission as posting.
-- Authors without it (people who lost the permission) can no longer change
-- their old announcements.
alter policy announcements_update on public.announcements
  using (organization_id = current_org_id() and has_permission('announcement.manage'))
  with check (organization_id = current_org_id() and has_permission('announcement.manage'));

alter policy announcements_delete on public.announcements
  using (organization_id = current_org_id() and has_permission('announcement.manage'));
