# Task workflow (parts E to J)

How people see, find and change work day to day: the task panel, the list view, speed, phones, task details, and the Inbox. Planned on 26 Nov 2026 after comparing Spacer with ClickUp and Jira; the user asked for E first, then F to J in order. The rule throughout: match what people use every day in those tools, and leave out what their users complain about (dozens of view types, custom fields everywhere, workflow rule builders).

## 1. Status

| Part | What | State |
|---|---|---|
| E | Task panel: fixed-width side sheet (full screen on phones) with its own link, title and description edited in place, details column, real subtasks, checklist, attachments, dependencies, Comments and History together | Done, applied 27 Nov 2026 |
| F | List view with grouping, sorting and editing in cells, quick filters, saved views, bulk changes, quick add on board and list | Done, applied 27 Nov 2026 |
| G | Ctrl+K search and jump, keyboard shortcuts, Undo instead of confirm dialogs | Code done (no migration) |
| H | Phones and polish: slide-out sidebar, board swipes between columns, loading placeholders, empty states, the leftover colours removed | Code done (no migration); one type scale across the app left for later |
| I | Several assignees and watchers, labels, a start date the Timeline uses | Planned |
| J | Inbox page (done, snooze, filters), a few fixed automation rules, templates per department | Planned |

## 2. The task panel (part E)

- **Opening**: a board card, the calendar, the Departments and Timeline tabs, a sprint, or a link. The open task is in the address (`/project_page/<project>?task_id=<task>`), so the copy-link button in the panel's header gives a link anyone with access can open, and Back closes it. Escape or the backdrop closes it too; Escape inside a field or a menu only cancels that.
- **Layout**: a header with where the task sits (project, and the parent for a subtask), copy link, delete, close. Then the title and the task key. Below that a main column (description, subtasks, checklist, attachments, dependencies, activity) and a details column on the right (status, priority, assignee, due date, points, created). On phones the details come straight after the title and the panel fills the screen.
- **Editing in place**: click the title or description (or focus it and press Enter). The title saves on Enter or clicking away; the description saves with Ctrl+Enter or Save. Escape cancels. Status, priority and assignee save when picked. A change shows at once and goes back, with a message, if the save fails.
- **Who can change what** (unchanged rules): title, description, priority, assignee, checklist and attachments: the project's managers and the task's assignee. Status and subtasks: anyone who can add tasks to the project (`can_edit_project`), the same as dragging on the board. Due date: project managers and the task's department lead (`tasks_guard_due_date`). Delete: the task's creator or a project manager (`tasks_delete`).
- **Subtasks** are real tasks with `parent_task_id`: their own assignee, due date, comments and board card (which shows "↳ parent"). One level deep, in the parent's project. Ticking one moves it to the first Done column. The parent's card shows "Subtasks 2/3". Deleting a task keeps its subtasks as tasks of their own.
- **Checklist** is the older list stored in `tasks.sub_tasks` (JSON), renamed from "Sub-tasks" so the two are not confused, as in ClickUp. Ticking items still moves the task (all ticked: Done; some: Doing).
- **History** reads the database's own task log (`tasks_log_activity`: the row before and after each change) and shows lines such as "moved it to Doing", "assigned it to Ada", "ticked “Draft”" (`taskHistory.js`). The app's own `status_changed` and `priority_changed` entries repeat those, so they are skipped there.
- **Assignee list**: members of the task's department plus people added to the project directly, the same as the Create Task form. The current assignee stays listed even after leaving the department.

## 3. Views of the tasks (part F)

- **Toolbar** on the Tasks tab, for the board and the list: Board or List; a filter box (title or task key, such as "DEV-12"); quick filters you can combine (Mine, Unassigned, Overdue, Due this week, High priority, which means high or urgent); sorting (newest first, due date with undated tasks last, priority, title); grouping in the list (status, assignee, priority, department on a Collab project, or none). The department bar of a Collab project sits in the same row. "x of y" and Clear show while something is filtered. What you last used on a project is remembered in this browser.
- **List view**: one row per task with its key, title (opens the panel; a subtask shows "↳ parent"), status, assignee, due date (red when overdue) and priority, each changed where it sits under the same rights as the panel. Groups fold. Status groups follow the board's columns and stay even when empty.
- **Quick add**: "+ Add task" at the foot of every board column and every list group. Type a title and press Enter; the field stays open for the next one. The task takes that column, assignee, priority or department; with Mine on, it's assigned to you so it doesn't vanish from the view.
- **Bulk changes**: tick rows (or a whole group) in the list, then set status, assignee, priority or due date, or delete. Each task is saved on its own, so one you can't change doesn't stop the rest; the bar then says how many changed and why the others didn't ("Changed 3 of 5 tasks. 2 weren't: …").
- **Saved views** (`task_views`): save what you see under a name. Anyone who can see the project can save their own; the project's managers can also share one with everyone on the project. The Views menu switches between them, shows "(changed)" when you've moved away from one, and offers Update, Stop using it and Delete to those allowed. Saved config is checked when it's read back (`normalizeView`), so an old or edited one can't break the page.

## 4. Speed (part G)

- **Search and jump** (`src/search/CommandPalette.jsx`): Ctrl+K (Cmd+K on a Mac), "/" or the header's search button. Typing finds tasks by key ("DEV-12"), by words in the title or description (each word as a prefix, so "laun" finds "launch") or by any part of the title; projects and people by any part of the name; and pages and actions by name or keyword. Arrow keys move, Enter opens, Escape closes. A task opens in its project's panel, a person in the Directory. With nothing typed it lists the actions (create a task, project or meeting; keyboard shortcuts) and every page. It searches as the signed-in person straight through the database, so row-level security leaves out what they can't see, the same rule as the `search` edge function, which nothing calls any more.
- **Shortcuts** (`src/shortcuts.js`; "?" lists them): anywhere, Ctrl+K or "/" search, C create a task, ? help; on a project's Tasks tab B board, L list, F filter; in a task J next, K previous (in the order the Tasks tab shows), E edit the title, Esc close. Single keys never fire while typing in a field, with Ctrl, Alt or Cmd held, or (for C, B, L, F) while a panel or form is open.
- **Undo instead of "Are you sure?"**: deleting a task (its card, its panel, or several from the list) removes it at once and shows "Deleted “…”. Undo" for 6 seconds (Ctrl+Z works too); the delete goes to the database when the toast goes, when another undoable change starts, or when you leave the page. Live reloads keep the waiting tasks hidden. A delete that's refused brings the task back with the reason. Bulk changes in the list (status, assignee, priority, due date) offer Undo in the bulk bar, putting each task's own earlier value back.

## 5. Phones and polish (part H)

- **Sidebar on phones** (below 768px wide): hidden, and opened from the menu button at the left of the header as a drawer over the page, with labels showing. The backdrop, Escape, or going to another page closes it; so does opening Messages. From 768px up nothing changed: the sidebar stays, collapsible, and pages leave it room (`md:ml-[260px]` / `md:ml-[72px]` on every page, which were plain `ml-…` before and pushed content off a phone's screen).
- **Header on phones**: the menu button, the Create button as an icon, search as an icon (Ctrl+K still works), no breadcrumb.
- **Project page on phones**: less padding; the tabs scroll sideways; "Delete project" shows as an icon below 1024px; the board scrolls a column at a time (each column 85% of the screen, snapping), and the task panel already fills the screen.
- **Loading**: until a project's tasks arrive the Tasks tab shows the shape of the board or list instead of empty columns.
- **Empty**: "No tasks yet" with Add a task (or "press C") on a project without tasks; "No tasks match this view" with Clear filters when the view hides them all.
- **Colours**: 20 leftover colours from an old Material theme are gone from `tailwind.config.js` (nothing used them); the three still used (`secondary`, `secondary-fixed`, `error-container`) now follow the app's tokens, so they change with light and dark mode.
- **Type scale** (for new work; existing pages still mix sizes): 11px labels and meta, 12px controls and secondary text, 13px body in dense lists and panels, 15px inputs that matter (search), 20 to 22px titles. `tailwind.config.js` has the older named sizes (`label-sm` 11, `body-sm`/`label-md` 12, `body-md` 14, `headline-md` 20, `headline-lg` 24); moving every page to one set is a separate pass that needs checking page by page in a browser.

## 6. Rules in the database

| Rule | Where |
|---|---|
| A subtask is in the same project and organization as its parent; one level deep; a task with subtasks can't become one; a task can't be its own | `tasks_guard_parent()` (trigger on insert, and on update of `parent_task_id` or `project_id`) |
| A task with subtasks can't move to another project; a subtask can't move away from its parent's project | same |
| Deleting a task detaches its subtasks | `tasks_parent_task_id_fkey` `on delete set null` (was `cascade`) |

| Saved views: see the project to see shared ones and your own; save your own; only project managers share, or change or delete a shared one; a view keeps its project and owner; config is a JSON object of at most 4 KB | `task_views` policies, `task_views_keep_owner()` |

Messages use `hint = 'subtask'`, and `taskPanelData.js` shows them as they are.

## 7. Code

| File | What |
|---|---|
| `src/tasks/panel/TaskPanel.jsx` | The panel: header, layout, Escape, focus |
| `src/tasks/panel/EditableText.jsx` | Title and description edited in place |
| `src/tasks/panel/TaskProperties.jsx` | Details column |
| `src/tasks/panel/TaskSubtasks.jsx`, `TaskChecklist.jsx`, `TaskAttachments.jsx`, `TaskActivity.jsx`, `PanelSection.jsx` | The panel's sections |
| `src/tasks/subtasks.js`, `src/tasks/taskHistory.js` | Pure rules (tests: `subtasks.test.js`, `taskHistory.test.js`) |
| `src/tasks/taskPanelData.js` | History, assignable people, saving fields, adding a task |
| `src/fileUploads.js` | Upload checks and file display, moved out of `project_page.jsx` |
| `src/tasks/taskViews.js` | Views as data: filters, sorting, groups, bulk summaries (tests: `taskViews.test.js`) |
| `src/tasks/taskViewsData.js`, `src/tasks/views/useTaskViews.js` | Saved views, the last view per project, the project's people, changing or deleting several tasks |
| `src/tasks/views/TaskViewToolbar.jsx`, `SavedViewsMenu.jsx`, `TaskListView.jsx`, `BulkBar.jsx`, `QuickAddTask.jsx` | The toolbar, the Views menu, the list, the bulk bar, "+ Add task" |
| `src/tasks/taskKeyPrefixes.js` | Task key prefixes, shared by the key labels, the filter and search |
| `src/search/CommandPalette.jsx`, `paletteData.js`, `paletteSearch.js` | Search and jump (tests: `paletteSearch.test.js`, which also covers `shortcuts.js`) |
| `src/shortcuts.js` | Which key presses count, and the shortcut list |
| `src/useUndoable.js`, `src/components/UndoToast.jsx` | Changes that wait for Undo |
| `src/tasks/views/TaskPlaceholders.jsx` | Loading shapes and empty states on the Tasks tab |
| `src/partials/WorkspaceSidebar.jsx`, `src/partials/header.jsx` | The drawer on phones (`TOGGLE_NAV_EVENT`) and the header's menu button |
| `src/project_page.jsx` | Owns the data: `openTask`/`closeTask` (URL), `saveTask`, `moveTask` (board drag, panel and list status), `addSubtask`, `toggleSubtask`, `quickAddTask`, `bulkMove`, `bulkSave`, `bulkDelete` |

## 8. Migrations

| Migration | Rollback | What |
|---|---|---|
| `20261127090000_subtasks` (applied 27 Nov 2026) | `supabase/rollback/20261127090000_subtasks_rollback.sql` | `tasks_guard_parent()` and its trigger; subtasks kept when the parent is deleted. Dry run on live, rolled back: see the development log |
| `20261127100000_task_views` (applied 27 Nov 2026) | `supabase/rollback/20261127100000_task_views_rollback.sql` | `task_views` with row-level security, the two-factor rule, `updated_at`, and the owner guard. Dry run on live, rolled back: see the development log |

## 9. Open items

- The panel, the list, the bulk bar, search, the shortcuts and the phone layout have not been checked in a browser yet.
- Other pages' own content (Reports' charts, Settings, the Department page, the chat window) hasn't been reworked for phones; with the sidebar out of the way they now get the whole width, but some may still be wider than a phone.
- A delete waiting for Undo is sent when the tab is hidden or closed, but a browser may not finish the request if the tab closes at once; the task then simply stays.
- Bulk and list changes are logged by the database (History shows them), but Recent Activity labels them "Updated task" rather than "Moved … to Done".
- Other pages (My Space, Tasks, the calendar page) still have their own task drawers; they can link to the project page's panel later.
- A subtask is made only from its parent's panel; an existing task can't be made a subtask from the app yet.
