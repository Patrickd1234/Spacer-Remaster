# Error monitoring (Sentry)

Spacer reports errors from the browser to Sentry. It is off unless `VITE_SENTRY_DSN` is set, so local development sends nothing.

## Turning it on

1. Create a Sentry project (platform: React) and copy its DSN from Project Settings → Client Keys (DSN). The DSN is public by design: it only allows sending reports.
2. In Vercel, add `VITE_SENTRY_DSN` to the Production environment (and Preview if wanted), then redeploy.
3. Check it: open the live site, open the browser console, run `console.error("Sentry test")`, and look for the event in Sentry within a minute.

## What is sent

- Uncaught errors and unhandled promise rejections.
- Errors the page error boundary catches (the "Something went wrong" screen), with the component stack, through `createRoot`'s `onCaughtError` and `onUncaughtError`.
- Every `console.error`. Most failed Supabase calls are logged that way, so they show up here too. To stop this, remove `captureConsoleIntegration` in `src/monitoring/sentry.js`.
- With each event: the last steps before it (pages visited, clicks, requests, console lines), the browser and OS, and the release (the Vercel commit, from `VERCEL_GIT_COMMIT_SHA`).
- The signed-in person by user id only. No name or email.

No session replay and no performance tracing.

## What is removed first

`src/monitoring/scrub.js` runs on every event before it leaves the browser (`beforeSend`):

- Email addresses become `[email]`. JWTs and token values in links (`access_token`, `refresh_token`, `token`, `token_hash`, `code`, `provider_token`) become `[token]`.
- The page address, the referer and every request or navigation breadcrumb keep only the path. The query string and the hash are dropped. Password reset and invite links carry the session token in the hash, and database requests can filter by email in the query string.
- The same scrubbing applies to the message, exception values, extra data, contexts, tags, and breadcrumb data, including the raw console arguments.

Only errors from Spacer's own scripts are kept (`allowUrls`), so browser extension errors are dropped.

## Not covered yet

- Edge functions. Their errors are in Supabase → Edge Functions → Logs.
- Readable stack traces. The production build is minified, and source maps aren't uploaded to Sentry yet. That needs `@sentry/vite-plugin` and a `SENTRY_AUTH_TOKEN` in Vercel.
