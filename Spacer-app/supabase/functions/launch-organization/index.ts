// AUTH-04 — Guided Organization Launch Flow
// Creates the Organization, makes the calling user its Admin, creates 1-5
// Team Spaces with their invites, then emails everyone invited.
//
// All database writes happen inside the launch_organization() Postgres
// function (migration 20261030100000), which runs as one transaction: if any
// row fails, nothing is kept. Emails go out only after that commit, and a
// failed email never undoes the launch; each invite's outcome is returned.
//
// This is one of the few operations that legitimately needs the service
// role (per Security Considerations, Section 12): it creates the very
// Organization / Membership rows that RLS would otherwise require to
// already exist before allowing the insert.
//
// Required secrets: SITE_URL, RESEND_API_KEY. Optional: EMAIL_FROM.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, badRequest } from "../_shared/cors.ts";
import { callerHeaders, requireMfa } from "../_shared/mfa.ts";
import { escapeHtml } from "../_shared/html.ts";
import { sendEmail } from "../_shared/email.ts";

interface TeamSpaceInput {
  name: string;
  team_lead_email?: string;
  member_emails?: string[];
}

interface LaunchRequest {
  organization_name: string;
  team_spaces: TeamSpaceInput[];
}

// Shape returned by launch_organization()
interface CreatedInvite {
  email: string;
  role: string;
  team_space_id: string;
  team_name: string;
}

type InviteStatus = "invite_sent" | "notified_existing" | "other_organization" | "email_failed";

const MAX_TEAM_SPACES = 5;
const MAX_NAME_LENGTH = 100;
// Resend's free plan sends 100 emails a day; keep one launch well under that
const MAX_INVITES = 50;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Postgres error codes raised by launch_organization()
const DB_ERROR_STATUS: Record<string, number> = {
  "22023": 400, // invalid input
  "23505": 409, // already belongs to an organization
  "P0002": 404, // no profile row yet
};

const isOptionalString = (value: unknown) => value === undefined || value === null || typeof value === "string";

// The body is untrusted JSON: check every type before calling string methods
function validate(body: LaunchRequest): string | null {
  if (typeof body !== "object" || body === null) return "Request body must be a JSON object";
  if (typeof body.organization_name !== "string" || !body.organization_name.trim()) {
    return "organization_name is required";
  }
  if (body.organization_name.trim().length > MAX_NAME_LENGTH) {
    return `organization_name must be at most ${MAX_NAME_LENGTH} characters`;
  }

  const teams = body.team_spaces;
  if (!Array.isArray(teams) || teams.length < 1 || teams.length > MAX_TEAM_SPACES) {
    return `team_spaces must contain 1 to ${MAX_TEAM_SPACES} entries`;
  }

  const emails: string[] = [];
  for (const ts of teams) {
    if (typeof ts !== "object" || ts === null || !isOptionalString(ts.name) || !isOptionalString(ts.team_lead_email)) {
      return "Each team space needs a text name and an optional text team_lead_email";
    }
    if ((ts.name?.trim().length ?? 0) > MAX_NAME_LENGTH) {
      return `Team space names must be at most ${MAX_NAME_LENGTH} characters`;
    }
    const members = ts.member_emails ?? [];
    if (!Array.isArray(members) || !members.every((email) => typeof email === "string")) {
      return "member_emails must be a list of email addresses";
    }
    for (const email of [ts.team_lead_email ?? "", ...members]) {
      if (email.trim()) emails.push(email.trim());
    }
  }

  const invalid = emails.filter((email) => !EMAIL_PATTERN.test(email));
  if (invalid.length) return `Not a valid email address: ${invalid.join(", ")}`;
  if (emails.length > MAX_INVITES) return `You can invite at most ${MAX_INVITES} people while launching`;
  return null;
}

function invitedToOrgEmailHtml({ orgName, teamNames, inviterName, actionUrl, actionLabel }: {
  orgName: string;
  teamNames: string[];
  inviterName: string;
  actionUrl: string;
  actionLabel: string;
}) {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>You're invited to ${escapeHtml(orgName)}</h2>
      <p><strong>${escapeHtml(inviterName)}</strong> invited you to join <strong>${escapeHtml(orgName)}</strong> on Spacer
        (${teamNames.map(escapeHtml).join(", ")}).</p>
      <p>Log in with this email address and you'll be added automatically.</p>
      <p><a href="${actionUrl}" style="display:inline-block;background:#aff82a;color:#1C1F26;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">${escapeHtml(actionLabel)}</a></p>
    </div>
  `;
}

// One email per address, even if the same person was invited to several teams
async function emailInvitees(
  admin: SupabaseClient,
  invites: CreatedInvite[],
  { orgId, orgName, inviterName }: { orgId: string; orgName: string; inviterName: string },
): Promise<{ email: string; status: InviteStatus }[]> {
  const siteUrl = Deno.env.get("SITE_URL") || "http://localhost:5173";
  const teamsByEmail = new Map<string, string[]>();
  for (const invite of invites) {
    teamsByEmail.set(invite.email, [...(teamsByEmail.get(invite.email) ?? []), invite.team_name]);
  }

  const results: { email: string; status: InviteStatus }[] = [];
  // Sequential on purpose: Resend and Supabase Auth both rate-limit bursts
  for (const [email, teamNames] of teamsByEmail) {
    const { data: existing, error: lookupErr } = await admin
      .from("users")
      .select("organization_id")
      .ilike("email", email.replace(/[\\%_]/g, (c) => `\\${c}`))
      .maybeSingle();
    if (lookupErr) {
      console.error(`Looking up ${email} failed:`, lookupErr);
      results.push({ email, status: "email_failed" });
      continue;
    }

    if (existing?.organization_id && existing.organization_id !== orgId) {
      // claim_pending_invites() won't move them across organizations, so an
      // email would only promise something that can't happen
      results.push({ email, status: "other_organization" });
      continue;
    }

    if (existing) {
      const sent = await sendEmail({
        to: email,
        subject: `You're invited to ${orgName} on Spacer`,
        html: invitedToOrgEmailHtml({ orgName, teamNames, inviterName, actionUrl: `${siteUrl}/login`, actionLabel: "Log in to Spacer" }),
      });
      results.push({ email, status: sent ? "notified_existing" : "email_failed" });
      continue;
    }

    // No account yet: Supabase creates one and emails a link to set a password.
    // Their first sign-in runs claim_pending_invites(), which joins the teams.
    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/accept-invite`,
    });
    if (inviteErr) console.error(`Invite email to ${email} failed:`, inviteErr);
    results.push({ email, status: inviteErr ? "email_failed" : "invite_sent" });
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return badRequest("Missing Authorization header");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  // Client scoped to the caller, just to resolve who's calling.
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: callerHeaders(req) },
  });
  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData.user) return badRequest("Not authenticated");
  const mfaBlocked = await requireMfa(callerClient);
  if (mfaBlocked) return mfaBlocked;

  let body: LaunchRequest;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be JSON");
  }
  const invalid = validate(body);
  if (invalid) return badRequest(invalid);

  // Service-role client: the one narrow, documented use of the bypass
  // (Section 12). launch_organization() is executable by the service role only.
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: launched, error: launchErr } = await admin.rpc("launch_organization", {
    p_user_id: userData.user.id,
    p_organization_name: body.organization_name.trim(),
    p_team_spaces: body.team_spaces,
  });
  if (launchErr) {
    const status = DB_ERROR_STATUS[launchErr.code ?? ""];
    if (status) return jsonResponse({ error: launchErr.message }, status);
    console.error("launch_organization failed:", launchErr);
    return jsonResponse({ error: "Could not launch your organization. Nothing was saved; please try again." }, 500);
  }

  const { data: inviter } = await admin
    .from("users")
    .select("name, email")
    .eq("id", userData.user.id)
    .maybeSingle();

  const inviteResults = await emailInvitees(admin, launched.invites ?? [], {
    orgId: launched.organization.id,
    orgName: launched.organization.name,
    inviterName: inviter?.name || inviter?.email || "A Spacer admin",
  });

  return jsonResponse({
    organization: launched.organization,
    team_spaces: launched.team_spaces,
    invites: inviteResults,
  });
});
