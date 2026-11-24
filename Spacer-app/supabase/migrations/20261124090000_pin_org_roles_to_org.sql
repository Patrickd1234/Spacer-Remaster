-- An owner's membership counts only in its own organization, and nobody can
-- be given a role in a department of an organization they are not in.
-- Rollback: supabase/rollback/20261124090000_pin_org_roles_to_org_rollback.sql
--
-- The hole this closes. A 'super_admin' membership reads as "owner" whatever
-- department it points at (membership_role_key). has_permission(),
-- my_permissions() and is_org_admin() then treated it as owner of the
-- caller's CURRENT organization, without checking that the membership's
-- department was in that organization. And memberships_insert only asked
-- whether the caller may assign roles in the department's organization, not
-- whether the person being added belongs to it. So:
--
--   1. someone launches organization A (anyone can) and owns it
--   2. their second account is invited into organization B as a viewer
--   3. as owner of A they insert (second account, a department of A, 'super_admin')
--   4. the second account is now owner of B: every has_permission() is true there
--
-- Live had no such rows when this was written (checked 2026-11-24: no
-- membership points at a department outside its person's organization), so
-- no data changes here.
--
-- What changes for people: nothing, for every membership that exists today.

-- ---------------------------------------------------------------------------
-- 1. Organization roles count only in the organization they belong to
-- ---------------------------------------------------------------------------

create or replace function public.has_permission(p_permission text, p_team_space_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from memberships m
    join rbac_roles r on r.key = membership_role_key(m.team_space_id, m.role)
    join rbac_role_permissions rp on rp.role_key = r.key
    where m.user_id = auth.uid()
      and rp.permission_key = p_permission
      and (
        (r.scope = 'organization'
          -- the membership itself is in the caller's organization: an
          -- organization-level row (no department) always is, a row on a
          -- department only when that department is
          and (m.team_space_id is null or team_space_org(m.team_space_id) = current_org_id())
          and (p_team_space_id is null or team_space_org(p_team_space_id) = current_org_id()))
        or (r.scope = 'department'
          and m.team_space_id = p_team_space_id
          and team_space_org(m.team_space_id) = current_org_id())
      )
  );
$$;

create or replace function public.my_permissions()
returns table (team_space_id uuid, permission text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select distinct
    case when r.scope = 'organization' then null else m.team_space_id end,
    rp.permission_key
  from memberships m
  join rbac_roles r on r.key = membership_role_key(m.team_space_id, m.role)
  join rbac_role_permissions rp on rp.role_key = r.key
  where m.user_id = auth.uid()
    and mfa_satisfied()
    and (
      (r.scope = 'organization' and m.team_space_id is null)
      or team_space_org(m.team_space_id) = current_org_id()
    );
$$;

-- No policy uses this any more, but is_admin_of_org() does, and
-- is_admin_of_org() is still used by a few policies
create or replace function public.is_org_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from memberships
    where user_id = auth.uid()
      and (
        (team_space_id is null and role in ('admin', 'super_admin'))
        or (role = 'super_admin' and team_space_org(team_space_id) = current_org_id())
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. A membership's department must be in its person's organization
-- ---------------------------------------------------------------------------
-- membership_org(null, user_id) is the person's organization. Edge functions
-- write with the service role and check this themselves; assign_role() checks
-- it too. These policies cover writes made straight from the app.

alter policy memberships_insert on public.memberships
  with check (
    has_org_permission('member.assign_role', membership_org(team_space_id, user_id))
    and membership_org(team_space_id, user_id) = membership_org(null, user_id)
  );

alter policy memberships_update on public.memberships
  using (has_org_permission('member.assign_role', membership_org(team_space_id, user_id)))
  with check (
    has_org_permission('member.assign_role', membership_org(team_space_id, user_id))
    and membership_org(team_space_id, user_id) = membership_org(null, user_id)
  );
