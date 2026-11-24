-- Undo 20261124090000_pin_org_roles_to_org.sql: put back the definitions from
-- 20261112100000_rbac_foundation.sql, 20261017090000_enable_rls_group2.sql and
-- 20261112110000_rbac_rules.sql. This reopens the hole that migration
-- describes; use only if the migration itself breaks something.

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
    and (r.scope = 'organization' or team_space_org(m.team_space_id) = current_org_id());
$$;

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
        or role = 'super_admin'
      )
  );
$$;

alter policy memberships_insert on public.memberships
  with check (has_org_permission('member.assign_role', membership_org(team_space_id, user_id)));

alter policy memberships_update on public.memberships
  using (has_org_permission('member.assign_role', membership_org(team_space_id, user_id)))
  with check (has_org_permission('member.assign_role', membership_org(team_space_id, user_id)));
