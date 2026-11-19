# How existing PM tools move tasks automatically from GitHub commits, branches and PRs

Research date: 2026-11-19. Sources are official docs fetched on this date unless marked "community" or "third-party". ClickUp's help center returned HTTP 403 to automated fetches, so ClickUp facts come from search-result excerpts of its help/marketing pages and are less verified. Atlassian's automation tutorial page body could not be fetched, so the Jira automation-trigger facts lean on community threads (some several years old).

## 1. How is the task ID written and recognised?

### Takeaway
Everyone uses a short human key `PREFIX-NUMBER` (Jira `JRA-123`, Linear `ENG-123`, Plane `WEB-344`, Shortcut `sc-123`, ClickUp `CU-abc123`), or `#123` for GitHub/GitLab. It is scanned in four places: branch name, PR title, PR description/body and commit message. Branch name and PR title are the main ways a link gets made. Commit messages usually need an explicit keyword or bracket before anything changes.

### Cited Findings
**GitHub (native closing keywords)**
- Syntax: `KEYWORD #ISSUE-NUMBER` (same repo) and `KEYWORD OWNER/REPOSITORY#ISSUE-NUMBER` (cross-repo). Each issue in a multi-issue reference needs its own keyword, e.g. `Resolves #10, resolves #123, resolves octo-org/octo-repo#100`. — [GitHub Docs](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)
- Keywords are recognised in the **PR description** and in **commit messages**. The docs do not list the PR title as a source. — [GitHub Docs](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)
- Keywords are case-insensitive and may be followed by a colon: `Closes: #10`, `CLOSES #10`, `CLOSES: #10`. — [GitHub Docs](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)
- Manual linking from the PR or issue "Development" sidebar requires write permission and allows at most 10 issues per PR. — [GitHub Docs](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)

**Jira**
- Branch: key in the branch name, e.g. `git checkout -b JRA-123-<branch-name>`. Commit: key in the message, e.g. `git commit -m "JRA-123 <commit message>"`. PR: the key in the PR title, or in the source branch name (Bitbucket Cloud also accepts a non-merge commit). — [Atlassian: Reference work items in your development work](https://support.atlassian.com/jira-software-cloud/docs/reference-issues-in-your-development-work/)
- Keys must be in capitals ("JRA-123", not "jra-123"). Smart Commits "only support the default Jira Software work item key format": two or more uppercase letters, a hyphen, then the number. — [Atlassian: Reference work items](https://support.atlassian.com/jira-software-cloud/docs/reference-issues-in-your-development-work/); [Atlassian: Smart Commits](https://support.atlassian.com/jira-software-cloud/docs/process-issues-with-smart-commits/)
- Creating a branch or PR from the work item's Development panel inserts the key automatically. A full sync can take "a few minutes" after a push. — [Atlassian: Reference work items](https://support.atlassian.com/jira-software-cloud/docs/reference-issues-in-your-development-work/)

**Linear**
- Branch name containing the issue ID links the branch/PR. A "Copy git branch name" shortcut (Cmd/Ctrl+Shift+.) generates a compatible name. PR title/description: the ID, optionally after a magic word. Commits need a magic word before the ID, plus the webhook and the "Link commits to issues with magic words" toggle. — [Linear Docs: GitHub](https://linear.app/docs/github)
- One magic word can be followed by several IDs. Magic words in PR **comments** do not create links. `skip` or `ignore` before an ID (e.g. "Ignore ENG-123") prevents linking. `{TEAM}-NEW` (e.g. `ENG-NEW`) creates a new linked issue. — [Linear Docs: GitHub](https://linear.app/docs/github)
- The docs do not say whether IDs or magic words are case-sensitive. — [Linear Docs: GitHub](https://linear.app/docs/github)

**Shortcut**
- Branch must contain `/sc-<story-id>/`. A custom branch format is allowed (Integrations > VCS > Git Branch Formatting) as long as it keeps `/sc-<story-id>/`. — [Shortcut Help: GitHub](https://www.shortcut.com/help/integrations/github)
- `[sc-123]` or the full Story URL in a branch, commit message, PR title, PR description or PR comment links the work. Multiple stories: `[sc-123][sc-456]`. `[sc-new-story]` creates and links a new Story. — [Shortcut Help: GitHub](https://www.shortcut.com/help/integrations/github)

**ClickUp** (less verified, see note at top)
- A task can be referenced as `#{task_id}`, `CU-{task_id}` (e.g. `CU-1abc2de`) or `{custom_task_id}` in a PR title, PR description, branch name or commit message. — [ClickUp Help: GitHub (search excerpt)](https://help.clickup.com/hc/en-us/articles/6305771568791-GitHub)

**Asana**
- The official "Attach pull request to Asana task" GitHub Action looks for an Asana **task URL** in the PR description. Asana has no short task key. — [GitHub Marketplace: Asana action](https://github.com/marketplace/actions/attach-pull-request-to-asana-task)

**GitLab**
- Formats: `#123`, `group/project#123`, or a full issue/work-item URL. Recognised in commit messages and merge request (MR) descriptions. — [GitLab Docs: Managing issues](https://docs.gitlab.com/user/project/issues/managing_issues/)

**Plane**
- Key format `WEB-344`. Recognised in branch names, PR titles/descriptions and commit messages. This is a Pro-only "Development" feature. — [Plane Docs: GitHub](https://docs.plane.so/integrations/github)
- Brackets change the meaning: `[WEB-344]` turns on state automation, while a plain `WEB-344` only links. — [Plane Docs: GitHub](https://docs.plane.so/integrations/github)

### Inferences
- The proven convention for Spacer is a team/project prefix plus a number (`SPC-123`), matched case-insensitively in the branch name, PR title and PR body, and matched in commits only when a keyword is present. Linear and Jira both ship a "copy branch name" helper so the ID lands in the branch without the developer typing it. That helper is the main reason linking works reliably.
- A suggested regex, consistent with Jira (uppercase letters, hyphen, digits) and with branch names that are usually lowercase: `\b([A-Za-z][A-Za-z0-9]{1,9})-(\d+)\b`. It should be validated against the workspace's actual prefixes so that strings like `utf-8` or `sha-256` do not match. This is my inference, not something a vendor documents.

### Gaps
- Linear's exact regex and case rules are not documented.
- ClickUp's current help article could not be fetched (403).

## 2. Magic words and which events trigger transitions

### Takeaway
There are two families of words. Closing words (close/fix/resolve and variants, plus "complete" and "implement" in Linear and GitLab) set the task to Done on merge. Referencing words ("ref", "part of", "related to") only link. GitHub and GitLab close only when the change reaches the **default branch**. Jira is the outlier: it uses explicit `#transition-name` commands in commit messages.

### Cited Findings
- **GitHub** closing words: close, closes, closed, fix, fixes, fixed, resolve, resolves, resolved. — [GitHub Docs](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)
- **GitHub** events: keywords in a PR description work only if the PR targets the default branch. If the PR targets any other branch, "the keywords are ignored, no links are created, and merging has no effect". Keywords in commit messages close the issue when the commit is merged into the default branch, and in that case the PR is not listed as a linked PR. — [GitHub Docs](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue)
- **Linear** closing words: close, closes, closed, closing, fix, fixes, fixed, fixing, resolve, resolves, resolved, resolving, complete, completes, completed, completing, implement, implements, implemented, implementing, "linear issue". Non-closing: ref, refs, references, part of, contributes to, toward, towards. Relation only: "relates to", "related to". — [Linear Docs: GitHub](https://linear.app/docs/github)
- **Linear**: closing words apply the "On PR or commit merge" status on merge. Non-closing words don't. Commits with a magic word move the issue to In Progress on push and to Done when the commit reaches the default branch. — [Linear Docs: GitHub](https://linear.app/docs/github)
- **Jira Smart Commits** syntax: `<ignored text> ISSUE_KEY <ignored text> #COMMAND <args>`. Commands are `#comment`, `#time 1w 2d 4h 30m`, and `#<transition_name>`, e.g. `JRA-090 #close #comment Fixed this today`. — [Atlassian: Smart Commits](https://support.atlassian.com/jira-software-cloud/docs/process-issues-with-smart-commits/)
- **Jira Smart Commits** rules: only the part of a transition name before the first space is used, so use hyphens for multi-word names (`#finish-work`) and fully qualify ambiguous names (`#start-review`). A command must not span more than one line. Keys may be separated by whitespace or commas. — [Atlassian: Smart Commits](https://support.atlassian.com/jira-software-cloud/docs/process-issues-with-smart-commits/)
- **Jira automation** (separate from Smart Commits): the standard pattern is a "Pull request merged" trigger with a "Transition issue" action. Atlassian publishes a template for it. — [Atlassian automation template: DevOps PR merged](https://wac-cdn-a.atlassian.com/software/jira/automation-template-library/devops-pr-merged); [Atlassian Community](https://community.atlassian.com/forums/Jira-questions/How-do-I-create-an-automation-that-when-a-Pull-request-is-merged/qaq-p/2642053)
- **Jira automation**: a "Commit created" trigger also exists, but it fires for every commit, including the one created by a PR merge, so it can fire too early. Classic workflow triggers are the alternative. — [Atlassian Community](https://community.atlassian.com/forums/Jira-questions/Transition-issue-when-pull-request-is-merged-on-a-specific/qaq-p/1028581)
- **Shortcut**: "commit verbs" defined in your Workflow move a Story, e.g. a commit containing the finish verb and `[sc-123]` can move the Story to a completed state. — [Shortcut Help: GitHub](https://www.shortcut.com/help/integrations/github)
- **Shortcut** event handlers fire on branch association, commit association, PR opened, approval, label, review request and merge. Draft PRs don't trigger handlers until they are opened. — [Shortcut Help: GitHub](https://www.shortcut.com/help/integrations/github)
- **ClickUp** status-change syntax: `#taskID[status]`, e.g. `#abc123[code review]`, in a commit message, branch name, or PR name/description. A feedback thread shows `#1234[closed]` as a shipped feature. — [ClickUp GitHub integration page (search excerpt)](https://clickup.com/integrations/github); [ClickUp feedback](https://feedback.clickup.com/integrations/p/link-github-to-clickup-tasks-automatically)
- **GitLab** keyword families: close, fix, resolve and implement, with case variants such as Closes, Fixes, Resolved and Implementing. Issues close when the commit is pushed to the default branch or the commit/MR is merged into it. `Closes #4, #6, Related to #5` closes #4 and #6 and only links #5. The default regex starts `\b((?:[Cc]los(?:e[sd]?|ing)|`, and self-managed admins can change it. — [GitLab Docs](https://docs.gitlab.com/user/project/issues/managing_issues/)
- **Plane**: state automation is driven by PR events (draft, opened, review requested, ready for merge, merged, closed-without-merge) for bracketed references. The docs describe no closing keywords. — [Plane Docs](https://docs.plane.so/integrations/github)
- **Asana**: the official Action runs on `pull_request` `opened`/`reopened` and attaches a live PR-status widget to the task. The docs don't say it completes tasks. Status notifications come from a separate `Asana/comment-on-task-github-action`. — [GitHub Marketplace: Asana action](https://github.com/marketplace/actions/attach-pull-request-to-asana-task)

### Inferences
- For Spacer, the simplest copy of a proven design is the GitHub/Linear word list. It uses closing words (close/fix/resolve/complete with tense variants), referencing words (ref/refs/part of/related to → link only) and ignore words (skip/ignore → no link).
- Jira-style `#transition` and ClickUp-style `#id[status]` commands are flexible but tie commits to status names. They are also the source of most of the "silently failed" complaints (see section 5).

### Gaps
- I could not find the exact list of Shortcut default commit verbs: its old commit help article now redirects to the help index.
- I could not fetch official Atlassian docs for the full list of Jira automation DevOps triggers (branch created, PR created, PR declined, etc.).

## 3. Default workflow mapping and per-team configurability

### Takeaway
The common default is: branch/first commit or PR opened → In Progress, (optional) review requested → In Review, merged → Done. Linear, Shortcut and Plane all let admins map each PR event to any status, per team (Linear) or per project (Plane). Linear and Plane also support rules per target branch.

### Cited Findings
- **Linear**: configured per team at Settings > Team > Workflows & automations > Pull request and commit automations. Triggers: PR drafted, opened, review requested, ready for merge, merged. Defaults: In Progress when a PR is open, Done when it merges. — [Linear Docs](https://linear.app/docs/github)
- **Linear**: "Ready for merge" needs GitHub to report a mergeable status, and any failing check (even a non-required one) blocks it. Without branch protection rules, issues skip the review state. — [Linear Docs](https://linear.app/docs/github)
- **Linear**: branch-specific rules apply to the **target** branch (e.g. `staging`, `main`), support regex such as `^fea/.*`, and can be set to "no action". Copying a branch name can move the issue to a started status and self-assign it. — [Linear Docs](https://linear.app/docs/github)
- **Shortcut**: event handlers are set at Integrations > VCS > Event Handlers. Each one is an event (optionally a branch or label) mapped to a destination Workflow State. — [Shortcut Help](https://www.shortcut.com/help/integrations/github)
- **Shortcut**: the integration only moves Stories forward. Moving one backward must be done manually. — [Shortcut Help (per search summary of help article)](https://help.shortcut.com/hc/en-us/articles/360023113952)
- **Plane**: admins map each GitHub PR state (Draft, Opened, Review requested, Ready for merge, Merged, Closed) to a Plane state, per Plane project. — [Plane Docs](https://docs.plane.so/integrations/github)
- **Jira**: there is no implicit mapping. Admins build automation rules (e.g. PR merged → Transition to Done, with the condition `development[pullrequests].open = 0`) or use Smart Commits. — [Atlassian Community](https://community.atlassian.com/forums/Jira-questions/How-do-I-create-an-automation-that-when-a-Pull-request-is-merged/qaq-p/2642053); [Atlassian template](https://wac-cdn-a.atlassian.com/software/jira/automation-template-library/devops-pr-merged)

### Inferences
- A Spacer v1 could ship fixed defaults and expose a small per-workspace mapping table, as Plane does:
  - PR opened → In Progress
  - Review requested → In Review
  - Merged to default branch → Done
  - Closed without merge → no change
- A "forward-only" rule, as in Shortcut, avoids surprise regressions.

### Gaps
- Linear's default for "PR closed without merge" is not documented.

## 4. Integration mechanism (GitHub App vs OAuth vs Action) and configuration

### Takeaway
Linear, Plane, Shortcut and Jira use an installed GitHub App or connector that receives webhooks, installed by an org owner or admin on all or selected repos. Users then optionally connect a personal GitHub account so actions are attributed to them. Asana is the exception: it uses a GitHub Action in the repo with a secret token.

### Cited Findings
- **Linear**: an org-level install needs a GitHub org owner. A repo admin can install it for repo-only access. Repos can be all or selected. PR linking and issue sync work without code access; a separate "Linear Code" app is needed for diffs. Members connect a personal GitHub account (Settings > Connected accounts) for attribution. — [Linear Docs](https://linear.app/docs/github)
- **Linear**: GitHub Enterprise Server supports PR linking and status automation, but not commit linking or issue sync. — [Linear Docs](https://linear.app/docs/github)
- **Plane**: Cloud users click Connect, pick an org/account and repos, then Install (a GitHub App). Enterprise Server and self-hosted users must create their own GitHub App. Personal account linking is optional; without it, comments appear as the Plane app. — [Plane Docs](https://docs.plane.so/integrations/github)
- **Shortcut**: only GitHub and Shortcut admins can install it, for all or selected repos. On GitHub Enterprise you add a webhook manually with the events Create, Delete, Comment, Pull Request and Push. — [Shortcut Help](https://www.shortcut.com/help/integrations/github)
- **Jira**: an admin connects GitHub. The open-source "GitHub for Jira" app is Atlassian's connector. — [Atlassian: Reference work items](https://support.atlassian.com/jira-software-cloud/docs/reference-issues-in-your-development-work/); [atlassian/github-for-jira discussions](https://www.github.com/atlassian/github-for-jira/discussions/2632)
- **Asana**: generate a token, store it as the repo secret `ASANA_SECRET`, and add a workflow file. Optional `allowed-projects`/`blocked-projects` inputs restrict targets, but setting both is an error. Requires Premium, Business or Enterprise. You can also add the GitHub app to a project via Customize > Apps. — [GitHub Marketplace: Asana action](https://github.com/marketplace/actions/attach-pull-request-to-asana-task); [Asana Forum](https://forum.asana.com/t/github-asana-drive-visibility-and-transparency-across-teams/141578)
- **Linear** two-way issue sync is limited to one repo per team. Only new issues sync. — [Linear Docs](https://linear.app/docs/github)

### Inferences
- A GitHub App is the market standard. It uses per-installation tokens, lets the installer choose repos, and delivers webhooks centrally.
- A GitHub Action (the Asana model) is the cheapest to build: there is no app to register and the user pastes a token. The costs are per-repo setup and a secret that has to be managed.

### Gaps
- Whether Shortcut's install is a GitHub App or an OAuth flow is not stated in its docs.

## 5. Safeguards, attribution, audit and pitfalls

### Takeaway
The proven safeguards are:
- Close only on the default branch (GitHub, GitLab, Linear commits).
- Check the permissions of the person merging (GitLab) or of the committer, matched by email (Jira, Shortcut).
- Use opt-out tokens (`skip`/`ignore`, `[skip-sc]`).
- Wait until all linked PRs are merged (Linear, Shortcut, Jira condition).
- Post link-back comments on PRs.

Known pitfalls:
- Squash or rebase merges drop or duplicate commit keywords.
- Silent failures from email mismatches or required fields.
- Accidental "fix" words closing issues.
- Closures that are not reversed when a merge is reverted.
- Branch-filter conditions that are unreliable in Jira.

### Cited Findings
**Safeguards**
- **GitHub/GitLab**: only default-branch merges or pushes close issues. — [GitHub Docs](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue); [GitLab Docs](https://docs.gitlab.com/user/project/issues/managing_issues/)
- **GitLab** checks the merging user's permission to close the targeted issues, noting that in public repos external users can author closing patterns. Maintainers can disable "Auto-close referenced issues on default branch" per project. Auto-close is skipped on the very first push of an existing repo. — [GitLab Docs](https://docs.gitlab.com/user/project/issues/managing_issues/)
- **GitLab**: "When you merge a merge request, it's your responsibility to check that it's appropriate for any targeted issues to close". Once auto-merge is on, the list of issues to close can't be changed. — [GitLab Docs](https://docs.gitlab.com/user/project/issues/managing_issues/)
- **Jira**: the committer email must match exactly one Jira user who has the needed permission. Otherwise the action fails but the commit is still linked. Failures are emailed, or "in rare cases" fail silently. A transition "will silently fail" if other required fields exist. — [Atlassian: Smart Commits](https://support.atlassian.com/jira-software-cloud/docs/process-issues-with-smart-commits/)
- **Shortcut**: activity is matched to members by primary GitHub email. A story with another open PR or an unmerged branch counts as pending work and delays handlers. `skip-sc` or `[skip-sc]` blocks handlers. — [Shortcut Help](https://www.shortcut.com/help/integrations/github)
- **Linear**: with several PRs on one issue, the status changes only when the last PR reaches the required state. Cancelling an issue or marking it a duplicate closes its open linked PRs; completing it doesn't. Merge queues need an `externally-merged` label. — [Linear Docs](https://linear.app/docs/github)
- **Linear**: posts a linkback comment (issue title and description) on linked PRs, commits and issues. It can be turned off, and titles are omitted for private teams. — [Linear Docs](https://linear.app/docs/github)
- **Plane**: comments appear under the linked GitHub user, or under the app's name otherwise. — [Plane Docs](https://docs.plane.so/integrations/github)
- **Jira**: you can wait for all PRs with the JQL condition `development[pullrequests].open = 0`. — [Atlassian Community](https://community.atlassian.com/forums/Jira-questions/How-do-I-create-an-automation-that-when-a-Pull-request-is-merged/qaq-p/2642053)

**Pitfalls**
- **Jira**: rewriting history (`git push --force`, `git merge --squash`) can re-run Smart Commit commands so they "appear duplicated". Atlassian advises against putting commands in PR titles, since they may be copied into the merge commit. — [Atlassian: Smart Commits](https://support.atlassian.com/jira-software-cloud/docs/process-issues-with-smart-commits/)
- **Jira** (community): a branch filter on `{{pullRequest.destinationBranch.name}}` often fails to match, including on GitHub Enterprise, and `isMergeCommit` is reportedly always false for GitHub. These threads may be outdated. — [Atlassian Community](https://community.atlassian.com/forums/Jira-questions/Transition-issue-when-pull-request-is-merged-on-a-specific/qaq-p/1028581); [Atlassian Community (Enterprise)](https://community.atlassian.com/forums/Jira-Service-Management/Jira-Automation-Not-Working-Move-Issue-When-PR-is-Merged-Based/qaq-p/3008704)
- Squash merges can drop the "Closes" line from the commit message, leaving the issue open (GitLab reports). — [GitLab issue 285300](https://gitlab.com/gitlab-org/gitlab/-/issues/285300); [GitLab issue 29152](https://gitlab.com/gitlab-org/gitlab/-/issues/29152)
- A commit message that accidentally used "fix" closed a GitHub issue. Users also ask that closing a PR (without merging) should not close its linked issues. — [GitHub Community #66741](https://github.com/orgs/community/discussions/66741); [GitHub Community](https://github.community/t/merging-linked-prs-did-not-closes-the-associated-issues/187042)
- GitHub forgets which issues to close when a PR is not merged into the default branch. A third-party tool tries to preserve them. — [refined-github issue (via lightrun)](https://lightrun.com/answers/refined-github-refined-github-clear-pr-merge-commit-message-should-preserve-which-issues-a-pr-closes-when-it-is-not-merged-into-)
- Asana has no native matching key, so third-party connectors match a PR to a task by URL or branch naming. Matching is described as the weak point. — [Nira guide (third-party)](https://nira.com/asana-github-integration/)

### Inferences
Suggested Spacer rules, all copied from the practices above:
- **Default branch only**: close tasks only on a merge or push to the default branch.
- **Key on PR events, not commits**: drive status changes from the PR description and title, with commits as a secondary source. This avoids squash and rebase problems.
- **Idempotency**: store the processed webhook delivery ID and the commit SHA so that force-pushes and re-deliveries don't duplicate transitions.
- **Attribution**: require a linked GitHub↔Spacer account, or treat activity as unattributed. Never act as an unmatched user.
- **Scope**: act only on tasks in the workspace connected to that repo, which prevents cross-workspace closure.
- **Multiple PRs**: move to Done only when all linked PRs are merged.
- **Opt-out**: support a `skip`/`ignore` token.
- **Audit**: log every automatic transition in the activity feed with the PR or commit link, and optionally post a link-back comment.

### Gaps
- Revert handling: none of the official docs say whether reverting a merged PR reopens a task. GitHub appears not to reopen, based on community anecdote only.
- Fork PRs: no vendor documents how fork PRs are treated. GitLab's note that external users in public repos can author closing patterns is the closest finding.
- I found no first-party Asana help-center article describing automatic task completion. Third-party connectors claim it.
