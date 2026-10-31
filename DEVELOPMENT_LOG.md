# Development Log

This log tracks development work and code changes made for this project.

## 2026-10-13

- Fetched the latest remote updates. `origin/main` had no new commits; the newer commit was on `origin/esther-changes`, which was not merged.
- Created and switched to the personal working branch `personal-changes`, based on `main`.
- Fixed an extra closing sequence in `Spacer-app/src/Settings.jsx` that caused parser errors. The editor's Problems check reported no remaining errors in that file.
- Resolved code review MEDIUM findings (M1 through M10):
  - M1: Replaced hardcoded "Acme" placeholder data in `Settings.jsx` by dynamically fetching organization details from Supabase and deriving slugs and domains. Replaced hardcoded `@acme.com` domain text with dynamic workspace domain.
  - M2: Removed hardcoded dev repositories (`Arduinobeginner13/...`) in `Settings.jsx` and `public/github-oauth.html`. Repos and authorized user are now dynamically derived.
  - M3: Removed hardcoded API tokens in `Settings.jsx`, initializing tokens from `localStorage` (`spacers_api_tokens`) with an empty fallback and proper persistence. Added empty state for tokens list.
  - M4: Corrected `console.log` error logging in `Profile.jsx` to `console.error` guarded by `import.meta.env.DEV`.
  - M5: Added `aria-label` attributes to password show/hide buttons in `Login.jsx`, `signup.jsx`, and `AcceptInvite.jsx`.
  - M6: Replaced dead `#` "Forgot Password?" anchor link in `Login.jsx` with full Supabase recovery flow: created `/forgot-password` route & `ForgotPassword.jsx` form wired to `supabase.auth.resetPasswordForEmail` with safe fallback confirmation, and created `/reset-password` route & `ResetPassword.jsx` screen accepting recovery sessions and updating password with `supabase.auth.updateUser`. Added reset success feedback on `Login.jsx`.
  - M7: Added error warning logs for malformed JSON parsing of `sub_tasks` across `home.jsx`, `Tasks.jsx`, `CalendarView.jsx`, and `project_page.jsx`.
  - M8: Filtered real-time tasks changes subscription in `Reports.jsx` by `assignee_id=eq.${userId}` (personal reports) and `organization_id=eq.${organizationId}` (workspace reports) to prevent re-fetch storms, with guaranteed unmount channel cleanup.
  - M9: Replaced unprojected `select("*")` calls with explicit column projections across 19 hot paths (`CalendarView.jsx`, `Department.jsx`, `home.jsx`, `Profile.jsx`, `project_page.jsx`, `Reports.jsx`, `Settings.jsx`, `Tasks.jsx`, `ChatMessage.jsx`, `GroupChat.jsx`, `ProjectPanel.jsx`, and all sidebar partials).
  - M10: Extracted shared left-side authentication brand panel into `src/partials/AuthBrandPanel.jsx` and refactored `Login.jsx` and `signup.jsx` to use it.

## 2026-10-30

- All Tasks (`Tasks.jsx`): super admins now see tasks grouped department → project → task (new `components/DepartmentTaskGroups.jsx` + `components/groupTasksByDepartment.js`), with no assignees shown. Other roles keep the three-column board.
- Daily stand-ups are now per department:
  - Members and admins see their active department's sheet (picked in the sidebar). Super admins choose a department from a dropdown, which defaults to the last department they opened.
  - New stand-ups save with `team_space_id`. The local-storage fallback is split by department too.
  - Migration `supabase/migrations/20261030090000_standups_department.sql` adds a nullable `daily_standups.team_space_id` (cascades on department delete) and an index. It backfills existing rows only for authors who are in exactly one department. Rollback is in `supabase/rollback/`. It is applied to the live database (verified on 2026-10-30, see below).
- Sidebar (`WorkspaceSidebar.jsx`, `SidebarNav.jsx`, `SidebarRouter.jsx`):
  - It lists only projects that belong to the user's departments. Projects the user was added to directly are no longer listed, and `fetchDirectProjects` has been removed from `projectMemberships.js`.
  - Highlights: the active department row is highlighted when opened from the sidebar (otherwise Directory is), nested items get a tinted background, and Messages is highlighted while the chat is open.
- Department page (`Department.jsx`): the page's department switcher is hidden for anyone who is an admin of any department, since they switch from the sidebar. "Create Department" now shows for super admins only (UI only; the database rule is unchanged).
- Settings (`Settings.jsx`): renaming the workspace now catches the case where the database silently skips the update (no error, no rows). It tells the user that only org admins signed in with 2FA can rename.
- Brand text on the auth/onboarding screens (`ForgotPassword.jsx`, `Launch_Organization.jsx`, `onboarding.jsx`, `AuthBrandPanel.jsx`): dropped the forced uppercase, so it reads "Spacer".
- Checked: `node --test src/components/groupTasksByDepartment.test.js` passes 5/5. The UI changes were not exercised in a browser in this session.
- Task reminders in the notification bell (`taskReminders.js`, `notifications.js`, `partials/header.jsx`):
  - Each day the bell shows one summary of the user's open assigned tasks, plus one reminder per task due today, tomorrow or the day after. They sit above the activity feed with their own icons.
  - Reminders are built in the browser from the user's open tasks (new `fetchOpenAssignedTasks`), so no database change. Their ids include the date, so they come back unread each day; "Mark all read" covers them.
  - Turning off Settings → "Task Assignments & Due Dates" also turns the reminders off.
  - Checked: `node --test src/taskReminders.test.js` passes 6/6, ESLint is clean on the changed files, and `vite build` succeeds. Not exercised in a browser (needs a signed-in account).
- Checked the stand-ups migration on the live database (project "Spacer") with read-only queries through the Supabase CLI. It was already fully applied, so nothing was run:
  - `20261030090000 standups_department` is recorded in `supabase_migrations.schema_migrations`.
  - `daily_standups.team_space_id` exists (uuid, nullable) with its foreign key to `team_spaces` (on delete cascade) and the `daily_standups_team_space_date_idx` index.
  - 4 of 8 stand-ups have a department. The other 4 have none, so they don't show on any department's sheet; no remaining stand-up's author is in exactly one department, so the backfill has nothing left to fill.
- Updated the class1 tutorial doc to match: Lesson 2 and self-check question 6 now say the migration is applied.

## 2026-11-01

- Reviewed all 21 migrations in `Spacer-app/supabase/migrations` by hand and checked the live database (project "Spacer") with read-only queries through the Supabase CLI. Findings:
  - The live database has three migrations that `Test-phase` did not: `20261030150000 org_team_memberships` (on the `22's` branch), and `20261031090000 sprints` and `20261031100000 notifications`, which are in no git branch. Until those two files are committed, `supabase db push` refuses to run.
  - There is no baseline migration: the first file expects `public.users` and the existing policies, so `supabase db reset`, a fresh local stack or a Supabase branch fails. The base schema is only in the read-only `supabase/schema/schema.sql` snapshot.
  - `project_columns.sql` was renamed from `20261026090000` to `20261026100000`; both versions are recorded live, so the history matches.
  - `20261016120000_handle_new_user` and `20261017080000_project_member_access` have no rollback file.
  - `supabase/.temp/project-ref` is missing, so `--linked` commands fail with "Have you run supabase link?". The checks passed `--project-ref` instead; `npx supabase link` fixes it for good.
- `20261030140000_general_space_fields.sql` is now safe to run twice: `add column if not exists`, `create index if not exists`, `drop constraint if exists` before each table-level check, and `drop policy if exists` before each of its 5 policies. It is already applied live, so this only matters for replays.
  - Checked the live data against its rules: 1 calendar event and 1 announcement, none with a non-`https://` link or a blank or 200+ character title.
  - Not run against a database after the edit.
- Merged `22's` into `Test-phase` (directory fix, React Compiler lint fixes, migration `20261030150000_org_team_memberships.sql`, and `.env` / root `node_modules` no longer tracked). `vite build` succeeds after the merge.
  - The merge deletes `Spacer-app/.env` and the root `node_modules` from disk. Restore with `cp Spacer-app/.env.example Spacer-app/.env` (then fill in both values from Supabase → Project Settings → API) and `npm install` in the repo root.
