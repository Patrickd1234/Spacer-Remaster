# Project creation and cross-department workflow

Implementing the design doc "Spacers — Project Creation & Cross-Department Workflow" (10 reference screens), shared on 26 Nov 2026. Much of it already existed from the Collab work (`COLLAB_PROJECTS.md`, parts A to D) and the task workflow (`TASK_WORKFLOW.md`, parts E to H); this tracks what the design adds.

## 1. Decisions (26 Nov 2026)

| Question | Decision |
|---|---|
| Who can open a project | **Picked members only.** Members and Viewers see a project once they're added to it; team leads, department admins, Owner and Organization Admin still see every project of their departments. Everyone who could open an existing project kept it (added as a member, without a notice). |
| Waiting and In review | **Real task statuses** `waiting` and `in_review`. Mark as waiting sets Waiting; when every task it waits on is done it goes back to the status it had before, unless someone changed it meanwhile. Progress counts Done only. |
| Project tabs | Keep the current names (Summary, Orbit, Public Files…); only **add a Resolve tab**. |
| Checkpoint | Parts E to H were committed first (`ecbfc65`). |

Calls made without asking (smallest reasonable reading of the design):
- An invited department's members are picked as a **proposal**; that department's lead confirms or changes it when accepting (the existing invite rule stays).
- The overall deadline, the project lead, and each joined department's lead and due date are **required**, as the design marks them; before, a one-department project could go without a deadline.
- A department's lead always joins the project; in the member picker their row reads "Lead · Added" and can't be removed.
- Assignee lists stay as they were (the task's department plus people added to the project). If someone from one of the project's departments is given a task in a project they can't open, they are added to it quietly (the assignment notice is the news).
- The "unblocked" task screen (design 09) will live in the existing side panel, not a separate page.

## 2. Status

| Step | Design screens | What | State |
|---|---|---|---|
| P1 | 01 | Create Project: two columns, description, per-department lead, due date and member picker (search, scroll, + / Added), ⋮ Change or Remove department, discard warning, opens the new project. Access by picked members. | Done, applied 26 Nov 2026 |
| P2 | 04, 10 | Statuses `waiting` and `in_review` across the app; board columns | Done, applied 26 Nov 2026 |
| P3 | 03, 05, 09 | Task panel: Blocking this task, actions, Mark as Waiting modal with a note, unblocked banner and chain | Code done; migration `20261128110000_task_waiting` **not applied yet** |
| P4 | 02, 04 | Departments tab redesign; board filters and dependency summary | Planned |
| P5 | 06 | Resolve tab and Close project | Planned |
| P6 | 07 | Timeline week grid, key dates, insights | Planned |
| P7 | 08 | Notifications page | Planned |

## 3. Who can open a project (since P1)

`has_project_access()` and `can_edit_project()` (and the `project_spaces_select` policy) are true for:
- members of the project (`project_members`); a member whose roles in the project's departments are view-only (Viewer) reads it but can't change it (`project_member_is_viewer_only()`), and
- people holding `project.manage` in the project's department or one of its joined departments (team lead, department admin; Owner and Organization Admin everywhere in their organization).

Everything else that reads projects (tasks, files, columns, sprints, dependencies, saved views, milestones, members) goes through those two functions, so nothing else changed. No app code checked `project.view` directly.

Who becomes a member:
- **Creating**: the project lead, each joined department's lead, and the people picked for each joined department (all get the "added to a project" notice and email).
- **Accepting an invite**: the department's chosen lead and the members kept from the proposal.
- **Members tab**: project managers add anyone in the project's departments; a department's lead adds their own department's people (unchanged).
- **Being assigned a task**: someone in one of the project's joined departments, quietly (`tasks_add_assignee_to_project`).

## 4. Create Project (P1)

- **Left**: Project name, Project lead (from the lead department; you by default), Overall deadline, Description (optional, 250 characters, counted).
- **Right**: one card per department. The first is the lead department (tagged LEAD, only departments you can create projects in). Others you can't create projects in are invited (tagged INVITE: no lead picker, a proposed due date, proposed members). One card is open at a time; closed cards show how many people are picked. ⋮ offers Change department and (not the lead department) Remove department. Changing the department clears its lead and picks.
- **Member picker**: the department's people with their job titles, a search over name and job title, a scrolling list; + adds, the row then shows Added and clicking again removes. People come from `org_team_memberships()`, so an invited department's people can be proposed.
- **Footer**: "Only selected members from the added departments will be able to see and work on this project." Cancel, the close button, Escape or clicking outside asks before discarding anything typed.
- **Create Project** runs `create_project()` in one transaction, announces the project to the sidebar and opens it.
- **Accepting an invite** (Home): the lead, the due date, and the proposed members to keep or change, in the same picker.

## 5. Statuses (P2)

| Status | Default board column | Counts as (three-bucket pages) |
|---|---|---|
| `todo` | Backlog | To do |
| `in_progress` | Doing | In progress |
| `waiting` | Waiting | In progress |
| `in_review` | In review | In progress |
| `done` | Done | Done |

- `src/taskStatuses.js` holds the labels, board names and colours, and `statusGroup()` for pages with three buckets (Reports, My Space, All Tasks, sprints). Progress everywhere counts Done only.
- **Board**: a project that never customised its board shows the five columns. A customised board keeps its own columns; if a task has a status with no column there (Waiting, say), the board adds one for it, in status order, which is saved the next time the board is customised. Column settings offer the two new statuses; the "Review" and "Testing" suggestions now mean In review, "Blocked" means Waiting.
- **Back from Waiting**: becoming Waiting remembers the status before (`tasks.status_before_waiting`); leaving it by hand forgets it. When the last task it waits on is done, a task still Waiting goes back to that status (To do if it was created as Waiting), in that status's first column, and its owner's "can go ahead" notice says where it went. A task someone already moved is left alone.
- **Checklist**: ticking some items no longer pulls a Waiting or In review task back to Doing; ticking all still makes it Done.

## 6. Waiting in the task panel (P3)

- **Status**: a Waiting task's status reads "Waiting on Design" under the picker (the departments of the open tasks it waits on; "Waiting on “Task”" on a one-department project).
- **Blocking this task** (details column): each open task waited on, its department, an open button, the note, and "It will be automatically unblocked once it's marked as Done". Without open waits: "Blocked by — No blockers yet".
- **Actions**: Mark as waiting, Add dependency (both open the same window; the second leaves the status alone), Change assignee and Adjust due date (they open those pickers in the panel). Disabled with a reason when not allowed or when nothing could be waited on.
- **Mark as Waiting window**: department waited on (on a Collab project), then the task (open ones of that department the task may wait on: no loops, not itself, not finished; with no rights on this task, only tasks you have rights on), an optional note (500 characters). `mark_task_waiting()` adds the dependency and sets Waiting in one go. A notice confirms: "This task is now waiting on Design. The project will be updated."
- **Unblocked** (design 09): for a week after the last task it waited on is done, the panel opens with "Dependency resolved — Design completed “…”. Product can continue work." and the chain (the finished task, then this one with its status). If you're on the project page when a task of yours is unblocked, a "Task unblocked" notice says so.
- **History**: "made it wait on “…” (Design): “note”", "stopped it waiting on “…”", "finished “…” (Design), so this task was unblocked automatically", with their own markers; the project's Recent Activity names them too. A dependency removed because its task was deleted or moved isn't logged.
- Kept as it was: the dependency lists ("Waiting on" / "Blocking") further down the panel, where dependencies are also added and removed, and the board cards' "waits on" lines.

## 7. Code

| File | What |
|---|---|
| `src/partials/CreateProjectModal.jsx` | The form |
| `src/partials/ProjectDepartmentCard.jsx` | One department: header, ⋮ menu, lead, due date, members |
| `src/partials/createProject/MemberPicker.jsx` | Search and scrolling list with + / Added (also used when accepting an invite) |
| `src/partials/createProject/useOrganizationPeople.js` | Everyone's departments, names and job titles |
| `src/newProject.js` | The form's rules, `create_project()` arguments, people per department, search, toggling (tests: `newProject.test.js`) |
| `src/partials/DepartmentInvites.jsx`, `src/departmentInvitesData.js` | Accepting with members |
| `src/taskStatuses.js` | The five statuses: labels, board names, colours, three-bucket grouping (tests: `taskStatuses.test.js`) |
| `src/boardGrouping.js` `withStatusColumns()`, `src/projectColumns.js` | Columns for statuses a customised board lacks; saving a mix of saved and new columns |
| `src/tasks/waiting.js` | Open waits, "Waiting on …", a recent unblock, picker choices per department, tasks newly unblocked (tests: `waiting.test.js`) |
| `src/tasks/panel/TaskWaitingSection.jsx`, `MarkWaitingModal.jsx`, `UnblockedBanner.jsx`, `useTaskWaiting.js` | The panel's box and actions, the window, the banner and chain, the saving |

## 8. Migrations

| Migration | Rollback | What |
|---|---|---|
| `20261128090000_project_member_access` (applied 26 Nov 2026) | `supabase/rollback/20261128090000_project_member_access_rollback.sql` | Access by membership; backfill; `project_spaces.description`; `project_departments.proposed_member_ids`; quiet adds (`spacer.quiet_member_add`); `tasks_add_assignee_to_project`; `project_member_is_viewer_only()`; `create_project()` with members and description; `respond_to_department_invite()` with members; `my_department_invites()` with the proposal. Dry run on live, rolled back: see the development log, 26 Nov 2026 |

| `20261128100000_task_statuses` (applied 26 Nov 2026) | `supabase/rollback/20261128100000_task_statuses_rollback.sql` | `waiting` and `in_review` allowed on tasks and board columns; `status_before_waiting` and `tasks_track_waiting`; `tasks_dependencies_follow()` returns a Waiting task when its last blocker is done; department stats. Dry run on live, rolled back: see the development log |

| `20261128110000_task_waiting` (not applied) | `supabase/rollback/20261128110000_task_waiting_rollback.sql` | `task_dependencies.note`; `mark_task_waiting()`; History rows for dependencies added, removed and unblocked (`task_dependencies_log`, `tasks_dependencies_follow()`); `task_department_name()`. Dry run on live, rolled back: see the development log |

Apply each migration before using a build that needs it: the new form calls `create_project()` with `p_description`, and the five-column board writes the new statuses: the form calls `create_project()` with `p_description`, which only the new version has.

## 9. Open items

- Not checked in a browser yet (needs a signed-in account).
- Department icons and colours in the design (purple Design, blue Product…) aren't stored anywhere; cards use one neutral icon.
