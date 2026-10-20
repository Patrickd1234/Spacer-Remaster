# Spacer: Security Hardening & Fixes Log

**Period:** 16–19 October 2026
**Scope:** `Spacer-reMastered/Spacer-app` (React 19 + Vite + Supabase project `vrzepdjjjpodztqkfsbh`)
**Reference:** issue IDs (S-, D-, B-, F-, X-, P-) come from `Spacer_Production_Readiness_Review.docx` (15 Oct 2026).

This document records what was changed, why, how it was verified, and what is still open. It's meant for anyone working on the codebase or operating the Supabase project.

---

## Contents

1. [Current status at a glance](#1-current-status-at-a-glance)
2. [Signup & email delivery](#2-signup--email-delivery)
3. [Database security (row-level security)](#3-database-security-row-level-security)
4. [Access model](#4-access-model)
5. [Edge functions](#5-edge-functions)
6. [File storage](#6-file-storage)
7. [Two-factor authentication & password change](#7-two-factor-authentication--password-change)
8. [Bug fixes & feature work](#8-bug-fixes--feature-work)
9. [Frontend hardening](#9-frontend-hardening)
10. [Migrations & rollback scripts](#10-migrations--rollback-scripts)
11. [Operations runbook](#11-operations-runbook)
12. [How changes were verified](#12-how-changes-were-verified)
13. [Remaining work](#13-remaining-work-by-priority)

---

## 1. Current status at a glance

| Area | Status |
|---|---|
| Signup confirmation emails (Resend + `spacer.ink`) | ✅ Live |
| Row-level security on all 28 public tables | ✅ Live (was off on 22) |
| Project-only access (project members without department membership) | ✅ Live |
| Email edge functions locked to webhooks | ✅ Live |
| Private storage for project files + chat attachments | ✅ Live |
| DM pins & reactions | ✅ Live |
| Task status no longer reset on page load; Kanban drag-and-drop | ✅ Live (frontend) |
| Server-side project/department delete | ✅ Live |
| URL/XSS guards, dependency vulnerabilities | ✅ Done (0 npm audit findings) |
| Two-factor (Supabase MFA) + password change | ✅ Live (19 Oct) |
| "Remember this device for 7 days" | ✅ Live (19 Oct) |
| GitHub / Slack / API tokens | ✅ Shown as "Coming soon" (fakes removed) |

> **Rollout note:** the MFA migration was applied before deploying the edge functions that call `mfa_satisfied()`. Keep that order for any future change to those functions' database dependencies.

---

## 2. Signup & email delivery

### Problem
New users never received a confirmation email. There were three causes, found one after another:

1. **Email confirmation was off.** `mailer_autoconfirm: true` in Supabase Auth, so no email was ever sent.
2. **The SMTP account was out of credits.** The Resend key in Supabase belonged to an old account (`451 Authentication failed: Maximum credits exceeded`).
3. **The sender domain wasn't verified.** The new Resend account had no verified domain (`550 The spacer.ink domain is not verified`).

### Resolution
- Supabase Auth → **Confirm email: on**.
- Supabase Auth SMTP → Resend (`smtp.resend.com:465`, user `resend`), sender **`noreply@spacer.ink`**, using the Resend account *mayormoris* (free plan: 100 emails/day, 3,000/month).
- Domain `spacer.ink` (Namecheap) verified in Resend:
  - ownership TXT on `@`
  - DKIM TXT `resend._domainkey`
  - CNAMEs `send` → `send.forge.rmta.net` and `rsend` → `rsend-euw1.forge.rmta.net`
- Namecheap email forwarding is still on; Resend's CNAME setup doesn't need Custom MX.

### Code changes
- `src/signup.jsx`:
  - passes `emailRedirectTo: <origin>/login`;
  - shows a **"Check your inbox"** screen with a **Resend confirmation email** button;
  - removed the fake "Demo/Mock Mode" error link and the browser-side `users` insert;
  - removed a call to `invite-team-post-launch` that could never succeed.
- `src/Login.jsx`: handles `email_not_confirmed` with a resend button; removed the hidden demo toggle and its `test@example.com` login bypass.
- `src/supabase.js`: removed ~260 lines of unused mock client.
- `check_auth.cjs` (hardcoded keys, created throwaway users in production): **deleted**.
- `src/App.jsx`: removed `syncUserProfile` (redundant once the trigger existed; caused `users_pkey` duplicate errors in the logs).

### Profile rows
Migration `20261016120000_handle_new_user.sql` adds trigger `on_auth_user_created`. It creates a `public.users` row for every new auth user (email, Google, invite) and backfilled existing ones. It deliberately does **not** read `organization_id` from signup metadata, because users control that.

---

## 3. Database security (row-level security)

### Finding
RLS was **disabled on 22 of 28 public tables**. Anyone holding the public anon key (it ships in the frontend) could read, and almost certainly write, every row without logging in. Confirmed counts reachable anonymously: 37 users, 18 direct messages, 33 memberships, 3 notification-queue rows. The chat tables had RLS on, but with `USING (true)` policies.

### Fix: four groups, each dry-run tested before applying

| Migration | Tables | Highlights |
|---|---|---|
| `…070000_enable_rls_group1` | `memberships`, `users`, `direct_messages`, `notification_queue` | Org-scoped reads; users can't change their own `organization_id`/`email` (`users_guard_protected_columns` trigger); only org admins grant roles; queue is server-only |
| `…080000_project_member_access` | `project_spaces`, `tasks`, `milestones`, `project_members` (policies) | Project-only access helpers; `project_members` was writable by anyone |
| `…090000_enable_rls_group2` | `tasks`, `project_spaces`, `project_members`, `milestones` | Added missing **delete** policies; fixed `is_org_admin()` |
| `…100000_enable_rls_group3` | `organizations`, `team_spaces`, `calendar_events`, `invites`, `team_space_stats`, `comments`, `attachments`, `notifications`, `announcements`, `org_feed_items`, `email_tickets` | Department delete policy; project members can see their project's department |
| `…110000_enable_rls_group4` | `activity_log`, `project_files`, `daily_standups`, chat tables | Activity feed scoped to org + accessible projects (was cross-tenant); chat by channel membership/scope; `chat_channels.created_by` added |

**Verified after rollout:** all 28 tables have RLS on, no `USING (true)` policies remain, and the anon key returns 0 rows everywhere.

### Role-check bugs fixed along the way
- `team_role_at_least()` didn't rank `admin`/`super_admin`, so department admins failed every "member or above" check. Order is now: viewer < member < team_lead < admin < super_admin.
- `is_org_admin()` only accepted an org-level `admin`, so founders (org-level `super_admin` from `launch-organization`) failed it. It now accepts org-level `admin`/`super_admin`, or `super_admin` on any department (matching `RoleContext.jsx`).
- `is_org_admin()` is unscoped ("admin of *some* org"), so policies use the new `is_admin_of_org(org_id)`.

---

## 4. Access model

Implemented with `SECURITY DEFINER` helper functions used by RLS policies:

| Helper | Meaning |
|---|---|
| `current_org_id()` | The caller's organization (from `public.users`) |
| `is_org_admin()` / `is_admin_of_org(org)` | Org-wide admin, optionally pinned to one org |
| `has_team_access(dept)` / `team_role_at_least(dept, role)` | Department membership / minimum role |
| `is_project_member(project)` | Row in `project_members` |
| `has_project_access(project)` | Department member **or** project member **or** org admin |
| `can_edit_project(project)` | Department member+ **or** project member **or** org admin |
| `can_manage_project(project)` | Department team lead+ **or** org admin |
| `can_see_channel(ch)` / `can_manage_channel(ch)` | Public channel: scope access; private: members + creator |
| `can_see_activity(...)` | Own actions, or org colleagues' on projects you can access |
| `mfa_satisfied()` | Passed second factor, or has no verified factor (§7) |

**Product decision (user's choice):** people added to a project directly get access to that project's tasks, files and chat **without** joining its department ("project-only access").

---

## 5. Edge functions

All function source now lives in `supabase/functions/`. Previously only `invite-department-member` was in the repo, and it had never been deployed.

| Function | Purpose | Changes |
|---|---|---|
| `send_email` | Webhook on `notification_queue` insert | Only accepts the service-role key (`_shared/webhookAuth.ts`); escapes user text; links must be http(s); sender from `EMAIL_FROM` |
| `send-notification` | Webhooks on `tasks`, `project_members` | Same lock-down; was callable by anyone (JWT check off) and sent from `onboarding@resend.dev` |
| `invite-department-member` | Department invites | **First deployment**; escapes names in email; profile `upsert` (trigger creates row first) |
| `invite-team-post-launch` | Team invites | Caller must belong to the target org; team space must belong to it; role allow-list; LIKE-wildcard fix |
| `delete-workspace-item` | **New.** Deletes a project/department | Removes stored files, chat channels and attachments first, then rows; permission checked as the caller |
| `change-password` | **New.** Password change | Verifies current password on a throwaway client; signs out other sessions (§7) |
| `launch-organization`, `my-space`, `search` | Unchanged logic | Downloaded into the repo |

Shared helpers: `_shared/cors.ts`, `_shared/webhookAuth.ts` (constant-time service-key check), `_shared/html.ts` (`escapeHtml`, `safeUrl`), `_shared/mfa.ts` (`requireMfa`).

**Secrets** (Edge Functions → Secrets): `RESEND_API_KEY` (mayormoris account), `EMAIL_FROM` = `Spacer <noreply@spacer.ink>`, `SITE_URL`. `RESEND_API_KEY_NOTIFICATION` was deleted (unused).

**Deploy command:**
```bash
npx supabase functions deploy <name> --project-ref vrzepdjjjpodztqkfsbh --use-api
```

---

## 6. File storage

- **`project-files` bucket → private** (migration `…120000`). It was public: anyone could list and download every file, and any signed-in user of any org could delete. Access now follows project access, using the `<project_id>/…` path prefix.
- **`chat-attachments` bucket → new, private** (migration `…130000`). Group chat previously saved a browser-local `blob:` URL, so nobody else could open attachments. Path is `<channel_id>/<message_id>/<file>`, limited to 5 MB, images/PDF/text only.
- The app opens files through **signed links valid for 1 hour**: `src/storageLinks.js` (`createSignedLinks`), `src/projectFiles.js` (`withSignedUrls`). Permanent public URLs are no longer stored.
- Deleting a project/department removes its stored files (`delete-workspace-item`).

---

## 7. Two-factor authentication & password change

### F-01: Two-factor (Supabase Auth MFA, authenticator app/TOTP)
The old 2FA was fake. It accepted any 6 digits, never asked at login, generated secrets with `Math.random()`, showed a hardcoded secret, and had a "vault" whose key sat next to the data. All of it was removed, including `src/utils/crypto.js`. Settings.jsx shrank from 1,530 to ~1,050 lines.

New implementation:
- **`src/components/TwoFactorSettings.jsx`** (Settings → Security):
  - enable: enroll → QR code/secret → verify a code;
  - disable: verify a current code → unenroll.
- **`src/components/MfaChallenge.jsx`:** full-screen code prompt.
- **`src/App.jsx`:** `needsSecondFactor(session)` reads the session's `aal` claim and verified factors locally (no Supabase call inside `onAuthStateChange`, which can deadlock). If the account has a verified factor but the session is `aal1`, only the code prompt renders. This covers password sign-in, Google sign-in and restored sessions.
- **Server enforcement:**
  - migration `20261018090000_enforce_mfa.sql` adds `mfa_satisfied()` and a **restrictive** `mfa_required` policy on every public table and `storage.objects`;
  - the service-role edge functions call `requireMfa()`.

  Dry run result: a user with MFA at `aal1` saw 0 tasks/users/files and could not write; at `aal2` everything returned; users without MFA were unaffected.

### X-04: Password change requires the current password
- New edge function **`change-password`**:
  - verifies the current password on a throwaway client, so the user's own session isn't replaced or downgraded from `aal2`;
  - revokes that verification session;
  - updates the password via the admin API;
  - signs out the user's **other** sessions.
- Minimum length is now **8**. Google-only accounts get a clear message.
- Frontend: `src/passwordChange.js`; a "Current Password" field in Settings → Security.
- `Profile.jsx`'s password handler was updated too, but Profile renders no password form (dead code).

### Remember this device for 7 days
At the user's request, the code isn't asked on every sign-in.
- After a code is entered (session at `aal2`), the code screen's **"Remember this device for 7 days"** checkbox (ticked by default) calls `trust_this_device()`. It returns a random 64-hex token; only its SHA-256 hash is stored, in `mfa_trusted_devices`.
- The browser keeps the token (`src/trustedDevice.js`) and sends it as the **`x-mfa-device`** header on every Supabase request. `src/supabase.js` uses a custom `fetch`, so the database, storage and edge functions all receive it.
- `mfa_satisfied()` now also accepts a valid, unexpired token belonging to the caller (`is_trusted_device()`). `App.jsx` asks the server with `is_trusted_device` before skipping the prompt.
- **Revocation:**
  - turning 2FA off forgets all devices;
  - Settings → Security → **Forget remembered devices**;
  - a password change forgets all devices except the current one.
- Edge functions forward the header (`callerHeaders()` in `_shared/mfa.ts`), and CORS allows it.
- Dry run results:
  - a token can't be issued without a code;
  - the right token gives access, while a wrong token or no token gets 0 rows;
  - another user can't use your token;
  - access stops after "forget".
- **Not yet confirmed:** whether Supabase Storage applies the header for remembered sessions. Check that project files open after a remembered sign-in.

### React Compiler gotcha
The project uses the React Compiler, which reads values used inside event handlers **during render** to memoize them. `TwoFactorSettings` read `factor.id` in a handler while `factor` was `null`, which crashed the Security tab into a blank page. Use optional chaining (`factor?.id`) for state that can be null, even inside handlers.

### Go-live order (important)
1. Supabase → Authentication → Multi-Factor: **Authenticator app (TOTP)** enabled.
2. Run `20261018090000_enforce_mfa.sql`.
3. Deploy `change-password`, `delete-workspace-item`, `invite-department-member`, `invite-team-post-launch`, `launch-organization`. They call `mfa_satisfied()`, so deploying before step 2 breaks them.

---

## 8. Bug fixes & feature work

| Item | Problem | Fix |
|---|---|---|
| **B-01** Task status reset | Project page, Home, Calendar and Tasks recalculated status from subtasks on every load; tasks with no subtasks were forced to "todo" and **saved back** | Read paths show stored status; shared `src/taskStatus.js`; subtasks set status only when ticked |
| Kanban drag-and-drop | Handlers existed but nothing was draggable/droppable | Wired cards and columns; drop highlight; rollback + message on failure; `.select()` confirms the update |
| Kanban rules (user's choice) | Subtasks blocked moves; overdue tasks "trapped" | **No subtask restrictions** on manual moves; **Overdue column kept**; overdue cards show their real status label |
| **B-02** Deletes | Already cascaded in the DB, but orphaned stored files/chat; refused deletes looked successful; department warning understated | `delete-workspace-item`; errors shown; accurate warning (`src/workspaceDelete.js`) |
| Assignee list | Only department members could be assigned | Includes project members (`CreateTaskModal.jsx`); sidebars list directly-joined projects (`partials/projectMemberships.js`) |
| Departments not visible | Org-level admins weren't treated as org-wide; sidebar `.maybeSingle()` broke with several memberships | `RoleContext.jsx` treats org-level `admin` like `super_admin`; `SidebarRouter.jsx` uses RoleContext |
| DM pins/reactions | Wrote to columns that didn't exist | `direct_messages.pinned` + `toggle_dm_pin()`; new `direct_message_reactions` table (migration `…140000`) |
| DM auto-scroll | 3-second polling scrolled to the bottom every time | Scrolls only on open, own message, or new message while near the bottom |

---

## 9. Frontend hardening

- **F-02 / F-03 fake integrations:** the GitHub "OAuth" popup (`public/github-oauth.html`, spoofable via `postMessage(..., '*')`) was deleted. GitHub, Slack and Personal Access Tokens now show as disabled `ComingSoonCard`s, and integration defaults no longer claim Slack/Figma are connected.

- **X-01 XSS through URLs:** `src/safeUrl.js` (`safeHttpsUrl`, `safeImageDataUrl`, `safeDownloadDataUrl`) applied to DM attachments and `DocViewer.jsx`. 14/14 checks pass (blocks `javascript:`, `data:text/html`, SVG, foreign `http:`). Also fixed null `type` crashes.
- **X-07 dependencies:** `package-lock.json` pinned vulnerable react-router **7.11.0** (a local install happened to have 7.18.1). `npm audit fix` brought it to **7.18.4** plus build-tool patches. `npm audit` now reports **0** in both `package.json` folders.
- **Known and accepted:** Office files preview through Google's document viewer, which receives a 1-hour signed link.

---

## 10. Migrations & rollback scripts

All in `supabase/migrations/`; undo scripts in `supabase/rollback/`. Migrations were applied by pasting into the Supabase SQL Editor (the assistant's tooling isn't permitted to write to production).

| Migration | Applied | Undo script |
|---|---|---|
| `20261016120000_handle_new_user.sql` | ✅ | n/a |
| `20261017070000_enable_rls_group1.sql` | ✅ | ✅ |
| `20261017080000_project_member_access.sql` | ✅ | n/a (part of group 2's undo) |
| `20261017090000_enable_rls_group2.sql` | ✅ | ✅ |
| `20261017100000_enable_rls_group3.sql` | ✅ | ✅ |
| `20261017110000_enable_rls_group4.sql` | ✅ | ✅ |
| `20261017120000_private_project_files_bucket.sql` | ✅ | ✅ |
| `20261017130000_chat_attachments_bucket.sql` | ✅ | ✅ |
| `20261017140000_dm_pins_and_reactions.sql` | ✅ | ✅ |
| `20261018090000_enforce_mfa.sql` | ✅ | ✅ |
| `20261019090000_mfa_trusted_devices.sql` | ✅ | ✅ |

Undo scripts restore the **previous, insecure** state. Use them only to unblock the app while a policy is fixed.

---

## 11. Operations runbook

- **Email not arriving:**
  - Supabase → Logs → Auth: the SMTP error text is in the event message;
  - Resend → Logs;
  - Resend free plan limit: 100/day.
- **User lost their authenticator:** Supabase → Authentication → Users → user → remove MFA factor. Supabase TOTP has no backup codes.
- **Read-only database checks** (CLI is logged in):
  ```bash
  npx supabase db query --linked --project-ref vrzepdjjjpodztqkfsbh "select ..."
  ```
- **Duplicate account (deferred):** one person has a login with no profile because a typo'd second account holds the same email in its profile. A tested merge script exists (kept out of the repo because it contains a personal email). There are also ~10 test signups from 21 Aug with fake domains.

---

## 12. How changes were verified

- **Database changes:** each migration was first run inside `BEGIN … ROLLBACK` against production. It simulated users via `SET LOCAL ROLE authenticated` plus `request.jwt.claims` (anonymous, org admin, department admin, project-only member, other-organization user), and checked both allowed and forbidden actions. Nothing was persisted until the user ran the migration.
- **Edge functions:** `deno check` type-check before deploy; unauthenticated/anon calls confirmed as 401.
- **Frontend:** `eslint` (no new problems introduced; several files ended with fewer) and `vite build` after every change; production-preview route smoke test after the dependency upgrade.
- **Not covered:** there is still **no automated test suite**. Flows were verified manually by the user in the browser.

---

## 13. Remaining work (by priority)

**Before launch (Critical/High)**
1. S-01: untrack `.env` and root `node_modules`, add `.env.example`.
2. P-03: production URLs (`SITE_URL`, Supabase redirect URLs, Google OAuth).
3. P-02: SPA rewrite rule on the host.
4. P-01: build Tailwind instead of loading it from the CDN.
5. B-04: errors swallowed while the UI shows success.
6. B-03: onboarding fails silently.
7. D-06: org/identity read from user-editable metadata or localStorage.
8. P-07: error boundary, monitoring, tests. (A missing error boundary turned a single component crash into a blank page on 19 Oct.)

**Medium:** F-07 invented data, F-05 standups localStorage fallback, B-06 project fields not saved/editable, B-07 DM duplicates/false unread, X-05 email change half-applied, X-08/X-03 DM base64 attachments and file-name sanitising, P-04 polling and unbounded queries, B-05 sprint completion not logged.

**Low:** B-08 small bugs, P-05 bundle size, P-06 very large files, P-08 lint, account cleanup, signup activity-log insert.

**To re-check** (may already be resolved): S-04 missing tables/columns, X-06 edge function issues.
