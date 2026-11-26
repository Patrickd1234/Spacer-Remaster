# Collab projects (cross-department)

A project can be shared by several departments. The first one is the **lead department** (`project_spaces.team_space_id`, `project_departments.is_lead_department`). Each department on a project has its own lead and due date, tasks belong to a department, and a task can wait on another department's task. The Departments tab works out who is holding the project up from the tasks every time; nothing about delays is stored.

## 1. Status of the rework

Agreed with the user on 24 Nov 2026 after a review of the feature.

| Step | What | State |
|---|---|---|
| 1 | Create a project in one transaction (`create_project()`), one Create Project form for one or several departments | Done, applied 24 Nov 2026 |
| 2 | Invite departments: the inviter no longer needs rights in the other department; that department's lead accepts or declines and picks who leads their part | Done, applied 24 Nov 2026 |
| 3 | Manage departments on an existing project: add (by invite), change lead or due date, remove (its tasks move to the lead department) | Done (part C), applied 26 Nov 2026 |
| 4 | Department leads run their part: their tasks' deadlines, add their own people, their part's due date within the overall deadline. No deleting. | Done (part C), applied 26 Nov 2026 |
| 5 | Wording: "Resolve" becomes "Show their tasks", confirm before signing off a part with open tasks | Done (part C) |

After a review on 25 Nov 2026 ("collaboration isn't smooth; show when a department holds the project up, like Jira or ClickUp") the user chose this order, folding steps 3 to 5 in as part C:

| Part | What | State |
|---|---|---|
| A | Trustworthy signal: "waiting" vs "holding up", live updates on the project page, a lead needed when accepting an invite, department dates follow the deadline | Done, applied 26 Nov 2026 |
| B | Visible everywhere: health pill in the project header, hold-ups panel on Home, red dots in the sidebar, edged board cards, hourly automatic alerts | Done, applied 26 Nov 2026 |
| C | Steps 3 to 5 above | Done, applied 26 Nov 2026 |
| D | Several dependencies per task (either side), department timeline with dependency arrows, department scorecard in Reports | Done, applied 26 Nov 2026 |

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
- **Managing** (departments, dates, members): `can_manage_project()`, i.e. `project.manage` in the lead department. On the Departments tab (shown to managers on every project, so a one-department project can bring others in): "+ Add a department" (`add_project_department()`: joins at once where the manager can create projects, otherwise invited), Edit (lead and due date), Remove (not the lead department; its tasks move to the lead department, `project_departments_moved_tasks`, logged `department_removed` with the number moved).
- **A department's lead** (its named lead, or `project.manage` in that department; `leads_department_on_project()`), on a project they don't manage: changes their department's task deadlines (`tasks_guard_due_date`), adds their department's people to the project (`project_members_insert`; Add Members then lists only those), moves their part's due date within the deadline and signs it off ("Change due date" on its card). Not its lead, not other departments, no deleting. Signing off a part with open tasks asks first.
- **Dependencies** (`task_dependencies`, since part D; before that one `tasks.blocked_by_task_id`, now retired and kept empty): a task can wait on any number of open tasks of the same project, in any department, like Jira's "is blocked by / blocks". Set or removed from either task's panel by someone with rights on either task: its assignee or creator, a lead of its department, or a project manager (`can_set_task_dependency()`). No loops (`task_dependency_creates_cycle()`), not on a finished task. Finishing the task waited on resolves the wait (`resolved_at`, cleared if it is reopened) and tells a waiting task with nothing else open that it can go ahead; the rows stay, so wait times are known. A task moved to another project loses its dependencies. A new wait on another department's task tells that department's lead.
- **Timeline** tab (every project): a lane per department (one lane on a one-department project), a bar per task from when it was created to its due date (dashed: no due date), arrows from each task to the tasks waiting on it (red when holding up), lines for today, the deadline and each department's due date (`timelineLayout.js`, `ProjectTimeline.jsx`).
- **Department scorecard** on Reports (admins, Entire Workspace): per department across every project: tasks holding others up now, days others have waited on it, its tasks held up, open, overdue and on-time share (only tasks finished since `completed_at` was recorded count) (`departmentScorecard.js`, `DepartmentScorecard.jsx`).
- **Waiting vs holding up** (`dependencyState()` in `crossDepartment.js`, the same rules in SQL in `notify_department_holdups()`): a task waiting on another department's task is a normal hand-off ("on schedule") unless the task waited on is **late** (past its due date), a **conflict** (due after the waiting task's due date) or **stalled** (no due date, waited on for 2+ days). Only those three block the waiting department, make the other "At risk", name it as holding the project up, list its tasks under "Tasks causing the delay", turn arrows red, edge board cards and raise alerts.
- **Seen where**: the project header pill on every tab (`projectHealth()`), the Departments tab, board cards (red edge = holding others up, amber = held up), the Home panel "Hold-ups between departments" (your departments' hold-ups and what they wait on; everything for organization-wide admins), red dots on held-up projects in the sidebar (`holdups.js`, `holdupsData.js`, cached a minute). The project page reloads its tasks and departments live.
- **Alerts**: hourly (`department-holdups` cron job, `notify_department_holdups()`): the blocking department's lead and the blocking task's assignee once per hold-up, the project lead if it is still holding up 3 days later (`department_holdup` notifications, opening the blocking task). `task_holdup_alerts` remembers what was sent.
- **Overdue** on the Departments tab: open, past its due date, and not waiting on another task. A department turns Delayed only after the grace day (`DEFAULT_DELAY_RULES` in `crossDepartment.js`).

## 3. Code

| Where | What |
|---|---|
| `src/partials/CreateProjectModal.jsx` | The Create Project form, one or several departments (INVITE cards for the ones you can't create in) |
| `src/partials/DepartmentInvites.jsx` | Home page panel: accept or decline invites |
| `src/departmentInvitesData.js` | Invites: list, department people, accept/decline, cancel |
| `src/newProject.js` | The form's rules and `create_project()` arguments (tests: `newProject.test.js`) |
| `src/projectDepartments.js` | Department pickers, lead choices, Add Members list |
| `src/crossDepartment.js` | Delay status, waiting vs holding up, culprits, notes, project health, card roles, block choices (tests: `crossDepartment.test.js`) |
| `src/holdups.js`, `src/holdupsData.js` | Hold-ups across projects for Home and the sidebar (tests: `holdups.test.js`) |
| `src/partials/HoldupsPanel.jsx`, `src/components/ProjectHealthPill.jsx`, `src/components/statusTones.js` | Home panel, header pill, shared status colours |
| `src/components/DepartmentCardActions.jsx`, `src/components/AddDepartmentForm.jsx` | Department card actions (sign off, edit, remove) and adding a department on the Departments tab |
| `src/components/TaskDependenciesPanel.jsx` | Task panel: department, "Waiting on" and "Blocking" lists, add or remove from either side |
| `src/timelineLayout.js`, `src/components/ProjectTimeline.jsx` | Timeline tab (tests: `timelineLayout.test.js`) |
| `src/departmentScorecard.js`, `src/departmentScorecardData.js`, `src/components/DepartmentScorecard.jsx` | Reports scorecard (tests: `departmentScorecard.test.js`) |
| `src/crossDepartmentData.js` | Reads and writes: departments, task department, blocks, nudge, sign-off, `createProject()` |
| `src/components/DepartmentsTab.jsx`, `TaskBlockPanel.jsx`, `DepartmentTaskBadges.jsx` | Project page pieces |

## 4. Migrations

| Migration | Rollback | What |
|---|---|---|
| `20261120100000_cross_department_projects` | `supabase/rollback/20261120100000_cross_department_projects_rollback.sql` | `project_departments`, task department and blocks, guards, notifications, `nudge_department()` |
| `20261120120000_cross_department_permissions` | `supabase/rollback/20261120120000_cross_department_permissions_rollback.sql` | The same access on `has_permission()` |
| `20261124120000_create_project` (applied 24 Nov 2026) | `supabase/rollback/20261124120000_create_project_rollback.sql` | `create_project()`. Dry run on live, rolled back: see the development log, 24 Nov 2026 |
| `20261124130000_department_invites` (applied 24 Nov 2026) | `supabase/rollback/20261124130000_department_invites_rollback.sql` | Invites: status `invited`, `organization_departments()`, access helpers ignore invites, guard, insert policy, notifications, `my_department_invites()`, `respond_to_department_invite()`, `create_project()` invites. Dry run on live, rolled back: see the development log |
| `20261126090000_realtime_project_departments` (applied 26 Nov 2026) | `supabase/rollback/20261126090000_realtime_project_departments_rollback.sql` | Broadcast `project_departments` over Realtime for the project page |
| `20261126100000_department_holdup_alerts` (applied 26 Nov 2026) | `supabase/rollback/20261126100000_department_holdup_alerts_rollback.sql` | `task_holdup_alerts`, `notify_department_holdups()`, hourly cron job, notification type `department_holdup`. Dry run on live, rolled back: see the development log |
| `20261126110000_collab_department_management` (applied 26 Nov 2026) | `supabase/rollback/20261126110000_collab_department_management_rollback.sql` | `leads_department_on_project()`, `add_project_department()`, moving a removed department's tasks, department leads' rights (task deadlines, adding their people, their part's due date). Dry run on live, rolled back: see the development log |
| `20261126120000_task_dependencies` (applied 26 Nov 2026) | `supabase/rollback/20261126120000_task_dependencies_rollback.sql` | `task_dependencies` (RLS, Realtime), rights, loop check, guard, notices, resolving on done, the old column retired, the hourly alerts reading the new table. Dry run on live, rolled back: see the development log |

Apply `20261124130000_department_invites` before using an app build with invites: the Create Project form lists departments through `organization_departments()` and reads `create_project()`'s new result.

## 5. Open items

- An invite can be sent, cancelled and sent again with no limit, and each one notifies the department's leads. Fine inside one organization; add a limit if it's abused.
