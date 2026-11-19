# Spacer feature inventory (codebase investigation, as of 2026-11-19)

Scope and method: I read the local repository at `Spacer-reMastered/` (app in `Spacer-app/`). I did not change any files. I ran `npm test` and `npx eslint .`, both read-only. The "sources" below are local file paths relative to `Spacer-reMastered/`, with line numbers where useful. Nothing here comes from the web. Two kinds of state matter throughout:
- **Live**: committed, with the migration applied to the live Supabase project.
- **Uncommitted / not applied**: `git status` on 2026-11-19 lists `src/meetings/`, `src/tasks/`, `src/general/RoleEditor.jsx` and four migrations as untracked. Two of those migrations, meetings and task keys, are not yet on the live database.

Stack: React 19.2, react-router 7, Vite 8, Tailwind 3.4 (built by PostCSS), and `@supabase/supabase-js` as the only runtime dependency. Hosted on Vercel. There are 216 git commits.

---

## 1. Feature areas and their state

### Takeaway
Spacer is a fairly complete internal work-management app for one company. It covers organization → departments ("team spaces") → projects → tasks, Kanban "Orbit" boards, sprints with burndown, velocity and retros, calendars, announcements, a directory, chat (DMs and group), notifications (in-app plus email), stand-ups, reports and a permission-based RBAC. Several parts are partial: meetings and task keys are built but not live; Settings has decorative toggles and hard-coded seat data; there are tables with no UI (comments, milestones); and a search edge function goes unused.

### Cited findings

**Routes / pages**
- 20 routes: `/` (Home), `/welcome`, `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/accept-invite`, `/launch`, `/onboarding`, `/reports`, `/department`, `/calendar`, `/profile`, `/settings`, `/tasks`, `/general`, `/general/announcements`, `/general/calendar`, `/general/directory`, `/project_page/:project_id` — [Spacer-app/src/App.jsx:223-245](Spacer-app/src/App.jsx)
- The app has about 20,100 lines of JSX. The largest files are `project_page.jsx` (2,131 lines), `SidebarRouter.jsx` (1,174), `Reports.jsx` (1,060), `Department.jsx` (905), `Settings.jsx` (845) and `GroupChat.jsx` (835). Several are over the project's own 800-line limit — `wc -l` over `Spacer-app/src`

**Organizations / departments ("team spaces") / projects — LIVE**
- Hierarchy tables: `organizations`, `team_spaces` (departments), `project_spaces` (projects; has `due_date`, `team_lead` and a `search_vector`), `memberships`, `project_members` — [Spacer-app/supabase/schema/schema.sql:267-382](Spacer-app/supabase/schema/schema.sql)
- Launching an organization is atomic (migration `20261030100000_launch_organization_atomic.sql`). The onboarding step 2 of 3 creates the teams — [Spacer-app/src/onboarding.jsx:183](Spacer-app/src/onboarding.jsx), [Spacer-app/supabase/migrations/](Spacer-app/supabase/migrations)
- Project deadlines: `project_spaces.due_date`, shown and editable by managers through `components/ProjectDeadline.jsx` — [DEVELOPMENT_LOG.md:60](DEVELOPMENT_LOG.md)
- Leaving an organization and removing someone from it, via `remove_from_organization()`, live since 12 Nov. It unassigns open tasks, removes memberships and logs the exit — [DEVELOPMENT_LOG.md:160-167](DEVELOPMENT_LOG.md)
- Project page tabs: Summary, Sprint, Messages, Tasks (Orbit board), Files, Members, Calendar — [Spacer-app/src/project_page.jsx:992-1593](Spacer-app/src/project_page.jsx)
- Collaboration on projects shared by several departments is "not built anywhere yet" — [DEVELOPMENT_LOG.md:231](DEVELOPMENT_LOG.md)

**Tasks — LIVE (task keys not live)**
- Task columns: `status` (default `todo`), `priority` (free text), `due_date` (date only), `assignee_id` (one assignee), `parent_task_id`, `sub_tasks` (text holding JSON), `column_id`, `milestone_id`, `sprint_id`, `story_points`, `completed_at`, and a weighted full-text `search_vector` — [Spacer-app/supabase/schema/schema.sql:341-363](Spacer-app/supabase/schema/schema.sql)
- Subtasks are kept as JSON text and parsed on the client; there were bugs with malformed JSON — [DEVELOPMENT_LOG.md:17](DEVELOPMENT_LOG.md). A separate `test-subtasks.js` script runs outside `npm test` — [DEVELOPMENT_LOG.md:130](DEVELOPMENT_LOG.md)
- Each project can have its own board columns (`project_columns` table, migration `20261026100000`). Kanban drag-and-drop is live — [Spacer-app/docs/SECURITY_AND_FIXES_LOG.md](Spacer-app/docs/SECURITY_AND_FIXES_LOG.md) (status table)
- The boards are branded "Orbit" (project tab "Orbit", Tasks page "Orbit Board", home "My Orbit") and have a space-themed backdrop — [DEVELOPMENT_LOG.md:123-127](DEVELOPMENT_LOG.md)
- All Tasks (`/tasks`): super admins see tasks grouped department → project → task, with collapsible departments; other roles get a three-column board — [DEVELOPMENT_LOG.md:24](DEVELOPMENT_LOG.md), [DEVELOPMENT_LOG.md:145](DEVELOPMENT_LOG.md)
- Only project managers and admins can edit task deadlines; the `tasks_guard_due_date` trigger enforces this — [DEVELOPMENT_LOG.md:151](DEVELOPMENT_LOG.md)
- Task keys (`DEVNGT-42`, click to copy, "Copy branch name") — UNCOMMITTED, migration NOT applied. This is step 1 of a planned GitHub automation — [DEVELOPMENT_LOG.md:230-237](DEVELOPMENT_LOG.md), [Spacer-app/src/tasks/TaskKeyBar.jsx](Spacer-app/src/tasks/TaskKeyBar.jsx)
- The database logs every task insert and update itself (`tasks_log_activity`) — [DEVELOPMENT_LOG.md:119](DEVELOPMENT_LOG.md)
- No task comments in the UI: a `comments` table exists ([schema.sql:105](Spacer-app/supabase/schema/schema.sql)), but no `src/` file queries it (`grep from("comments")` returns nothing).
- No milestone UI: a `milestones` table and `tasks.milestone_id` exist ([schema.sql:224](Spacer-app/supabase/schema/schema.sql)), but no `src/` file queries `milestones`. The word appears only in copy: the Reports subtitle "milestone tracking" ([Reports.jsx:527](Spacer-app/src/Reports.jsx)) and a Settings toggle "Project Milestone Changes" ([Settings.jsx:521](Spacer-app/src/Settings.jsx)).
- I found no task dependencies, labels/tags, watchers, multiple assignees or start dates in the `tasks` schema — [schema.sql:341-363](Spacer-app/supabase/schema/schema.sql)

**Sprints — LIVE**
- Real sprints replaced an earlier browser-only 15-minute timer. Features: story points, a committed baseline at start, burndown, velocity, retrospective, history, a backlog, planned sprints and carry-over on completion. Project managers (`can_manage_project`) run sprints; members can only set story points. Migration `20261031090000_sprints` — [DEVELOPMENT_LOG.md:51](DEVELOPMENT_LOG.md), [DEVELOPMENT_LOG.md:89-93](DEVELOPMENT_LOG.md), [Spacer-app/src/sprints/](Spacer-app/src/sprints)
- `sprintMath.js` has 10 unit tests — [DEVELOPMENT_LOG.md:92](DEVELOPMENT_LOG.md)

**Calendars and meetings — calendars LIVE, meeting scheduling NOT LIVE**
- There is a personal calendar (`/calendar`, `CalendarView.jsx`), a Company Calendar (`/general/calendar`), a project Calendar tab, and day drawers for adding tasks — [App.jsx:237,243](Spacer-app/src/App.jsx)
- "Schedule a Meeting" modal: title, description, date/time/duration, meeting link, repeat (daily/weekly/monthly), attendees (people or departments) and an agenda checklist, plus in-app `meeting_invite` notifications. It is UNCOMMITTED and migration `20261119090000_meetings` is NOT applied. Open gaps: no email invites, attendees aren't told when a meeting changes, one occurrence of a repeat can't be edited alone, and the dialog has no focus trap — [DEVELOPMENT_LOG.md:222-229](DEVELOPMENT_LOG.md), [Spacer-app/src/meetings/](Spacer-app/src/meetings)
- Leftover placeholder: the project page's sidebar meeting panel still says "Meeting creation functionality coming soon..." — [Spacer-app/src/project_page.jsx:1408](Spacer-app/src/project_page.jsx)
- External calendar sync is a disabled button: "Connect Calendar (coming soon)" — [Spacer-app/src/general/CompanyCalendar.jsx:128](Spacer-app/src/general/CompanyCalendar.jsx)

**General Space: announcements and directory — LIVE**
- General Overview, Announcements (cover image, pin, edit and delete for `announcement.manage` holders) and Directory (scoped by role, with filters, a profile drawer, reports-to, an in-drawer role editor and "Remove from organization") — [App.jsx:241-244](Spacer-app/src/App.jsx), [DEVELOPMENT_LOG.md:86-88](DEVELOPMENT_LOG.md), [DEVELOPMENT_LOG.md:209-212](DEVELOPMENT_LOG.md)
- Directory scoping is enforced only on the page: "the `users` table is still readable organization-wide" — [DEVELOPMENT_LOG.md:87](DEVELOPMENT_LOG.md)

**My Space dashboard / Home — LIVE**
- My Space has a greeting (an animated sun or moon, `GreetingSky.jsx`), My Orbit, stat cards, Recent Activities and Meetings, with live refresh over Supabase realtime. Super admins get an organization home instead — [DEVELOPMENT_LOG.md:120](DEVELOPMENT_LOG.md), [DEVELOPMENT_LOG.md:127](DEVELOPMENT_LOG.md), [DEVELOPMENT_LOG.md:135](DEVELOPMENT_LOG.md)
- The dashboard is fixed: I found no widget configuration or custom-dashboard code (`grep widget` gives no feature hits; `DashboardParts.jsx` holds fixed parts).
- A `my-space` edge function (an aggregation endpoint) exists, but no `src/` code calls it; `MySpace.jsx` queries tables directly — [Spacer-app/supabase/functions/my-space/index.ts](Spacer-app/supabase/functions/my-space/index.ts)

**Messages: DMs, group chat, attachments — LIVE**
- Direct messages with pins, reactions, attachments, editing, unread counts and upload progress — [Spacer-app/src/partials/SidebarRouter.jsx](Spacer-app/src/partials/SidebarRouter.jsx) (around lines 55, 377, 517, 534, 995); migration `20261017140000_dm_pins_and_reactions.sql`
- Group or department channels and project Messages tabs (`chat_channels`, `messages`, `message_attachments`, `message_reactions`) — [Spacer-app/src/components/GroupChat.jsx](Spacer-app/src/components/GroupChat.jsx), [schema.sql:89-206](Spacer-app/supabase/schema/schema.sql)
- Attachments go to private storage buckets (chat attachments, DM attachments) — migrations `20261017130000_chat_attachments_bucket.sql` and `20261030110000_dm_attachments_bucket.sql`
- Known issues logged in October: "B-07 DM duplicates/false unread", "X-08/X-03 DM base64 attachments" (Medium) — [Spacer-app/docs/SECURITY_AND_FIXES_LOG.md:300](Spacer-app/docs/SECURITY_AND_FIXES_LOG.md). The DM attachment bucket migration came later (30 Oct), so the base64 part may be resolved (uncertain).
- I found no threads, voice/video or @mention autocomplete in the chat files (uncertain; based on grep).

**Notifications — LIVE (partly)**
- In-app and email notifications for "task assigned", "added to a project" and "task due soon", plus a daily `due-soon-reminders` job (pg_cron, 07:00 UTC) and a webhook secret kept in Vault. Verified on live on 1 Nov: emails were delivered and returned 200 — [DEVELOPMENT_LOG.md:53](DEVELOPMENT_LOG.md), [DEVELOPMENT_LOG.md:59](DEVELOPMENT_LOG.md)
- Email goes through Resend SMTP on the domain `spacer.ink` — [Spacer-app/docs/SECURITY_AND_FIXES_LOG.md](Spacer-app/docs/SECURITY_AND_FIXES_LOG.md) §2
- The bell also shows reminders built in the browser (a daily summary of open tasks plus tasks due within 2 days). Read state is kept per browser in localStorage — [DEVELOPMENT_LOG.md:36-39](DEVELOPMENT_LOG.md), [DEVELOPMENT_LOG.md:122](DEVELOPMENT_LOG.md), [Spacer-app/src/notifications.js:117](Spacer-app/src/notifications.js)
- The database enum includes `org_invite`, `proj_invite`, `proj_remove`, `task_assignment`, `task_overdue`, `deadline_incoming`, `deadline_miss`, `role_assignment` — [schema.sql:31](Spacer-app/supabase/schema/schema.sql)
- Settings toggles that appear to do nothing: "Weekly Productivity Digest", "Browser Desktop Push Notifications", "In-App Audio Effects" and "Notification Delivery Frequency" (realtime/hourly/daily). They are saved to user metadata, but their keys appear only in `Settings.jsx` and `PreferencesContext.jsx`. There is no service worker and no `Notification.requestPermission` — [Spacer-app/src/Settings.jsx:519-560](Spacer-app/src/Settings.jsx), [Spacer-app/src/PreferencesContext.jsx:16-24](Spacer-app/src/PreferencesContext.jsx)
- The "Task Assignments & Due Dates" toggle does switch off the browser reminders — [DEVELOPMENT_LOG.md:39](DEVELOPMENT_LOG.md). I did not verify whether the edge functions honour "Email Notifications".

**Reports — LIVE**
- Sections: task totals, a status chart (`PieChart.jsx`), "Workload Distribution" and "Project Workspaces" with status filters, plus an Entire Workspace / Assigned to Me scope for admins. Members see only their own work — [Spacer-app/src/Reports.jsx:527,697,799](Spacer-app/src/Reports.jsx), [DEVELOPMENT_LOG.md:132](DEVELOPMENT_LOG.md), [DEVELOPMENT_LOG.md:149](DEVELOPMENT_LOG.md), [DEVELOPMENT_LOG.md:155](DEVELOPMENT_LOG.md)
- No export, CSV or PDF code in `Reports.jsx` (grep found none). Reports scoping still uses role names rather than permissions — [Spacer-app/docs/RBAC.md:153](Spacer-app/docs/RBAC.md)

**Daily stand-ups — LIVE**
- Stand-ups are per department (`daily_standups.team_space_id`) and live in a tab on the Tasks page. Super admins pick the department — [DEVELOPMENT_LOG.md:25-28](DEVELOPMENT_LOG.md), [Spacer-app/src/Tasks.jsx:59-150](Spacer-app/src/Tasks.jsx)
- If the table fetch fails, stand-ups silently fall back to localStorage (`spacers_daily_standups`) — [Spacer-app/src/Tasks.jsx:154-235](Spacer-app/src/Tasks.jsx); listed as open item F-05 — [SECURITY_AND_FIXES_LOG.md:300](Spacer-app/docs/SECURITY_AND_FIXES_LOG.md)

**Files — LIVE (project-level only)**
- Project Files tab (`project_files` table, private bucket from migration `20261017120000_private_project_files_bucket.sql`) with a document viewer (`components/DocViewer.jsx`) — [project_page.jsx:1462](Spacer-app/src/project_page.jsx)
- I found no organization-wide file library, versioning or task-level attachments (the `attachments` table at [schema.sql:64](Spacer-app/supabase/schema/schema.sql) is not queried from `src/`).

**Search — LIVE (basic)**
- Header search runs debounced `ilike` substring queries on task titles, project names and user names, limited to 3 results each — [Spacer-app/src/partials/header.jsx:145-165](Spacer-app/src/partials/header.jsx)
- A full-text `search` edge function ("SEARCH-01", Postgres tsvector under the caller's RLS) exists, but the UI never calls it — [Spacer-app/supabase/functions/search/index.ts](Spacer-app/supabase/functions/search/index.ts)

**Settings — real vs. localStorage vs. Coming Soon**
- Real: the workspace rename (saved only when the user is an org admin past 2FA; a silent skip is detected) — [Settings.jsx:163-175](Spacer-app/src/Settings.jsx); 2FA (`TwoFactorSettings`); password change (edge function `change-password`); Leave organization; the Dark/Light theme; density, animation speed, glass effect and sidebar side, which apply CSS variables and are stored in Supabase `user_metadata.preferences` — [PreferencesContext.jsx:47-140](Spacer-app/src/PreferencesContext.jsx)
- Coming Soon cards: "Personal Access Tokens" ([Settings.jsx:771](Spacer-app/src/Settings.jsx)), "GitHub Sync" and "Slack Bot" ([Settings.jsx:832-833](Spacer-app/src/Settings.jsx)). Defaults for GitHub, Slack, Google Calendar and Figma are `connected: false`, with the comment "No integrations are built yet" — [PreferencesContext.jsx:31-38](Spacer-app/src/PreferencesContext.jsx)
- Fake or unsaved data: "Organization License Seats — 14 of 25 seats used" is hard-coded, including the 56% bar ([Settings.jsx:785-792](Spacer-app/src/Settings.jsx)). The "Automated Domain Joining" switch and "allowed domain" field only update local state: the only organization write is `.update({ name })` ([Settings.jsx:164](Spacer-app/src/Settings.jsx)), and `autoJoinDomain` appears in no other file. The domain is partly cached in localStorage ([Settings.jsx:119-122](Spacer-app/src/Settings.jsx)).
- Unused preference keys: `security.shareStatus`, `analyticsOptIn` and `sessionTimeout` are defined but have no UI or effect — [PreferencesContext.jsx:26-30](Spacer-app/src/PreferencesContext.jsx)

**Light mode — PRESENT (contradicts the brief's "light mode removed")**
- A trial light mode was removed on 31 Oct ([DEVELOPMENT_LOG.md:55](DEVELOPMENT_LOG.md)), but a Light palette under `html.light` with a Dark/Light switch was merged back on 3 Nov ([DEVELOPMENT_LOG.md:130-131](DEVELOPMENT_LOG.md)). The switch is still in Settings → Appearance ([Settings.jsx:577-600](Spacer-app/src/Settings.jsx)), and `PreferencesContext.jsx:77-83` toggles the class. The git log shows `4bf3318 merge: Test-phase into main (light mode, ...)`. Light mode exists today, though its polish is unverified (no browser checks are logged).

**Onboarding / invites — LIVE**
- Sign up → email confirmation → `/welcome` (launch an organization or join one) → `/launch` → `/onboarding` (create teams and invite emails) — [Spacer-app/src/Welcome.jsx](Spacer-app/src/Welcome.jsx), [Launch_Organization.jsx](Spacer-app/src/Launch_Organization.jsx), [onboarding.jsx](Spacer-app/src/onboarding.jsx)
- Invites use the edge functions `invite-department-member` and `invite-team-post-launch`, plus `/accept-invite`. Invite emails are covered in the 30 Oct work — [Spacer-app/supabase/functions/](Spacer-app/supabase/functions)
- Google sign-in is shown but disabled: "Google sign-in is currently unavailable until Supabase Google auth is configured." — [Spacer-app/src/Login.jsx](Spacer-app/src/Login.jsx), [signup.jsx](Spacer-app/src/signup.jsx)
- No SSO/SAML (grep found none).

**RBAC — LIVE (5-step migration mostly done)**
- Six fixed roles: Owner, Organization Admin, Department Admin, Team Lead, Member, Viewer. There are 23 permissions and 73 grants in `rbac_roles`, `rbac_permissions` and `rbac_role_permissions`, checked through `has_permission()` / `has_org_permission()` / `my_permissions()`. All database policies use these since 13 Nov — [Spacer-app/docs/RBAC.md:11-35](Spacer-app/docs/RBAC.md), [DEVELOPMENT_LOG.md:174-187](DEVELOPMENT_LOG.md)
- The app asks `can(permission, department)` through `src/permissions.js` (9 tests). Roles can be assigned from the Directory since 17 Nov — [DEVELOPMENT_LOG.md:189-218](DEVELOPMENT_LOG.md)
- Open items: custom roles, project-level roles, ownership transfer, and the Reports, notifications and Directory scoping that still read role names — [RBAC.md:17-19](Spacer-app/docs/RBAC.md), [RBAC.md:204-207](Spacer-app/docs/RBAC.md)
- Parity was checked with SQL scripts that compare old and new answers (11,304 answers, no unexpected differences) — [DEVELOPMENT_LOG.md:176](DEVELOPMENT_LOG.md)
- A Viewer role exists ([schema.sql:27](Spacer-app/supabase/schema/schema.sql)), but there is no external guest or client user type.

**2FA / MFA — LIVE**
- Supabase TOTP MFA is enforced on the server: a RESTRICTIVE policy on every table requires `aal2` once a user has a verified factor. "Remember this device for 7 days" uses `mfa_trusted_devices`. MFA is optional per user, not required by the organization — [Spacer-app/supabase/migrations/20261018090000_enforce_mfa.sql:1-30](Spacer-app/supabase/migrations/20261018090000_enforce_mfa.sql), [SECURITY_AND_FIXES_LOG.md](Spacer-app/docs/SECURITY_AND_FIXES_LOG.md) §1 and §7

**Activity log — LIVE**
- `activity_log`, scoped by organization since 14 Nov, feeds the project Recent Activity (realtime on tasks, with de-duplication) and My Space Recent Activities. Friendly wording comes from `activityLabels.js`. `activity_log` is not in the realtime publication, so file, member and sprint actions appear only after a refresh — [DEVELOPMENT_LOG.md:114-119](DEVELOPMENT_LOG.md), [DEVELOPMENT_LOG.md:199-203](DEVELOPMENT_LOG.md)
- There is no admin-facing organization-wide audit log screen (none found; uncertain).

**Mobile / responsive — WEAK**
- The workspace sidebar is a fixed 260px column (`fixed left-0 ... w-[260px]`) — [Spacer-app/src/partials/WorkspaceSidebar.jsx:106](Spacer-app/src/partials/WorkspaceSidebar.jsx)
- Across about 20k lines of JSX there are only 56 `sm:`, 35 `md:`, 54 `lg:` and 14 `xl:` prefixes, and no hamburger or mobile-menu code (grep). The only "mobile" comments are about hiding the auth brand panel — [Login.jsx:158](Spacer-app/src/Login.jsx)
- No PWA manifest, no service worker and no native apps.

### Inferences
- In maturity, Spacer is a strong late-stage MVP or internal beta. The core project, task, sprint and chat loops work and are secured at the database level. The surrounding product (Settings, integrations, admin/billing) is still partly placeholder.
- Many claims in the log end with "Not checked in a browser", so UI behaviour is less verified than database behaviour (see Section 3).

### Gaps
- I could not confirm whether the "Email Notifications" preference is honoured server-side, or whether the DM base64-attachment issue is fully fixed.
- I did not run the app, so I can't speak to visual quality or runtime bugs.

---

## 2. What's missing compared with typical tools (Jira / monday.com / Upwork)

### Takeaway
None of the standard "platform" features of Jira or monday.com exist in code: time tracking, automations, custom fields, integrations, a public API or webhooks, templates, Gantt/timeline, configurable dashboards, guest access, billing, mobile apps, AI and import/export. GitHub commit/PR automation is the only one with a researched plan and a first step (task keys) built, and that step is not yet live. Nothing resembles Upwork: there is no marketplace, freelancer profiles, contracts, payments or escrow.

### Cited findings
- **Time tracking:** absent. No matches for `time_entr|timeTrack|time track|timesheet` in `src/`, migrations or functions (grep, 2026-11-19).
- **Automations / rules:** absent as a feature. The only "automation" hits are the planned GitHub task automation (`src/tasks/taskKey.js`, `20261119100000_task_keys.sql`). The plan: (1) task keys, (2) a signed org-level GitHub webhook moving tasks to In Progress or Done, (3) account linking and In Review, (4) a GitHub App — [DEVELOPMENT_LOG.md:230](DEVELOPMENT_LOG.md); report at `reports/GitHub commit task automation.md`.
- **Custom fields:** absent (no `custom_field` hits; the `tasks` columns are fixed — [schema.sql:341-363](Spacer-app/supabase/schema/schema.sql)).
- **Integrations (GitHub, Slack, Google Calendar):** all "Coming soon" or disabled — [Settings.jsx:832-833](Spacer-app/src/Settings.jsx), [CompanyCalendar.jsx:128](Spacer-app/src/general/CompanyCalendar.jsx), [PreferencesContext.jsx:31-38](Spacer-app/src/PreferencesContext.jsx)
- **API / webhooks / tokens:** no public API, and Personal Access Tokens are "Coming soon" ([Settings.jsx:771](Spacer-app/src/Settings.jsx)). Webhooks exist only internally (database → email edge functions, using the `x-webhook-secret` check in `supabase/functions/_shared/webhookAuth.ts`).
- **Templates:** absent. The only "template" hits are CSS `grid-template-rows` ([Reports.jsx:874](Spacer-app/src/Reports.jsx)) and an email HTML template in `invite-department-member`.
- **Gantt / timeline:** absent (no `gantt|timeline` hits). Calendar views exist instead.
- **Workload:** only a "Workload Distribution" panel in Reports ([Reports.jsx:697](Spacer-app/src/Reports.jsx)). There is no capacity planning or resource view.
- **Dashboards / widgets:** fixed My Space and Reports pages only; nothing is configurable.
- **Guest / client access:** absent. Roles are internal only, and the "guest" hits are meeting attendees ([meetings migration](Spacer-app/supabase/migrations/20261119090000_meetings.sql)).
- **Billing / payments:** absent (no `billing|stripe|payment|invoice` hits). The seat counter is hard-coded ([Settings.jsx:785-792](Spacer-app/src/Settings.jsx)).
- **Mobile apps:** none; web only, with weak responsiveness (Section 1).
- **AI features:** absent (no `openai|anthropic|AI|gpt` hits in `src/` or the functions).
- **Import / export:** none found (no CSV, Jira import or export code).
- **Other common gaps:** task comments (table present, no UI), milestones (table present, no UI), task dependencies, labels/tags, multiple assignees, SSO, Google OAuth (disabled), browser push, a weekly digest, saved views and filters, and recurring tasks. Only meetings repeat, and that is not live.
- **Present and comparable to Jira:** sprints with story points, burndown, velocity and retro ([DEVELOPMENT_LOG.md:92](DEVELOPMENT_LOG.md)); Kanban with custom columns; per-project issue keys (pending); and a permission-based RBAC.
- **Present and comparable to monday.com / workplace suites:** announcements, a company calendar, a directory with reporting lines, stand-ups, DMs and group chat, and departments as top-level spaces.

### Inferences
- Measured against Jira, Spacer covers the Scrum basics. It lacks configurable workflows, JQL-style search, automation, issue types, links/dependencies and the integration ecosystem.
- Measured against monday.com, it lacks the defining traits: flexible column types and custom fields, multiple views (Gantt, timeline, workload), automations, integrations and widget dashboards.
- Measured against Upwork, the overlap is essentially zero: Spacer is an internal workspace, not a talent marketplace.
- On the other hand, it bundles internal-comms features (announcements, directory, chat, stand-ups) that Jira and monday.com leave to Slack or HR tools. That is a plausible "one workspace" differentiator.

### Gaps
- `grep` can miss features with unusual names. Absence is inferred from searches, not proven.

---

## 3. Quality signals

### Takeaway
Security engineering is the strongest signal: RLS on every table, a restrictive server-side MFA gate, permission-based RBAC checked by parity scripts, private storage buckets, security headers, and edge functions that run under the caller's RLS. Testing is thin: 147 pure-logic unit tests, with no component, integration or E2E tests and no coverage tool. Lint is almost clean. Documentation is unusually detailed for the project's size.

### Cited findings
- **Tests:** `npm test` (Node's built-in `node --test` on `src/**/*.test.js`) gives **147 pass, 0 fail**, in about 0.8 s (run 2026-11-19). There are 19 test files, all pure helpers such as `sprintMath`, `permissions`, `taskKey`, `meetingFormat`, `boardGrouping` and `passwordRules` — [Spacer-app/package.json](Spacer-app/package.json) (`"test"` script), file list under `Spacer-app/src`. There is no React Testing Library, Vitest, Playwright or coverage tooling in `devDependencies` — [package.json](Spacer-app/package.json). The log says repeatedly that changes were "Not checked in a browser" (for example [DEVELOPMENT_LOG.md:228](DEVELOPMENT_LOG.md) and [DEVELOPMENT_LOG.md:236](DEVELOPMENT_LOG.md)).
- **Database verification:** migrations are dry-run on live inside blocks that always roll back, and parity and compare SQL checks live in `supabase/checks/` — [DEVELOPMENT_LOG.md:176](DEVELOPMENT_LOG.md), [DEVELOPMENT_LOG.md:182](DEVELOPMENT_LOG.md), [DEVELOPMENT_LOG.md:224](DEVELOPMENT_LOG.md)
- **Lint:** `npx eslint .` gives 11 problems: 1 error, in `test-subtasks.js:30` (`no-useless-assignment`, a script outside the app), and 10 warnings (`exhaustive-deps`, kept on purpose per [DEVELOPMENT_LOG.md:62](DEVELOPMENT_LOG.md)). This was run 2026-11-19.
- **CI:** `.github/workflows/ci.yml` runs `npm ci`, `npm test` and `npm run build`, then lint (non-blocking, `continue-on-error: true`), then `deno check` on every edge function — [.github/workflows/ci.yml](.github/workflows/ci.yml)
- **RLS:** the October log says "Row-level security on all 28 public tables — Live (was off on 22)" — [SECURITY_AND_FIXES_LOG.md](Spacer-app/docs/SECURITY_AND_FIXES_LOG.md) §1. The current schema snapshot defines 33 tables, has 33 "enable row level security" statements and 133 `create policy` statements ([schema.sql](Spacer-app/supabase/schema/schema.sql), grep counts). The later RBAC tables come from their own migrations.
- **MFA enforcement:** a RESTRICTIVE policy is added to every table so that an aal1 token can't read data once MFA is enrolled — [20261018090000_enforce_mfa.sql:1-30](Spacer-app/supabase/migrations/20261018090000_enforce_mfa.sql)
- **Edge functions:** 9 functions (`change-password`, `delete-workspace-item`, `invite-department-member`, `invite-team-post-launch`, `launch-organization`, `my-space`, `search`, `send-notification`, `send_email`) plus `_shared` (cors, email, html, mfa, webhookAuth). The `search` and `my-space` functions run under the caller's auth so that RLS applies — [Spacer-app/supabase/functions/search/index.ts:1-5](Spacer-app/supabase/functions/search/index.ts)
- **Hosting hardening:** Vercel serves an SPA rewrite and the headers `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, and a `Permissions-Policy` that disables camera, microphone and geolocation. There is no Content-Security-Policy — [Spacer-app/vercel.json](Spacer-app/vercel.json)
- **Other security work:** URL/XSS guards (`src/safeUrl.js`), 0 `npm audit` findings (October), `.env` untracked since 31 Oct, password rules (`passwordRules.js`) — [SECURITY_AND_FIXES_LOG.md](Spacer-app/docs/SECURITY_AND_FIXES_LOG.md) §1, [DEVELOPMENT_LOG.md:50](DEVELOPMENT_LOG.md)
- **Open October items (some since resolved):** "B-04 errors swallowed while the UI shows success", "B-03 onboarding fails silently", "D-06 org/identity read from user-editable metadata or localStorage", "P-07 error boundary, monitoring, tests", "F-07 invented data", "P-04 polling and unbounded queries", "P-06 very large files" — [SECURITY_AND_FIXES_LOG.md:288-304](Spacer-app/docs/SECURITY_AND_FIXES_LOG.md). These look resolved since: the `.env` item (S-01, per [DEVELOPMENT_LOG.md:50](DEVELOPMENT_LOG.md)), the SPA rewrite (P-02, in `vercel.json`), the Tailwind build (P-01, per the comment in `index.html`) and an ErrorBoundary component (`src/components/ErrorBoundary.jsx`). D-06 is plausibly still open: `localStorage.getItem("userId")` in [Reports.jsx:56,125](Spacer-app/src/Reports.jsx). F-07 is still present: the seat counter.
- **Migration hygiene:** 33 migrations, mostly with rollback files in `supabase/rollback/`. There is no baseline migration, so `supabase db reset` on a fresh stack fails ([DEVELOPMENT_LOG.md:72](DEVELOPMENT_LOG.md)). A history-row repair for `20261114090000` was still pending on 17 Nov ([DEVELOPMENT_LOG.md:218](DEVELOPMENT_LOG.md)).
- **Design system:** one palette of CSS variables exposed as Tailwind roles (canvas `#0F1115`, accent `#AFF82A`), a custom accessible `Select` (keyboard support, typeahead), a planet loader that respects reduced motion, the "Orbit" space theme and Material Symbols icons — [DEVELOPMENT_LOG.md:55](DEVELOPMENT_LOG.md), [DEVELOPMENT_LOG.md:83](DEVELOPMENT_LOG.md), [DEVELOPMENT_LOG.md:105](DEVELOPMENT_LOG.md), [DEVELOPMENT_LOG.md:168](DEVELOPMENT_LOG.md)
- **Docs:** `docs/RBAC.md` (212 lines), `docs/SECURITY_AND_FIXES_LOG.md` (304 lines) and a 237-line `DEVELOPMENT_LOG.md`. `Spacer-app/README.md` is still the unmodified Vite template — [Spacer-app/README.md](Spacer-app/README.md)
- **Language:** plain JavaScript/JSX, with no TypeScript in the app (the edge functions are TypeScript).
- **Dev process:** a lot of uncommitted work exists on 2026-11-19 (21 modified files, untracked migrations and folders) — `git status`

### Inferences
- The security posture (database-enforced permissions plus MFA at the policy layer) is above what is typical for an MVP. A solid argument for SMB security is credible, though there is no SOC 2-type evidence, CSP, rate limiting or monitoring.
- Reliability risk sits in the UI layer: large components, no UI tests and no browser verification.

### Gaps
- No coverage percentage can be given, because no coverage tool is configured.
- I did not verify performance, bundle size or accessibility beyond what the logs claim.

---

## 4. Product positioning stated in the repo

### Takeaway
Spacer presents itself as "one workspace for every company/team": a single internal operating space where departments such as HR, Design, Development and Marketing each get their own space. It is aimed at multi-department organizations, not software teams alone, and not freelancers or clients.

### Cited findings
- "One workspace for every company. HR, Design, Dev and Marketing — each in their own space, all in one place." — [Spacer-app/src/Login.jsx](Spacer-app/src/Login.jsx) and [Launch_Organization.jsx](Spacer-app/src/Launch_Organization.jsx) (brand copy)
- "One workspace for every team. HR, Design, Dev and Marketing—each in their own space, all in one place." — [Spacer-app/src/signup.jsx](Spacer-app/src/signup.jsx)
- "HR, Design, Development, and Marketing — bring all company operations into one unified platform." — [Spacer-app/src/Welcome.jsx](Spacer-app/src/Welcome.jsx) / [signup.jsx](Spacer-app/src/signup.jsx)
- "Set up your company's workspace and departments. You'll be its super admin and can invite your team." — [Welcome.jsx](Spacer-app/src/Welcome.jsx)
- "Many organizations begin with three teams and expand as adoption grows." — [onboarding.jsx](Spacer-app/src/onboarding.jsx)
- The sample task in the onboarding preview is a software bug ("Fix auth token expiry bug") — [onboarding.jsx:168-171](Spacer-app/src/onboarding.jsx). The Settings integrations copy targets "external developer tools" — [Settings.jsx:826](Spacer-app/src/Settings.jsx)
- The browser tab title is "Spacers | Dashboard". The brand appears as both "Spacer" and "Spacers" — [Spacer-app/index.html:7](Spacer-app/index.html), [DEVELOPMENT_LOG.md:34](DEVELOPMENT_LOG.md)
- There is no landing or marketing page, pricing page or README positioning. The app opens on login or signup ([App.jsx:223-226](Spacer-app/src/App.jsx)), and the README is the Vite boilerplate.
- Production domain for email: `spacer.ink` — [SECURITY_AND_FIXES_LOG.md](Spacer-app/docs/SECURITY_AND_FIXES_LOG.md) §2

### Inferences
- The intended customer looks like a small-to-mid company that wants departments, projects, internal comms and HR-ish directory features in one tool. The Jira-style sprint features and the GitHub plans suggest the development department is the most developed use case.
- Spacer competes with monday.com work management (multi-department) and Jira (dev sprints). It does not compete with Upwork.

### Gaps
- No stated pricing, target company size, market or go-to-market appears in the repo.
- Terms and Privacy text exists on signup, but I did not confirm whether real policy pages are linked.
