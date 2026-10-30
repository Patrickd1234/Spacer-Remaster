// Sends one email through Resend. Returns whether Resend accepted it; never
// throws, so a failed email can't undo work the caller already committed.
// Required secret: RESEND_API_KEY. Optional: EMAIL_FROM.

import { DEFAULT_EMAIL_FROM } from "./html.ts";

export async function sendEmail(
  { to, subject, html }: { to: string; subject: string; html: string },
): Promise<boolean> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    console.warn(`RESEND_API_KEY not set, skipping email to ${to}`);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: Deno.env.get("EMAIL_FROM") || DEFAULT_EMAIL_FROM, to, subject, html }),
    });
    if (!res.ok) {
      console.error(`Resend rejected email to ${to}: ${res.status} ${await res.text()}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`Sending email to ${to} failed:`, err);
    return false;
  }
}
