// Escape user-supplied text (task titles, project names, ...) before putting
// it into email HTML, so nobody can inject links or markup into our emails.
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Only allow http(s) links into emails; anything else falls back to the app URL.
export function safeUrl(value: unknown, fallback: string): string {
  try {
    const url = new URL(String(value));
    if (url.protocol === "https:" || url.protocol === "http:") return url.toString();
  } catch {
    // fall through to fallback
  }
  return fallback;
}

export const DEFAULT_EMAIL_FROM = "Spacer <noreply@spacer.ink>";
