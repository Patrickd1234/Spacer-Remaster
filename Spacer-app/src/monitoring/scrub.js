// Removes personal data and secrets from a Sentry error report before it
// leaves the browser. Pure functions, no Sentry import, so they can be tested.
//
// What can leak without this:
// - Password reset and invite links carry the session token in the URL
//   (#access_token=...), and Sentry records the page address.
// - Database requests filter by email in the query string (?email=eq.ada@...),
//   and Sentry records each request's address as a breadcrumb.
// - Error messages from Supabase can quote an email address.

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Supabase access tokens and other JWTs
const JWT = /eyJ[\w-]+\.[\w-]+\.[\w-]+/g;
// Opaque tokens in a quoted link: refresh tokens, sign-in codes, invite tokens
const TOKEN_PARAM = /\b(access_token|refresh_token|provider_token|token_hash|token|code)=[^&\s"'#]+/gi;

export function scrubText(text) {
  if (typeof text !== "string") return text;
  return text.replace(JWT, "[token]").replace(TOKEN_PARAM, "$1=[token]").replace(EMAIL, "[email]");
}

// Keeps the address up to the path; drops the query string and the hash.
export function stripUrl(url) {
  if (typeof url !== "string") return url;
  const cut = url.search(/[?#]/);
  return scrubText(cut === -1 ? url : url.slice(0, cut));
}

// Extra data can hold whole objects (console.error arguments, Supabase error
// details), so every string inside it is scrubbed. Depth-limited for cycles.
const MAX_DEPTH = 6;
function scrubDeep(value, depth = 0) {
  if (typeof value === "string") return scrubText(value);
  if (value === null || typeof value !== "object" || depth >= MAX_DEPTH) return value;
  if (Array.isArray(value)) return value.map((item) => scrubDeep(item, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrubDeep(item, depth + 1)]));
}

const URL_KEYS = ["url", "from", "to"];

// Console breadcrumbs keep the raw console arguments in data.arguments
function scrubBreadcrumb(crumb) {
  const data = crumb.data
    ? Object.fromEntries(
        Object.entries(crumb.data).map(([key, value]) => [key, URL_KEYS.includes(key) ? stripUrl(value) : scrubDeep(value)]),
      )
    : crumb.data;
  return { ...crumb, message: scrubText(crumb.message), data };
}

function scrubRequest(request) {
  if (!request) return request;
  const rest = Object.fromEntries(
    Object.entries(request).filter(([key]) => key !== "query_string" && key !== "cookies"),
  );
  const headers = rest.headers
    ? Object.fromEntries(
        Object.entries(rest.headers).map(([key, value]) => [key, key.toLowerCase() === "referer" ? stripUrl(value) : value]),
      )
    : rest.headers;
  return { ...rest, url: stripUrl(rest.url), headers };
}

function scrubException(exception) {
  if (!exception?.values) return exception;
  return {
    ...exception,
    values: exception.values.map((value) => ({ ...value, value: scrubText(value.value) })),
  };
}

// Returns a new event; the original is left untouched.
export function scrubEvent(event) {
  return {
    ...event,
    message: scrubText(event.message),
    request: scrubRequest(event.request),
    exception: scrubException(event.exception),
    logentry: scrubDeep(event.logentry),
    extra: scrubDeep(event.extra),
    contexts: scrubDeep(event.contexts),
    tags: scrubDeep(event.tags),
    breadcrumbs: Array.isArray(event.breadcrumbs) ? event.breadcrumbs.map(scrubBreadcrumb) : event.breadcrumbs,
  };
}
