-- Role-based access control, step 1: the permission data and the one function
-- that answers "may the caller do X here?".
-- Rollback: supabase/rollback/20261112100000_rbac_foundation_rollback.sql
--
-- Nothing uses this yet. Every policy and helper (is_org_admin,
-- team_role_at_least, can_manage_project, ...) still decides access exactly as
-- before; a later migration moves them onto has_permission() one group at a
-- time, after supabase/checks/rbac_parity.sql shows both give the same answers.
--
-- Until now a role was a rank (viewer < member < team_lead < admin <
-- super_admin) and each rule asked "at least a team lead?". Here a role is a
-- named set of permissions:
--
--   rbac_roles             the six roles and whether each covers the whole
--                          organization or one department
--   rbac_permissions       everything that can be allowed
--   rbac_role_permissions  which role allows what
--
-- Who holds which role stays in memberships. Its rows read as:
--
--   role 'super_admin', any department      -> owner             (organization)
--   role 'admin', no department             -> org_admin         (organization)
--   role 'admin', a department              -> department_admin  (that department)
--   role 'team_lead' / 'member' / 'viewer'  -> the same          (that department)
--
-- The roles are fixed for now (changed only by a migration). The tables are
-- shaped so per-organization custom roles can be added later.

create table public.rbac_roles (
  key text primary key,
  name text not null,
  scope text not null check (scope in ('organization', 'department')),
  -- display order, most powerful first; never used to decide access
  sort_order integer not null,
  description text not null
);

create table public.rbac_permissions (
  key text primary key,
  -- 'department': asked about one department. 'organization': asked about the organization.
  scope text not null check (scope in ('organization', 'department')),
  description text not null
);

create table public.rbac_role_permissions (
  role_key text not null references public.rbac_roles(key) on delete cascade,
  permission_key text not null references public.rbac_permissions(key) on delete cascade,
  primary key (role_key, permission_key)
);

-- Readable by signed-in users (the app shows what a role allows); written
-- only by migrations.
alter table public.rbac_roles enable row level security;
alter table public.rbac_permissions enable row level security;
alter table public.rbac_role_permissions enable row level security;

create policy rbac_roles_select on public.rbac_roles for select to authenticated using (true);
create policy rbac_permissions_select on public.rbac_permissions for select to authenticated using (true);
create policy rbac_role_permissions_select on public.rbac_role_permissions for select to authenticated using (true);

revoke all on public.rbac_roles, public.rbac_permissions, public.rbac_role_permissions from anon, authenticated;
grant select on public.rbac_roles, public.rbac_permissions, public.rbac_role_permissions to authenticated;

insert into public.rbac_roles (key, name, scope, sort_order, description) values
  ('owner',            'Owner',              'organization', 1, 'Everything in the organization.'),
  ('org_admin',        'Organization Admin', 'organization', 2, 'Everything in the organization.'),
  ('department_admin', 'Department Admin',   'department',   3, 'Runs one department: its people, projects and channels.'),
  ('team_lead',        'Team Lead',          'department',   4, 'Creates and manages the department''s projects.'),
  ('member',           'Member',             'department',   5, 'Works on the department''s projects and tasks.'),
  ('viewer',           'Viewer',             'department',   6, 'Sees the department''s projects without changing them.');

insert into public.rbac_permissions (key, scope, description) values
  ('department.view',      'department', 'See the department, its people and its channels'),
  ('project.view',         'department', 'See the department''s projects, tasks and files'),
  ('project.edit',         'department', 'Create and change tasks, files and comments in the department''s projects'),
  ('project.create',       'department', 'Create projects in the department'),
  ('project.manage',       'department', 'Change a project''s settings, members, deadlines and sprints'),
  ('project.delete',       'department', 'Delete the department''s projects'),
  ('milestone.manage',     'department', 'Create and change project milestones'),
  ('chat.manage',          'department', 'Create, change and delete the department''s channels'),
  ('feed.post',            'department', 'Post to the organization feed for the department'),
  ('member.remove',        'department', 'Remove people from the department'),
  ('member.add',           'department', 'Add or invite people to the department'),
  ('invitation.view',      'department', 'See the department''s pending invitations'),
  ('organization.update',  'organization', 'Rename the organization and change its settings'),
  ('department.create',    'organization', 'Create departments'),
  ('department.update',    'organization', 'Rename and describe departments'),
  ('department.delete',    'organization', 'Delete departments'),
  ('member.assign_role',   'organization', 'Give people roles and change them'),
  ('member.invite',        'organization', 'Invite people to the organization and see its invites'),
  ('member.remove_from_organization', 'organization', 'Remove people from the organization for good'),
  ('announcement.manage',  'organization', 'Post, change and delete announcements'),
  ('event.manage',         'organization', 'Add, change and delete company calendar events'),
  ('task.delete_unfiled',  'organization', 'Delete tasks that belong to no project'),
  ('directory.manage',     'organization', 'Set who reports to whom');

-- Department roles, each listed in full (no role inherits from another)
insert into public.rbac_role_permissions (role_key, permission_key)
select r.role_key, p.permission_key
from (values
  ('viewer',           array['department.view', 'project.view']),
  ('member',           array['department.view', 'project.view', 'project.edit']),
  ('team_lead',        array['department.view', 'project.view', 'project.edit', 'project.create', 'project.manage',
                             'project.delete', 'milestone.manage', 'chat.manage', 'feed.post', 'member.remove']),
  ('department_admin', array['department.view', 'project.view', 'project.edit', 'project.create', 'project.manage',
                             'project.delete', 'milestone.manage', 'chat.manage', 'feed.post', 'member.remove',
                             'member.add', 'invitation.view'])
) as r(role_key, permission_keys)
cross join lateral unnest(r.permission_keys) as p(permission_key);

-- The two organization roles allow everything, in every department
insert into public.rbac_role_permissions (role_key, permission_key)
select r.key, p.key
from public.rbac_roles r
cross join public.rbac_permissions p
where r.scope = 'organization';

-- How a memberships row reads as a role (see the table at the top)
create or replace function public.membership_role_key(p_team_space_id uuid, p_role public.membership_role)
returns text
language sql
immutable
set search_path to ''
as $$
  select case
    when p_role = 'super_admin' then 'owner'
    when p_role = 'admin' and p_team_space_id is null then 'org_admin'
    when p_role = 'admin' then 'department_admin'
    else p_role::text
  end;
$$;

-- May the caller do p_permission? For a department permission pass the
-- department. An organization role covers every department of the caller's
-- own organization and no other organization's; a department role covers
-- only its own department, and only while that department is in the caller's
-- organization. (A few old memberships point at another organization's
-- department; has_team_access() and team_role_at_least() honour them,
-- this does not.)
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

-- The same question about an organization: only ever true for the caller's own
create or replace function public.has_org_permission(p_permission text, p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p_org_id is not null and p_org_id = current_org_id() and has_permission(p_permission);
$$;

-- Everything the caller may do, for the app to show the right buttons.
-- team_space_id null = in the whole organization.
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

revoke execute on function public.has_permission(text, uuid) from public, anon;
revoke execute on function public.has_org_permission(text, uuid) from public, anon;
revoke execute on function public.my_permissions() from public, anon;
grant execute on function public.has_permission(text, uuid) to authenticated;
grant execute on function public.has_org_permission(text, uuid) to authenticated;
grant execute on function public.my_permissions() to authenticated;
