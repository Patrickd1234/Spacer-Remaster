# Collab projects (cross-department)

A project can be shared by several departments. The first one is the **lead department** (`project_spaces.team_space_id`, `project_departments.is_lead_department`). Each department on a project has its own lead and due date, tasks belong to a department, and a task can wait on another department's task. The Departments tab works out who is holding the project up from the tasks every time; nothing about delays is stored.

## 1. Status of the rework

Agreed with the user on 24 Nov 2026 after a review of the feature.

| Step | What | State |
|---|---|---|
| 1 | Create a project in one transaction (`create_project()`), one Create Project form for one or several departments | Done, applied 24 Nov 2026 |
| 2 | Invite departments: the inviter no longer needs rights in the other department; that department's lead accepts or declines and picks who leads their part | Done, applied 24 Nov 2026 |
| 3 | Manage departments on an existing project: add (by invite), change lead or due date, remove (its tasks move to the lead department) | Planned |
| 4 | Department leads run their part: their tasks' deadlines, add their own people, their part's due date within the overall deadline. No deleting. | Planned |
| 5 | Wording: "Resolve" becomes "Show their tasks", confirm before signing off a part with open tasks | Planned |

Decisions: an invited department must accept; the overall project lead comes from the lead department and gets no extra rights; removing a department moves its tasks to the lead department; department leads get exactly the three rights in step 4.

## 2. Rules

- **Creating** (`create_project(p_name, p_due_date, p_project_lead, p_departments)`): security invoker, so the row-level security on `project_spaces`, `project_departments`, `project_members` and `activity_log` still decides; its own checks only give readable messages first. The lead department needs `project.create` for the creator. Returns `{ project, invited_department_ids }`.
  - One department: the deadline is optional and the project lead also leads the department.
  - Several: the overall deadline is required; a department with no due date takes it; none may be due after it.
  - The project lead must be a member of the lead department. Department leads must be members of their department.
  - The project lead and the department leads become project members (which sends them the "added to a project" notice and email, only once the transaction commits).
- **Inviting**: any department of the organization can be picked (`organization_departments()` lists their names). Where the creator has `project.create` it joins at once; elsewhere its row is `status = 'invited'`, with no lead, a proposed due date and `invited_by`/`invited_at`. A project manager may also insert an invite later (insert policy) and cancel it (delete).
  - While invited, the department gets nothing: no project access (`extra_department_has_permission`), its people aren't shown to the other departments (`shares_project_with_department`), tasks can't be put in it (`project_has_department`), no lead rights (`leads_project_department`). The sidebar and the task forms leave it out.
  - The invite goes to the people holding `project.manage` through a role on that department; if there are none, to the organization's admins (`department_invite_recipients()`, notification `department_invite`, log `department_invited`). They see it on Home (`DepartmentInvites.jsx`, `my_department_invites()`).
  - `respond_to_department_invite()`: someone with `project.manage` in the invited department accepts (picks who leads the part, may change the due date within the deadline; the lead joins the project) or declines (the row is deleted). The inviter gets `department_invite_reply`; the log gets `department_joined` / `department_declined`. The guard allows leaving `invited` only this way, only to `active`.
- **Seeing**: anyone with `project.view` in any of the project's departments, or added to the project. The sidebar lists it for those departments' team leads and for people added to it or with a task in it (`projectVisibility.js`).
- **Managing** (departments, dates, members): `can_manage_project()`, i.e. `project.manage` in the lead department.
- **Blocking a task**: its assignee or creator, a lead of its department (named lead or `project.manage` there), or a project manager (`tasks_guard_department`). Finishing the blocking task clears the block for everyone.
- **Overdue** on the Departments tab: open, past its due date, and not waiting on another task. A department turns Delayed only after the grace day (`DEFAULT_DELAY_RULES` in `crossDepartment.js`).

## 3. Code

| Where | What |
|---|---|
| `src/partials/CreateProjectModal.jsx` | The Create Project form, one or several departments (INVITE cards for the ones you can't create in) |
| `src/partials/DepartmentInvites.jsx` | Home page panel: accept or decline invites |
| `src/departmentInvitesData.js` | Invites: list, department people, accept/decline, cancel |
| `src/newProject.js` | The form's rules and `create_project()` arguments (tests: `newProject.test.js`) |
| `src/projectDepartments.js` | Department pickers, lead choices, Add Members list |
| `src/crossDepartment.js` | Delay status, culprits, notes, block choices (tests: `crossDepartment.test.js`) |
| `src/crossDepartmentData.js` | Reads and writes: departments, task department, blocks, nudge, sign-off, `createProject()` |
| `src/components/DepartmentsTab.jsx`, `TaskBlockPanel.jsx`, `DepartmentTaskBadges.jsx` | Project page pieces |

## 4. Migrations

| Migration | Rollback | What |
|---|---|---|
| `20261120100000_cross_department_projects` | `supabase/rollback/20261120100000_cross_department_projects_rollback.sql` | `project_departments`, task department and blocks, guards, notifications, `nudge_department()` |
| `20261120120000_cross_department_permissions` | `supabase/rollback/20261120120000_cross_department_permissions_rollback.sql` | The same access on `has_permission()` |
| `20261124120000_create_project` (applied 24 Nov 2026) | `supabase/rollback/20261124120000_create_project_rollback.sql` | `create_project()`. Dry run on live, rolled back: see the development log, 24 Nov 2026 |
| `20261124130000_department_invites` (applied 24 Nov 2026) | `supabase/rollback/20261124130000_department_invites_rollback.sql` | Invites: status `invited`, `organization_departments()`, access helpers ignore invites, guard, insert policy, notifications, `my_department_invites()`, `respond_to_department_invite()`, `create_project()` invites. Dry run on live, rolled back: see the development log |

Apply `20261124130000_department_invites` before using an app build with invites: the Create Project form lists departments through `organization_departments()` and reads `create_project()`'s new result.

## 5. Open items

- An invite can be sent, cancelled and sent again with no limit, and each one notifies the department's leads. Fine inside one organization; add a limit if it's abused.
