# Spacer: Security Hardening & Fixes Log

**Period:** 16–19 October 2026, updated 21 November 2026
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
| Row-level security on all public tables (28 in Oct, 39 on 21 Nov) | ✅ Live (was off on 22); re-checked 21 Nov |
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
| Two-factor required for every account, with a fixed exemption list | ↩️ Turned off 24 Nov (optional again, by decision): `20261124100000_mfa_optional` |
| Two-factor rule on every user-data table (incl. `project_departments`) | ✅ Live (21 Nov) |
| CAPTCHA (Cloudflare Turnstile) on sign-in, sign-up, reset | ✅ In the app (19 Nov); on only when `VITE_TURNSTILE_SITE_KEY` is set |
| Password rules: 8+ chars, upper + lower case, number, symbol | ✅ Live (19 Nov), checked again on the server |
| Permission-based access (RBAC) | ✅ Live (12–20 Nov), see `docs/RBAC.md` |
| D-06: organization and user id only from the database / session | ✅ Done (21 Nov) |
| Cross-organization Owner grant: an organization's owner could make an account in another organization its Owner | ✅ Live (24 Nov, `20261124090000_pin_org_roles_to_org`); attack re-tested on live and refused. See `docs/RBAC.md` §3 |

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
- Minimum length is now **8**. Google-only accounts get a clear message. (Tightened on 19 Nov: see "Password rules" below.)
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

### Two-factor required for every account (19–21 Nov)
- Migration `20261120110000_require_mfa` (written as `20261119090000` on `Test-phase`, renumbered on `22's`): a signed-in account gets **no data** until it has an authenticator and has passed it (`aal2`) or uses a remembered device. `mfa_required_for_caller()` is the one place that decides who must use it.
- The app checks `mfa_setup_required()` after sign-in and shows `MfaSetupRequired` instead of an empty app. Settings no longer offers "Turn off 2FA" to accounts that must use it.
- Edge functions follow the same rule through `_shared/mfa.ts`.

### Two-factor optional again (24 Nov)
- Decided by the team: CAPTCHA (Cloudflare Turnstile) is on, and required two-factor was switched off. It was first done by hand in the SQL Editor; migration `20261124100000_mfa_optional` records it (`mfa_required_for_caller()` returns false).
- Nobody is asked to set up two-factor, and an account without an authenticator gets its data with a password only. An account that has one still must enter its code (or use a remembered device). Settings offers turning it off again (after a code).
- Note: CAPTCHA stops scripted sign-in attempts; it doesn't protect an account whose password is known. Turn the requirement back on with the rollback `20261124100000_mfa_optional_rollback.sql` (keeps the exemption list).

### Two-factor recovery (24 Nov)
- Before: no recovery codes; a lost phone meant an admin deleting the factor in the Supabase dashboard. Migration `20261124110000_mfa_recovery` + edge function `mfa-recovery` add two ways back in (the user chose both).
- **Recovery codes.** 10 one-time codes shown once after turning two-factor on, and on demand in Settings ("Create new codes", which asks for an authenticator code). Only a session that just passed a code (`aal2`) can create them; a remembered device isn't enough. Stored as `sha256(user id:code)`; tables `mfa_recovery_codes` and `mfa_recovery_attempts` have RLS on, no policies, no grants. 5 wrong codes in 15 minutes lock recovery for that person (advisory lock per person, so parallel guesses count). Turning two-factor off deletes the codes.
- **Using a code.** The code screen has "Lost your phone? Use a recovery code" (a password session, `aal1`). The edge function checks the code, deletes the person's authenticators through the admin API, then `finish_two_factor_reset()` deletes their other codes and remembered devices, signs out their other sessions (rows in `auth.sessions`; the one that used the code stays), logs `user:two_factor_reset` and emails them.
- **Admin reset.** Directory → person → "Reset two-factor", for holders of `member.reset_two_factor` (Owner and Organization Admin) who have two-factor on and signed in with their code (`aal2`; a password or a remembered device isn't enough). `check_two_factor_reset()` refuses: yourself, people in another organization, and an organization admin unless the caller is the Owner. Same clean-up, log and email.
- A recovery code is given back if removing the authenticator fails afterwards. Wrong attempts older than a day are deleted.
- Known limits: someone with a person's password can lock that person's recovery for 15 minutes at a time (they can't use up real codes). An Owner with no codes and no other Owner needs the Supabase dashboard (Authentication → Users → the user → delete the MFA factor). Access tokens already issued work until they expire (about an hour) after other sessions are signed out. Codes are hashed with the user id but no server secret, so a database leak would let someone brute-force one code (50 bits) offline.
- After either, the person signs in with a password only until they set two-factor up again (it's optional); if two-factor is required again, they get the setup screen.

### Exemption list (21 Nov)
- Migration `20261121090000_mfa_exempt_users`: table `mfa_exempt_users` (RLS on, no policies, no grants), so only the SQL Editor can read or change it. `mfa_required_for_caller()` skips accounts on it.
- Filled with the **16 `@redtech.inc` accounts** that existed on 21 Nov, by user id. People who sign up later with that domain are not exempt. The migration refused to run unless the count was exactly 16.
- An exempt account that has set up an authenticator is still asked for its code until the factor is removed (one account on 21 Nov).
- Add someone: `insert into public.mfa_exempt_users (user_id, reason) select id, '<why>' from auth.users where email = '<email>';`. Remove: `delete from public.mfa_exempt_users where user_id = (select id from auth.users where email = '<email>');`.

### `project_departments` two-factor rule (21 Nov)
- The table (cross-department projects) was created without the restrictive `mfa_required` policy. Migration `20261121100000_project_departments_mfa` adds it. Checked live afterwards.
- Tables without `mfa_required`, on purpose: `mfa_exempt_users`, `task_due_reminders`, `task_key_counters` (no policies, unreachable from the app) and `rbac_roles`, `rbac_permissions`, `rbac_role_permissions` (role and permission names only, readable by signed-in users).

### CAPTCHA and password rules (19 Nov)
- **CAPTCHA:** Cloudflare Turnstile on Login, Signup, Forgot Password and the "resend confirmation" buttons (`src/captcha.js`). Off until `VITE_TURNSTILE_SITE_KEY` is set; Supabase's CAPTCHA protection must be on with the matching secret.
- **Passwords:** 8+ characters with an uppercase and a lowercase letter, a number and a symbol, matching Supabase's "lowercase, uppercase letters, digits and symbols" setting. Shown under every password field, checked on sign-up, reset, first password and Settings, and again in `change-password` on the server.
- `change-password` verifies the current password with the service-role key so Supabase's sign-in CAPTCHA can't block it.

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
| `20261026090000` to `20261112090000` (15 migrations: notify lock, project columns, standups, atomic launch, DM attachments bucket, sprints, notifications, deadlines, leave/remove from organization, and others) | ✅ | ✅ |
| `20261112100000_rbac_foundation.sql`, `20261112110000_rbac_rules.sql`, `20261114090000_assign_roles.sql` | ✅ | ✅ |
| `20261113090000_activity_log_organization.sql` | ✅ | ✅ |
| `20261119090000_meetings.sql`, `20261119100000_task_keys.sql`, `20261119120000_task_comments.sql` | ✅ | ✅ |
| `20261120090000_project_departments.sql`, `20261120100000_cross_department_projects.sql`, `20261120120000_cross_department_permissions.sql` | ✅ | ✅ |
| `20261120110000_require_mfa.sql` | ✅ | ✅ |
| `20261120130000_user_availability.sql` | ✅ | ✅ (committed on `22's` on 22 Nov, merged in `cf0f14a`) |
| `20261121090000_mfa_exempt_users.sql` | ✅ | ✅ |
| `20261121100000_project_departments_mfa.sql` | ✅ | ✅ |
| `20261121110000_sync_user_email.sql` | ✅ | ✅ |
| `20261124090000_pin_org_roles_to_org.sql` | ✅ (24 Nov) | ✅ |

Undo scripts restore the **previous, insecure** state. Use them only to unblock the app while a policy is fixed.

Since November migrations are applied with `supabase db push` or the SQL Editor; the live list is in `supabase_migrations.schema_migrations`. `Test-phase` and `22's` once used the same numbers for different migrations; `22's` renumbered (`2e4ea8b`) and `Test-phase` took that in (`cd22380`). Since `cf0f14a` the repo has every migration on the live database.

---

## 11. Operations runbook

- **Email not arriving:**
  - Supabase → Logs → Auth: the SMTP error text is in the event message;
  - Resend → Logs;
  - Resend free plan limit: 100/day.
- **User lost their authenticator:** Supabase → Authentication → Users → user → remove MFA factor. Supabase TOTP has no backup codes.
- **Read-only database checks** (CLI is logged in):
  ```bash
  npx supabase db query --remote=vrzepdjjjpodztqkfsbh --read-only "select ..."
  ```
- **Snapshots:** `npm run db:schema` writes the live structure to `supabase/schema/schema.sql`; `npm run db:backup` saves every public table's rows to `supabase/backups/<time>/` (git-ignored, real user data; not `auth` users or stored files). Both are read-only.
- **Duplicate account (deferred):** one person has a login with no profile because a typo'd second account holds the same email in its profile. A tested merge script exists (kept out of the repo because it contains a personal email). There are also ~10 test signups from 21 Aug with fake domains.

---

## 12. How changes were verified

- **Database changes:** each migration was first run inside `BEGIN … ROLLBACK` against production. It simulated users via `SET LOCAL ROLE authenticated` plus `request.jwt.claims` (anonymous, org admin, department admin, project-only member, other-organization user), and checked both allowed and forbidden actions. Nothing was persisted until the user ran the migration.
- **Edge functions:** `deno check` type-check before deploy; unauthenticated/anon calls confirmed as 401.
- **Frontend:** `eslint` (no new problems introduced; several files ended with fewer) and `vite build` after every change; production-preview route smoke test after the dependency upgrade.
- **Tests:** `npm test` runs 218 unit tests (21 Nov). There are still no end-to-end browser tests; flows are verified manually by the user in the browser.

---

## 13. Remaining work (by priority)

**Done since 19 Oct:** S-01 (`.env` untracked, `.env.example`), P-01 (Tailwind built, no CDN), P-02 (`vercel.json` rewrite), D-06 (Department/Home read the organization only from `users`; Reports takes the user id from the session), P-07 error boundary (`components/ErrorBoundary.jsx`) and unit tests, B-04 (failed saves in DMs, group chat, preferences and file deletes now say so, `1331640`), B-03 (a failed organization load shows a retry screen instead of `/welcome`, `3f92d63`), F-07 and F-05 (seat bar, unsaved auto-join switch and the stand-ups' browser fallback removed on `22's`, `9046f61`), X-05 (confirmed email changes copied to `users`; Profile says when confirmation is needed, `57d860d`).

**Before launch (Critical/High)**
1. P-03: production URLs (`SITE_URL`, Supabase redirect URLs, Google OAuth).
2. P-07: monitoring (no error reporting from the live site yet).
3. Confirm project files open after a remembered-device sign-in (§7).

**Medium:** B-06 project fields not saved/editable, B-07 DM duplicates/false unread, X-08/X-03 DM attachment file-name sanitising (base64 attachments replaced by a private bucket on 30 Oct), P-04 polling and unbounded queries, B-05 sprint completion not logged.

**Low:** B-08 small bugs, P-05 bundle size, P-06 very large files, P-08 lint, account cleanup, signup activity-log insert.

**To re-check** (may already be resolved): S-04 missing tables/columns, X-06 edge function issues.
