# GitHub to Supabase Edge Function: plumbing options and security (as of Nov 2026)

Scope: three ways GitHub can tell an external app (a Supabase Edge Function on Deno, in front of Postgres with RLS) that someone pushed or merged, plus how to verify, store secrets, deduplicate, and resist abuse. All facts carry a source; anything unsourced is under Inferences or Gaps.

## Option A: a GitHub Actions workflow in each repo that calls an HTTPS endpoint

### Takeaway
Actions works, and the secret stays in GitHub's Actions secrets. But it needs a workflow file in every repo. It burns runner minutes on private repos. Fork PRs never see the secret. It also gives you nothing a webhook doesn't: the Actions `github.event` for push is essentially the webhook payload, minus some per-file fields. It suits a "no-admin-rights" or opt-in-per-repo fallback, but it should not be the main path.

### Cited Findings
- The `pull_request` trigger runs only on `opened`, `synchronize` and `reopened` by default. To react to merges, list `closed` and gate on `merged`: "use the `pull_request` `closed` event type along with a conditional that checks the `merged` value of the event", i.e. `if: github.event.pull_request.merged == true` — [GitHub Docs: Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- Forks: "secrets are not passed to the runner when a workflow is triggered from a forked repository" (the exception is `GITHUB_TOKEN`). The `GITHUB_TOKEN` is read-only in PRs from forks, and Dependabot PRs have the same restrictions — [GitHub Docs: Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- `pull_request_target` runs in the base repo's context with secrets. GitHub warns: "Running untrusted code on the `pull_request_target` trigger may lead to security vulnerabilities". It is meant for labeling or commenting, not for building or running PR code — [GitHub Docs: Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- Tag pushes: "Events will not be created for tags when more than three tags are pushed at once", so no workflow runs — [GitHub Docs: Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- Events caused by `GITHUB_TOKEN` generally don't start new workflow runs. The exceptions are `workflow_dispatch` and `repository_dispatch` — [GitHub Docs: Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
- Since 2019, the Actions push payload has dropped `added`, `removed` and `modified` from each commit in `commits`. Get per-file data from the single-commit REST endpoint instead — [GitHub Changelog 2019-10-16](https://github.blog/changelog/2019-10-16-changes-in-github-actions-push-event-payload/)
- The webhook `push` payload's `commits` array "includes a maximum of 2048 commits". "Events will not be created if more than 5000 branches are pushed at once." — [GitHub Docs: Webhook events and payloads (push)](https://docs.github.com/en/webhooks/webhook-events-and-payloads)
- Cost: standard GitHub-hosted runners in public repos are free. Private-repo usage draws on a monthly included compute credit: Free $12, Pro $18, Team $18, Enterprise Cloud $300. A Linux 2-core runner costs $0.006/min and a Linux 1-core (`actions_linux_slim`) costs $0.002/min. The page's own guide says $300 equals 50,000 standard Linux minutes. Self-hosted runner use "remains free" — [GitHub Docs: GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- On 1 Jan 2026 GitHub cut hosted-runner prices by up to about 39%. It also announced a $0.002/min platform charge for self-hosted runners from 1 Mar 2026. Secondary sources say that charge was postponed — [GitHub Changelog 2025-12-16](https://github.blog/changelog/2025-12-16-coming-soon-simpler-pricing-and-a-better-experience-for-github-actions/); [GitHub Resources: 2026 pricing changes](https://resources.github.com/actions/2026-pricing-changes-for-github-actions/); postponement reported by [SAMexpert](https://samexpert.com/github-actions-pricing-backlash-2026/) and [dev.to](https://dev.to/kalemi/github-actions-pricing-changes-in-2026-4g0j). The current billing doc lists self-hosted runners as free, which agrees with the postponement — [GitHub Docs billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)

### Example workflow (illustrative; field names from the docs above)
```yaml
# .github/workflows/spacer-sync.yml
name: spacer-sync
on:
  push:
    branches: [main]
  pull_request:
    types: [closed]          # not a default type, must be listed
permissions: {}              # this job needs no repo token scopes
jobs:
  notify:
    if: github.event_name == 'push' || github.event.pull_request.merged == true
    runs-on: ubuntu-latest   # or ubuntu-slim / 1-core for $0.002/min where available
    timeout-minutes: 2
    steps:
      - name: Send event to Spacer
        env:
          SPACER_TOKEN: ${{ secrets.SPACER_TOKEN }}   # repo or org Actions secret
        run: |
          # Forward the raw event JSON; the server parses commit messages.
          curl --fail-with-body -sS -X POST "https://<project>.supabase.co/functions/v1/github-actions-ingest" \
            -H "Authorization: Bearer $SPACER_TOKEN" \
            -H "Content-Type: application/json" \
            -H "X-Spacer-Run-Id: ${{ github.run_id }}-${{ github.run_attempt }}" \
            --data-binary @"$GITHUB_EVENT_PATH"
```
- `$GITHUB_EVENT_PATH` points to the full event JSON on the runner. Forwarding it with `--data-binary` avoids putting commit messages into shell strings, where they could be used for shell injection. (This is an inference from general Actions practice. The env var name is a standard Actions default and is not cited above.)

### Inferences
- Every repo needs the YAML file plus a secret, either per repo or as an org secret. That setup friction is the main cost for a small SaaS. Per-push minute cost is tiny: a curl job is under one billed minute, about $0.006 on a private-repo Linux runner.
- Fork PRs get no secret, so in open-source repos the merge into main (a `push` to main, or `pull_request` closed+merged in the base repo) is the reliable signal, not the PR-opened event from the fork.
- Squash merge: on GitHub the push to the base branch usually carries one new commit, whose default message is built from the PR title and number, with the individual commit messages often listed in the body. Task IDs (e.g. `SPC-123`) typed only in intermediate commit messages could disappear if the person merging edits the squash message. Robust fix: also parse the PR title, body and branch name from the `pull_request` closed event. (GitHub's squash-message defaults are configurable per repo; not verified in the sources above.)
- Rebase merges and force-pushes can deliver the same logical commit under a new SHA. Dedupe on the delivery or run ID, not only on SHA.

### Gaps
- The "20 commit" cap in the brief: no current GitHub doc found that applies it to webhooks or the Actions `github.event`. It most likely comes from the REST Activity Events API (`PushEvent`). GitHub announced it would remove commit summaries and counts from that API's push events from 7 Oct 2025 ([GitHub Changelog 2025-08-08](https://github.blog/changelog/2025-08-08-upcoming-changes-to-github-events-api-payloads/)). The changelog does not mention webhooks or Actions. For pushes over 2048 commits, use the Compare API between `before` and `after` (from general REST knowledge; not fetched here).
- GitHub's squash-merge default commit-message rules were not fetched from the docs.

## Option B: a repository or organization webhook sending push and pull_request directly

### Takeaway
A webhook is the simplest robust path. A repo or org admin pastes a URL and secret once, and an org-level hook covers every repo. Verify the HMAC-SHA256 signature over the raw body with a constant-time compare. Return 2xx within 10 s and do the real work asynchronously. Use `X-GitHub-Delivery` as the dedupe key. GitHub does not retry automatically, so you need a reconciliation or redelivery job.

### Cited Findings
- Delivery headers ([GitHub Docs: Webhook events and payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads)):
  - `X-GitHub-Delivery`: a GUID for the event.
  - `X-GitHub-Event`: the event name.
  - `X-GitHub-Hook-ID`: the hook's ID.
  - `X-GitHub-Hook-Installation-Target-ID`: the ID of the resource (repo or org) the hook was created on.
  - `X-Hub-Signature-256`: sent when a secret is set.
  - `User-Agent`: always starts with `GitHub-Hookshot/`.
- Payload size: "Payloads are capped at 25 MB." If an event exceeds that, "GitHub will not deliver a payload for that webhook event." — [GitHub Docs: Webhook events and payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads)
- `push` payload fields ([GitHub Docs: push](https://docs.github.com/en/webhooks/webhook-events-and-payloads)):
  - `ref` (e.g. `refs/heads/main`)
  - `before` and `after`: the SHAs at the tip of the ref before and after the push
  - `forced`
  - `deleted`
  - `created`
  - `compare`
  - `base_ref`
  - `pusher`
  - `head_commit`
  - `commits`: max 2048 entries.
  - No event is created for tags when more than three are pushed at once, or for more than 5000 branches at once.
- `pull_request` actions include `opened`, `synchronize`, `reopened`, `closed`, `edited`, `ready_for_review`, `converted_to_draft`, `labeled`, `enqueued` and `dequeued` (merge queue), `auto_merge_enabled`, `stacked`, and others. On `closed`: "If merged is true in the webhook payload, the pull request was merged"; if false, it was closed unmerged — [GitHub Docs: pull_request](https://docs.github.com/en/webhooks/webhook-events-and-payloads)
- Signature: `X-Hub-Signature-256` is an HMAC hex digest using SHA-256 and the webhook secret over the payload, prefixed `sha256=`. The legacy `X-Hub-Signature` uses SHA-1 and is "only included for legacy purposes" — [GitHub Docs: Validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- "Never use a plain `==` operator"; use a constant-time compare. Handle the payload as UTF-8, since payloads can contain unicode. Make sure proxies or load balancers don't modify the body or headers before you verify — [GitHub Docs: Validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- Official test vector: secret `It's a Secret to Everybody`, payload `Hello, World!`, expected header `sha256=757107ea0eb2509fc211221cce984b8a37570b6d7586c22c46f4379c8b043e17` — [GitHub Docs: Validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- Best practices ([GitHub Docs: Best practices for using webhooks](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks)):
  - Subscribe to the minimum events.
  - Use a high-entropy secret, and never put credentials in the payload URL.
  - Use HTTPS and keep SSL verification on.
  - Optionally allow-list GitHub IPs from `GET /meta`, updating periodically.
  - "Respond within 10 seconds", otherwise GitHub terminates the connection and counts a failure.
  - Process asynchronously via a queue.
  - Check `X-GitHub-Event` and the `action` key, since new types and actions keep being added.
  - Redeliver missed deliveries.
  - Use `X-GitHub-Delivery` against replay. It is unique per event, and redeliveries reuse the original value, which helps detect duplicates.
- "GitHub does not automatically redeliver failed deliveries." A delivery counts as failed if the server is down or takes more than 10 s. There are REST endpoints to list and redeliver deliveries for repo hooks, org hooks and GitHub App hooks. GitHub suggests a scheduled script that finds failed deliveries and redelivers them — [GitHub Docs: Handling failed webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries)
- The `create` event "will not occur when more than three tags are created at once" — [GitHub Docs: Webhook events and payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads)

### Inferences
- An org-level webhook is the best ratio of effort to coverage for a small team: one hook covers all current and future repos. It needs an org owner to set it up, whereas a repo hook needs repo admin.
- The 10 s budget fits Supabase. Verify, insert a raw-delivery row with `ON CONFLICT (delivery_id) DO NOTHING`, return 202, then process via `EdgeRuntime.waitUntil` or a DB-triggered worker (see the Supabase section).
- With no auto-retry, a cron job (pg_cron or a scheduled function) that lists recent deliveries with status != OK and calls redeliver closes the reliability gap. This needs a token with admin rights to the hook, which is easier with a GitHub App (Option C).

### Gaps
- The exact redelivery window (commonly cited as 3 days) was not stated on the fetched page.
- The `merge_commit_sha` field description was not in the fetched part of the event docs. It is a standard PR object field, but it is not cited here.

## Option C: a GitHub App

### Takeaway
A GitHub App adds three things: one-click install across orgs and repos with fine-grained permissions, one central webhook (no per-tenant secret setup by the customer), and short-lived installation tokens to comment back on PRs or commits and to call the redelivery API. It costs roughly one to three extra days of work: app registration, private-key storage, JWT signing, and the install-callback flow. It is worth it once you have more than a handful of customer orgs, or want write-back features.

### Cited Findings
- Installation access token flow, all from [GitHub Docs: Installation access token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app):
  - Create an app JWT.
  - `POST /app/installations/{installation_id}/access_tokens` with `Authorization: Bearer <JWT>`. The doc's example sends `X-GitHub-Api-Version: 2026-03-10`.
  - When responding to a webhook, "the webhook payload will include the installation ID". It can also be looked up via `GET /repos/{owner}/{repo}/installation`, `/orgs/{org}/installation`, and others.
  - A token can be scoped to up to 500 repos (`repositories` or `repository_ids`) and down-scoped with `permissions`. It can never exceed the app's own grants.
  - "The installation access token will expire after 1 hour."
- App JWT: "must be signed using the RS256 algorithm"; `exp` "no more than 10 minutes into the future"; set `iat` "60 seconds in the past" to allow for clock drift; `iss` is the app's client ID or app ID — [GitHub Docs: Generating a JWT for a GitHub App](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app)
- GitHub App webhooks also have list and redeliver REST endpoints — [GitHub Docs: Handling failed webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries)
- The official TypeScript verification example uses `@octokit/webhooks` (`new Webhooks({ secret })`, `webhooks.verify(body, signature)`), and Octokit SDKs regenerate expired installation tokens automatically — [GitHub Docs: Validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries); [GitHub Docs: Installation access token](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)

### Inferences
- Multi-tenant mapping becomes clean: `installation.id` maps to a Spacer organization row, stored when the install callback is linked to a logged-in Spacer admin. The webhook secret is one app-wide value in Supabase secrets, not one per tenant.
- The app's RS256 private key is the crown jewel. Keep it in Supabase Edge Function secrets or Vault, never in the DB in plaintext. Mint installation tokens only inside the function, cache them for under 1 h, and never send them to the browser.
- Effort vs benefit for a small SaaS: start with Option B (org webhook, per-org secret) for an MVP or a single org. Move to Option C when (a) customers resist pasting secrets, (b) you want PR comments or check runs ("Task SPC-12 moved to Done"), or (c) you need automated redelivery. The App also avoids depending on a customer admin to rotate secrets.

### Gaps
- Marketplace listing and app-manifest flow details were not researched.

## Verifying GitHub signatures in a Supabase Edge Function (Deno, Web Crypto)

### Takeaway
Set `verify_jwt = false` for the webhook function, since GitHub cannot send a Supabase JWT. Read the raw bytes once. Verify the `X-Hub-Signature-256` HMAC with `crypto.subtle.verify`, which compares in constant time. Only then parse JSON and use an admin (service-role or secret-key) client, with explicit `organization_id` filters, because RLS is bypassed.

### Cited Findings
- Per function: `[functions.<name>] verify_jwt = false` in `supabase/config.toml`, or `--no-verify-jwt` on `supabase functions serve`. By default Edge Functions require a valid JWT. "Be careful when using this flag, as it will allow anyone to invoke your Edge Function without a valid JWT." Stripe webhooks are the docs' canonical example — [Supabase Docs: Function configuration](https://supabase.com/docs/guides/functions/function-configuration)
- With the newer `@supabase/server` wrapper, webhooks from providers that "don't send Supabase credentials" should use `auth: 'none'` and "Keep `verify_jwt = false`", and the handler verifies the provider signature itself. `ctx.supabaseAdmin`, which bypasses RLS, is provided for `auth: 'secret'` or `auth: 'user'` — [Supabase Docs: Edge Functions auth](https://supabase.com/docs/guides/functions/auth)
- Default env in deployed functions:
  - `SUPABASE_URL`
  - `SUPABASE_DB_URL`
  - `SUPABASE_PUBLISHABLE_KEYS`: JSON
  - `SUPABASE_SECRET_KEYS`: JSON; "bypass Row Level Security ... never in a browser"
  - `SUPABASE_JWKS`
  - legacy `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`
  - Custom secrets are set via `supabase secrets set NAME=value` or the Dashboard (Owner or Admin role) and read with `Deno.env.get`. Names cannot start with `SUPABASE_`.
  - Source: [Supabase Docs: Secrets](https://supabase.com/docs/guides/functions/secrets)
- Deno's official webhook example:
  - Import the HMAC-SHA256 key once at startup with `["verify"]` usage.
  - Read raw bytes; require the `sha256=` prefix; hex-decode it; call `crypto.subtle.verify`; return 401 on failure and 405 for non-POST.
  - "Read the raw bytes before any JSON parsing. The signature covers the exact bytes that were sent."
  - "Comparing hex strings with === instead would leak how many leading characters matched through response timing."
  - Source: [Deno Docs: HTTP server webhooks](https://docs.deno.com/examples/http_server_webhooks/)
- GitHub's own JS example follows the same pattern: `crypto.subtle.importKey` HMAC/SHA-256, a `hexToBytes` helper, then `crypto.subtle.verify` — [GitHub Docs: Validating webhook deliveries](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- Background work: `EdgeRuntime.waitUntil(promise)` keeps the instance alive until the promise settles, capped by wall-clock, CPU and memory limits. Wrap the work in try/catch. Locally, set `[edge_runtime] policy = "per_worker"` — [Supabase Docs: Background tasks](https://supabase.com/docs/guides/functions/background-tasks)
- Limits: wall clock is 150 s on Free and 400 s on paid plans. CPU time is 2 s per request, excluding async I/O. Memory is 256 MB. Request idle timeout is 150 s (504 if no response). Functions per project: Free 100, Pro 1000 — [Supabase Docs: Limits](https://supabase.com/docs/guides/functions/limits)
- Third-party tutorials (Svix, Hackernoon) deploy webhook receivers with `--no-verify-jwt` — [Svix blog](https://svix.com/blog/receive-webhooks-with-supabase-edge-functions); [Hackernoon](https://www.hackernoon.com/how-to-receive-webhooks-with-supabase-edge-functions). One DEV tutorial uses a custom `x-signature-256` header, not GitHub's `x-hub-signature-256`, so adapt it before reuse — [DEV](https://dev.to/kanta13jp1/supabase-edge-functions-advanced-deno-webhooks-scheduled-jobs-and-multi-tenant-patterns-13jd)

### Snippet (composed from the GitHub and Deno patterns above; sketch, not tested)
```ts
// supabase/functions/github-webhook/index.ts   (config.toml: [functions.github-webhook] verify_jwt = false)
import { createClient } from "npm:@supabase/supabase-js@2";

const enc = new TextEncoder();
const hexToBytes = (hex: string) => {
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};

async function verifyGithubSig(secret: string, header: string | null, raw: Uint8Array) {
  if (!header?.startsWith("sha256=")) return false;
  const sig = hexToBytes(header.slice(7));
  if (!sig) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, sig, raw);   // constant-time compare
}

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } });                 // bypasses RLS -> always filter by org_id

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const event = req.headers.get("x-github-event");
  const deliveryId = req.headers.get("x-github-delivery");
  if (!event || !deliveryId) return new Response("bad request", { status: 400 });

  const raw = new Uint8Array(await req.arrayBuffer());   // raw bytes BEFORE JSON.parse
  if (raw.byteLength > 5_000_000) return new Response("too large", { status: 413 }); // own cap (assumption)

  // Tenant lookup: URL path segment /github-webhook/<endpoint_public_id> (see multi-tenant section)
  const endpointId = new URL(req.url).pathname.split("/").pop()!;
  const { data: secret } = await admin.rpc("get_github_webhook_secret", { p_endpoint_id: endpointId });
  if (!secret || !(await verifyGithubSig(secret, req.headers.get("x-hub-signature-256"), raw)))
    return new Response("invalid signature", { status: 401 });

  // Idempotent insert; duplicate/redelivery -> no-op
  const { error } = await admin.from("github_deliveries").insert({
    delivery_id: deliveryId, endpoint_id: endpointId, event, payload: JSON.parse(new TextDecoder().decode(raw)),
  });
  if (error && error.code !== "23505") return new Response("error", { status: 500 }); // 23505 = unique_violation
  // EdgeRuntime.waitUntil(processDelivery(deliveryId));  // or a DB trigger / queue worker
  return new Response(null, { status: 202 });            // well inside GitHub's 10 s
});
```

### Inferences
- `SUPABASE_SERVICE_ROLE_KEY` is legacy but still injected. On projects moved to the new keys, take a secret key from `SUPABASE_SECRET_KEYS` (JSON) instead, or use the `@supabase/server` wrapper with `auth: 'none'` and build the admin client yourself. The docs only give `ctx.supabaseAdmin` for `secret` and `user` modes.
- Because the admin client bypasses RLS, put the privileged logic in a narrow `SECURITY DEFINER` SQL function (e.g. `apply_github_event(org_id, ...)`) that takes explicit tenant IDs. That keeps the function's surface small and auditable.
- Import the HMAC key once per secret, not per request. It is cheap, but within the 2 s CPU budget a per-tenant `Map` cache helps under bursts.

### Gaps
- No official Supabase doc says whether `verify_jwt` is deprecated with the new JWT signing keys and API keys. The auth page still uses it.
- Supabase docs do not state a request-body size limit for Edge Functions. The 5 MB cap in the snippet is an assumption.

## Multi-tenant design: secrets, storage, repo-to-org mapping, rotation

### Takeaway
A webhook HMAC secret cannot be stored hashed: you need the plaintext to recompute the HMAC. Store it encrypted in Supabase Vault and read it via a locked-down `SECURITY DEFINER` function. A bearer API token for Option A can, and should, be stored only as a SHA-256 hash. Map tenants by an unguessable endpoint ID in the URL (or GitHub's hook or installation IDs), and keep an explicit allow-list of `repository.id` values per org.

### Cited Findings
- Vault stores secrets in `vault.secrets`, encrypted with authenticated encryption (libsodium AEAD). Backups and replication stay encrypted. The key lives outside the DB, managed per project. Associated data binds each value to its row.
  - API: `vault.create_secret(secret, name, description)` returns a UUID; `vault.update_secret(id, new_secret, new_name, new_description)`; read through the `vault.decrypted_secrets` view.
  - Warning: "anyone that has access to the view has access to decrypted secrets."
  - A `pg_dump`/`pg_restore` into a new project needs the old root key copied over.
  - Source: [Supabase Docs: Vault](https://supabase.com/docs/guides/database/vault)
- GitHub sends `X-GitHub-Hook-ID` and `X-GitHub-Hook-Installation-Target-ID` (the repo or org the hook lives on) on every delivery — [GitHub Docs: Webhook events and payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads)
- GitHub advises never putting API keys or credentials in the payload URL — [GitHub Docs: Best practices](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks)

### Inferences
- Tenant resolution before verifying:
  - Option B: use a non-secret, random `endpoint_public_id` in the path (e.g. `/functions/v1/github-webhook/ep_7f3k...`). It identifies the tenant's secret but grants nothing alone, so it is not a credential and fits GitHub's "no credentials in URL" advice. Never trust `repository.id` or `organization.login` from the unverified body to pick the secret.
  - Alternative: key the secret on `X-GitHub-Hook-ID`, captured during setup.
  - Option C: one app secret, then `installation.id` maps to the org.
- Tables: `github_endpoints(id, org_id, vault_secret_id, previous_vault_secret_id, previous_valid_until, created_at)`, `github_repos(org_id, github_repo_id bigint unique, full_name)` and `github_deliveries(delivery_id uuid primary key, endpoint_id, event, received_at, processed_at, status, payload jsonb)`. Enable RLS on all of them with no policies for `anon` or `authenticated` (or read-only policies scoped to the org), and revoke direct access to the `vault` schema from those roles.
- Repo-to-org mapping: always match on the numeric `repository.id`, never on `full_name`, which changes on rename or transfer. Drop deliveries for repos not in `github_repos` for that endpoint: return 202 (so GitHub doesn't flag failures) but do no work, and log them.
- Rotation:
  - Option B: generate a new secret into Vault and show it once to the admin, who pastes it into GitHub. During a grace window (e.g. 24 to 72 h) accept a signature from either current or previous, then drop the previous one.
  - Option A tokens: issue the new token, keep both hashes valid during the window, then revoke.
  - Option C: rotate the app webhook secret and private key centrally.
- Option A bearer token: generate 32+ random bytes and show it once. Store `sha256(token)` (fast hash is fine for high-entropy tokens) plus a short prefix for display, and compare digests. Bind each token to one org and, optionally, to an allow-list of repo IDs, because the payload sent from Actions is not signed by GitHub. A token holder can forge any body.
- Option A authenticity upgrade: instead of a static secret, the workflow can request a GitHub Actions OIDC token (`permissions: id-token: write`), and the function verifies its JWT claims (`repository_id`, `ref`). This proves which repo sent the call. Not researched in this pass; see Gaps.

### Gaps
- GitHub Actions OIDC claims and the JWKS URL were not fetched, so the OIDC option is unsourced here.
- Vault performance and the recommended grant pattern for calling `vault.decrypted_secrets` from a `SECURITY DEFINER` function were not documented on the fetched page.

## Idempotency, replay protection and abuse resistance

### Takeaway
Rely on the HMAC, a unique `X-GitHub-Delivery` key in Postgres, and event/action allow-lists. Make the state transitions themselves idempotent ("move task to Done" is a no-op if already Done). Treat commit author names and emails as untrusted display data. Bound everything: body size, commits processed, task IDs per message.

### Cited Findings
- `X-GitHub-Delivery` should be unique per event; redeliveries reuse it, so store it and reject repeats to guard against replays and duplicates — [GitHub Docs: Best practices](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks)
- Check `X-GitHub-Event` and `action` before processing; subscribe only to needed events — [GitHub Docs: Best practices](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks)
- An optional IP allow-list can come from `GET /meta`, refreshed periodically — [GitHub Docs: Best practices](https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks)
- `User-Agent` starts with `GitHub-Hookshot/`. This is a cheap pre-filter only, since it can be spoofed — [GitHub Docs: Webhook events and payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads)
- Function limits (2 s CPU, 256 MB) bound per-request work — [Supabase Docs: Limits](https://supabase.com/docs/guides/functions/limits)

### Inferences
- GitHub signatures carry no timestamp, so a captured valid delivery could be replayed indefinitely. The unique `delivery_id` constraint is the replay defence. Keep delivery IDs for longer than the redelivery window, e.g. 30 to 90 days, then prune.
- Commit author emails and names come from local git config and are trivially forged. Don't use them to attribute work or authorize transitions. Prefer `sender` and `pusher` (the authenticated GitHub account that pushed) or `pull_request.merged_by`, matched to a Spacer member via a verified GitHub-account link (e.g. OAuth), not via email equality. Even then, only allow transitions on tasks belonging to the same org as the repo.
- Untrusted commit messages:
  - Parse with an anchored, bounded regex (e.g. `\b(SPC-\d{1,7})\b`, with a max of ~20 matches per message).
  - Never interpolate them into SQL; use parameterized RPCs.
  - Escape them before rendering in the UI (XSS).
- Only accept transitions from the configured default or production branch (`ref == refs/heads/<default>`) and from `closed` events with `merged == true`. Ignore `forced`/`deleted` pushes, or handle them specially.
- Rate limiting: Supabase Edge Functions have no documented per-endpoint limiter (see Gaps). Use a cheap Postgres counter per `endpoint_id` per minute (or Upstash or Redis) and return 429 above a threshold. Do signature verification before any heavy DB work, so unauthenticated floods cost only one HMAC and one Vault lookup. Caching secrets per endpoint in memory reduces the lookup cost.
- Unknown endpoint ID or invalid signature: return 401 with a generic body and no detail, and log the attempt with the IP for monitoring.

### Gaps
- No Supabase doc was found describing built-in rate limiting for Edge Functions invoked without a JWT. Confirm before relying on platform protection.
- GitHub does not document a retry or backoff policy, beyond saying there is no automatic redelivery.
