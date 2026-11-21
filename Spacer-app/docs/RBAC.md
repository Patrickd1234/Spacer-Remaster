# Spacer: Roles and Permissions (RBAC)

**Started:** 12 November 2026
**Scope:** `Spacer-reMastered/Spacer-app` (Supabase project `vrzepdjjjpodztqkfsbh`)

How access is decided in Spacer, how to change it, and where the move to role-based access control stands. Update this file whenever a role, a permission or a rule changes.

---

## 1. Status

| Step | What | State |
|---|---|---|
| 1 | Permission tables and `has_permission()` | Applied to live 12 Nov 2026 (`20261112100000_rbac_foundation`) |
| 2 | Parity check against the old rules | Passed on live: 11,304 answers, no unexpected differences |
| 3 | Every database rule asks `has_permission()` | Applied to live 13 Nov 2026 (`20261112110000_rbac_rules`) |
| 4 | The app asks `can(...)`; edge functions ask the database | App and edge functions converted 13 Nov 2026; edge functions deployed the same day; Reports and notifications scoping still to do |
| 5 | Admins change roles from the Directory; decide who is Owner | Role editor applied to live 17 Nov 2026 (`20261114090000_assign_roles`) and working in the Directory. Ownership transfer not started |

The database enforces access. The app only shows or hides controls, and since step 4 it does so by asking the same permissions (section 4).

## 2. The model

A **permission** is one thing that can be allowed, such as `project.create`. A **role** is a named set of permissions. A person holds roles; a rule asks whether the person has a permission, never which role they hold.

| Table | Holds |
|---|---|
| `rbac_roles` | The six roles, and whether each covers the whole organization or one department |
| `rbac_permissions` | Everything that can be allowed |
| `rbac_role_permissions` | Which role allows what |
| `memberships` | Who holds which role, and in which department (existing table) |

The roles are fixed for now: they change only through a migration. The tables are shaped so per-organization custom roles can be added later.

### Giving people roles

Since step 5, people with `member.assign_role` (Organization Admins and the Owner) change roles from the Directory: open a person, and the drawer shows an Organization Admin switch and a role per department. It calls `assign_role(person, department, role)` and `revoke_role(person, department)`, which check:

- the caller holds `member.assign_role` and the person is in the caller's organization;
- the role is one of `org_admin` (no department), `department_admin`, `team_lead`, `member`, `viewer`;
- the person is not the Owner. Owner changes only by migration until ownership transfer is built;
- an organization keeps at least one Owner or Organization Admin while anyone else is in it.

The last two rules are also a trigger on `memberships` (`memberships_guard_org_roles`), so a direct write from the app can't get around them. Refusals carry hint `rbac` and the app shows them as written.

### Roles

| Role | Covers | Stored in `memberships` as |
|---|---|---|
| Owner | Whole organization | role `super_admin` (any row) |
| Organization Admin | Whole organization | role `admin` with no department |
| Department Admin | One department | role `admin` with a department |
| Team Lead | One department | role `team_lead` |
| Member | One department | role `member` |
| Viewer | One department | role `viewer` |

`membership_role_key(team_space_id, role)` does this translation. Owner and Organization Admin currently allow the same things; telling them apart is part of step 5.

Being added to a single project (`project_members`) is not a role. It lets the person open and edit that one project, whatever their department roles.

### Permissions

Department permissions are asked about one department. Organization roles have every permission in every department of their organization.

| Permission | Viewer | Member | Team Lead | Dept Admin | Org Admin / Owner |
|---|:-:|:-:|:-:|:-:|:-:|
| `department.view` see the department, its people and channels | yes | yes | yes | yes | yes |
| `project.view` see its projects, tasks and files | yes | yes | yes | yes | yes |
| `project.edit` create and change tasks, files, comments | | yes | yes | yes | yes |
| `project.create` | | | yes | yes | yes |
| `project.manage` settings, members, deadlines, sprints | | | yes | yes | yes |
| `project.delete` | | | yes | yes | yes |
| `milestone.manage` | | | yes | yes | yes |
| `chat.manage` create, change, delete channels | | | yes | yes | yes |
| `feed.post` post to the organization feed | | | yes | yes | yes |
| `member.remove` remove people from the department | | | yes | yes | yes |
| `member.add` add or invite people to the department | | | | yes | yes |
| `invitation.view` see the department's pending invitations | | | | yes | yes |

Organization permissions (Organization Admin and Owner only): `organization.update`, `department.create`, `department.update`, `department.delete`, `member.assign_role`, `member.invite`, `member.remove_from_organization`, `announcement.manage`, `event.manage`, `task.manage_unfiled` (named `task.delete_unfiled` until step 3), `directory.manage`.

The live list is always `select * from rbac_permissions` and `select * from rbac_role_permissions`.

## 3. How a rule is checked

```sql
has_permission('project.create', <department id>)   -- a department permission
has_permission('announcement.manage')               -- an organization permission
has_org_permission('member.invite', <organization id>)  -- same, and the organization must be the caller's
```

- An organization role counts in every department of the caller's own organization and in no other organization.
- A department role counts only in its own department, and only while that department is in the caller's organization.
- The functions read `auth.uid()`, so they answer for whoever is signed in. They are `security definer` and not callable by `anon`.

`my_permissions()` returns everything the caller may do as rows of `(team_space_id, permission)`; a null department means the whole organization. The app will use it in step 4.

After step 3 the older helpers are thin wrappers:

| Helper | Now means |
|---|---|
| `has_project_access(project)` | `project.view` in the project's department, or a member of the project |
| `can_edit_project(project)` | `project.edit` in its department, or a member of the project |
| `can_manage_project(project)` | `project.manage` in its department |
| `has_channel_scope_access(project, department)` | the project is open to them, or `department.view` |
| `can_manage_channel_scope(project, department)` | they manage the project, or `chat.manage` |

`is_org_admin()`, `is_admin_of_org()`, `has_team_access()`, `team_role()` and `team_role_at_least()` remain defined because the app and edge functions still call some of them. After step 3 no policy uses them. They go away in step 4.

## 4. In the app

The app loads `my_permissions()` once, with the person's memberships, in `RoleContext.jsx`. Components ask through `useRole()`:

```jsx
const { can, canAnywhere, roleName } = useRole()

can("member.add", departmentId)     // a department permission, in that department
can("announcement.manage")          // an organization permission
canAnywhere("project.create")       // in at least one department (show the button at all)
roleName                            // "Organization Admin", for labels
```

The logic is in `src/permissions.js` (unit tested, no Supabase or React). If the list fails to load, nothing is offered; the database still decides every action.

Rules for new code:

- Never compare role names (`role === "admin"`) to decide what someone may do. Ask `can(...)`.
- For one project, ask the database: `can_manage_project` / `can_edit_project` (the project page already does), because project membership also counts there.
- Edge functions ask as the caller: `callerClient.rpc("has_permission", { p_permission, p_team_space_id })` or `has_org_permission`.

What asks `can(...)` as of step 4:

| Where | Permission |
|---|---|
| Company calendar: add, edit, delete company-wide events | `event.manage` |
| Schedule a meeting (Create menu, personal calendar) | none: anyone in the organization, as organizer. Only the organizer and attendees see it; only the organizer edits or deletes it, and `event.manage` doesn't override that (migration `20261119090000_meetings`) |
| Announcements: create, edit others' | `announcement.manage` |
| Directory: set who someone reports to | `directory.manage` |
| Directory: remove from organization | `member.remove_from_organization` |
| Directory: change someone's roles | `member.assign_role` (and the database checks again) |
| Announcements: edit, pin, delete | `announcement.manage`; being the author is no longer enough (step 5 migration) |
| Department page: Add Member | `member.add` in that department |
| Department page: Remove (from the department) | `member.remove` in that department |
| Department page: Add Department / Delete Department | `department.create` / `department.delete` |
| Create Department window: pick people for it | `member.assign_role` |
| Create menu, sidebar, Create Project window | `project.create` |
| `invite-department-member` (edge) | `member.add` in that department |
| `invite-team-post-launch` (edge) | `member.invite` |
| `delete-workspace-item` (edge) | `project.delete` / `department.delete` |

Still on role flags, on purpose: `isSuperAdmin` and `isAdmin` choose which layout someone gets (organization home or My Space, which sidebar, which department switcher). That is a view, not an access decision.

Still to convert: Reports and the notifications bell scope what they list by role name (`Reports.jsx`, `notifications.js`), as does the Directory's "who do I see" rule (`generalFormat.js`). They read only what the database already lets the person read.

## 5. Changing what a role can do

Write a migration that edits `rbac_role_permissions`. No policy needs touching.

```sql
-- let team leads see their department's pending invitations
insert into rbac_role_permissions (role_key, permission_key) values ('team_lead', 'invitation.view');
```

To add a new permission: insert it into `rbac_permissions`, grant it to the right roles (organization roles should get every permission), use it in the policy or function, and add it to the table in section 2.

## 6. What steps 3 and 4 change for people

Measured on live with `supabase/checks/rbac_rules_compare.sql` (1,080 answers per run; no unexpected changes):

- **Organization roles gain three things.** They can manage milestones, see a department's pending invitations and read its task counts. The old rules for these looked only at the department role, so organization admins were left out.
- **Cross-organization roles stop working.** Three memberships on live give someone in one organization a role in a department of another (Spacer → "dev" in open no space, Spacer → "devs" in Test, open no space → "DEV" in NO SPACE). The old rules honoured them; `has_permission()` does not.

Nothing else changes in the database: same projects open, editable and manageable, same rows readable, for every other person.

Step 4 makes the app show what the database already allowed:

- **Team leads see Remove on their department's members.** The database always let them; the button was shown only to admins.
- **Task details on a project** can be edited by the project's managers and the assignee. Before, any department admin saw the controls, including on projects they don't manage, and team leads did not.
- **Role labels** on Profile and Settings read Owner, Organization Admin, Department Admin, Team Lead, Member or Viewer (they read Superadmin, Admin or the raw role).

## 7. Checks

Both finish by raising an error whose message is the report, so they keep nothing. They need `--yes` (the CLI's read-only mode rejects `do` blocks).

| File | Answers |
|---|---|
| `supabase/checks/rbac_parity.sql` | Do the old helpers and `has_permission()` agree, for every person, department and organization? |
| `supabase/checks/rbac_rules_compare.sql` | What does a rules migration change for real people? Snapshot, apply, snapshot, compare, roll back. |

```
npx supabase db query --remote --yes -f supabase/checks/rbac_parity.sql
```

## 8. Migrations

| Migration | Rollback | What |
|---|---|---|
| `20261112100000_rbac_foundation` | `supabase/rollback/20261112100000_rbac_foundation_rollback.sql` | Tables, seed data, `has_permission`, `has_org_permission`, `my_permissions`, `membership_role_key` |
| `20261112110000_rbac_rules` | `supabase/rollback/20261112110000_rbac_rules_rollback.sql` | 5 helpers, 4 functions and 28 policies moved onto `has_permission()` |
| `20261114090000_assign_roles` | `supabase/rollback/20261114090000_assign_roles_rollback.sql` | `assign_role`, `revoke_role`, `org_member_roles`, the `memberships_guard_org_roles` trigger, announcement edit and delete need `announcement.manage` |

The step 3 rollback was generated from the live definitions before the change and tested: applying the migration and then the rollback leaves every answer as it was. Roll back in reverse order.

## 9. Open items

- Delete the three cross-organization memberships (they no longer give any access).
- Step 4, remaining: Reports, the notifications bell and the Directory scope still read role names (section 4). Once they and the deployed edge functions no longer need them, drop `is_org_admin`, `is_admin_of_org`, `has_team_access`, `team_role` and `team_role_at_least`.
- Nothing in step 4 was checked in a browser.
- Step 5, remaining: ownership transfer, and deciding who is Owner in each organization. Today one person holds the old `super_admin` role (in Spacer); every other organization's founder is an Organization Admin, who can do everything an Owner can except be protected from other admins.
- Record `20261114090000_assign_roles` in the migration history: `npx supabase migration repair --status applied 20261114090000 --remote`. Its contents are already live; without the row, `db push` re-runs it and fails.
- Step 5 role changes were checked in a browser by the user on 17 Nov 2026; announcement editing was not.
- Insert, update and delete policies are covered by the parity check, not exercised row by row.
