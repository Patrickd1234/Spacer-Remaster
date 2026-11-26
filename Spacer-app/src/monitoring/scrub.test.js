import { test } from "node:test";
import assert from "node:assert/strict";
import { scrubEvent, scrubText, stripUrl } from "./scrub.js";

const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abc_DEF-123";

test("scrubText replaces email addresses and tokens", () => {
  assert.equal(scrubText(`User ada@redtech.inc sent ${TOKEN}`), "User [email] sent [token]");
});

test("scrubText leaves other values alone", () => {
  assert.equal(scrubText("Cannot read properties of undefined"), "Cannot read properties of undefined");
  assert.equal(scrubText(undefined), undefined);
  assert.equal(scrubText(42), 42);
});

test("stripUrl drops the hash that carries a reset link's session token", () => {
  assert.equal(
    stripUrl(`https://spacer.ink/reset-password#access_token=${TOKEN}&type=recovery`),
    "https://spacer.ink/reset-password",
  );
});

test("stripUrl drops a database query that filters by email", () => {
  assert.equal(
    stripUrl("https://x.supabase.co/rest/v1/users?select=id&email=eq.ada%40redtech.inc"),
    "https://x.supabase.co/rest/v1/users",
  );
});

test("stripUrl keeps a plain path and scrubs an email in it", () => {
  assert.equal(stripUrl("/project_page/123"), "/project_page/123");
  assert.equal(stripUrl("/people/ada@redtech.inc"), "/people/[email]");
});

test("scrubEvent cleans the page address, referer, message, exception and breadcrumbs", () => {
  const event = {
    message: "Failed for ada@redtech.inc",
    request: {
      url: `https://spacer.ink/accept-invite#access_token=${TOKEN}`,
      query_string: "a=b",
      headers: { Referer: "https://spacer.ink/login?email=ada@redtech.inc", "User-Agent": "Firefox" },
    },
    exception: { values: [{ type: "Error", value: "No account for bo@redtech.inc" }] },
    breadcrumbs: [
      { category: "fetch", data: { url: "https://x.supabase.co/rest/v1/users?email=eq.ada", status_code: 400 } },
      { category: "navigation", data: { from: "/reset-password#access_token=x", to: "/" } },
      { category: "console", message: "Signed in as ada@redtech.inc" },
    ],
  };

  const clean = scrubEvent(event);

  assert.equal(clean.message, "Failed for [email]");
  assert.deepEqual(clean.request, {
    url: "https://spacer.ink/accept-invite",
    headers: { Referer: "https://spacer.ink/login", "User-Agent": "Firefox" },
  });
  assert.equal(clean.exception.values[0].value, "No account for [email]");
  assert.equal(clean.exception.values[0].type, "Error");
  assert.deepEqual(clean.breadcrumbs[0].data, { url: "https://x.supabase.co/rest/v1/users", status_code: 400 });
  assert.deepEqual(clean.breadcrumbs[1].data, { from: "/reset-password", to: "/" });
  assert.equal(clean.breadcrumbs[2].message, "Signed in as [email]");
});

test("scrubEvent scrubs strings nested in extra data, such as logged error objects", () => {
  const event = {
    extra: { arguments: ["Insert failed:", { code: "23505", details: "Key (email)=(ada@redtech.inc) exists", hint: null }] },
  };
  assert.deepEqual(scrubEvent(event).extra, {
    arguments: ["Insert failed:", { code: "23505", details: "Key (email)=([email]) exists", hint: null }],
  });
});

test("scrubText replaces opaque tokens in a quoted link", () => {
  assert.equal(
    scrubText("Bad link #access_token=abc&refresh_token=r3fr35h&type=recovery"),
    "Bad link #access_token=[token]&refresh_token=[token]&type=recovery",
  );
  assert.equal(scrubText("/login?code=4f2a9c&next=/"), "/login?code=[token]&next=/");
});

test("scrubEvent scrubs the raw arguments that console breadcrumbs keep", () => {
  const event = {
    breadcrumbs: [{ category: "console", message: "Insert failed:", data: { logger: "console", arguments: ["Insert failed:", { details: "a@b.co" }] } }],
  };
  assert.deepEqual(scrubEvent(event).breadcrumbs[0].data, {
    logger: "console",
    arguments: ["Insert failed:", { details: "[email]" }],
  });
});

test("scrubEvent scrubs contexts, tags and logentry", () => {
  const clean = scrubEvent({
    contexts: { react: { componentStack: "at Row (ada@x.co)" } },
    tags: { note: "ada@x.co" },
    logentry: { message: "Hi ada@x.co", params: [] },
  });
  assert.equal(clean.contexts.react.componentStack, "at Row ([email])");
  assert.equal(clean.tags.note, "[email]");
  assert.deepEqual(clean.logentry, { message: "Hi [email]", params: [] });
});

test("scrubEvent does not change the original event", () => {
  const event = { message: "ada@redtech.inc", request: { url: "/a?b=c" }, breadcrumbs: [{ message: "ada@redtech.inc" }] };
  const before = structuredClone(event);
  scrubEvent(event);
  assert.deepEqual(event, before);
});

test("scrubEvent copes with an event that has none of the optional parts", () => {
  assert.deepEqual(scrubEvent({ level: "error" }), {
    level: "error",
    message: undefined,
    request: undefined,
    exception: undefined,
    logentry: undefined,
    extra: undefined,
    contexts: undefined,
    tags: undefined,
    breadcrumbs: undefined,
  });
});
