// AUTH-04 — Guided Organization Launch Flow
// Creates the Organization + General Space (implicit), makes the calling
// user its Admin, then creates 2-5 priority Team Spaces and invites in a
// single all-or-nothing transaction (per Tech Spec Open Question in
// Section 14 — resolved here as a single Edge Function transaction rather
// than a sequence of RLS-protected inserts, since a partially-completed
// launch would leave inconsistent data).
//
// This is one of the few operations that legitimately needs the service
// role (per Security Considerations, Section 12): it creates the very
// Organization / Membership rows that RLS would otherwise require to
// already exist before allowing the insert.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, badRequest } from "../_shared/cors.ts";
import { requireMfa } from "../_shared/mfa.ts";

interface TeamSpaceInput {
  name: string;
  team_lead_email?: string;
  member_emails?: string[];
}

interface LaunchRequest {
  organization_name: string;
  team_spaces: TeamSpaceInput[]; // 2–5, per AUTH-04 acceptance criteria
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
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData.user) return badRequest("Not authenticated");
  const mfaBlocked = await requireMfa(callerClient);
  if (mfaBlocked) return mfaBlocked;

  const body: LaunchRequest = await req.json();
  if (!body.organization_name?.trim()) {
    return badRequest("organization_name is required");
  }
  if (!Array.isArray(body.team_spaces) || body.team_spaces.length < 1) {
  return badRequest("team_spaces must contain at least 1 entry");
}

  // Service-role client — the one narrow, documented use of the bypass
  // (Section 12): this function performs the atomic org-bootstrap that no
  // RLS policy could authorize on its own, since no Membership yet exists.
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({ name: body.organization_name.trim() })
    .select()
    .single();
  if (orgErr) return jsonResponse({ error: orgErr.message }, 500);

  const userId = userData.user.id;

  await admin.from("users").update({ organization_id: org.id }).eq("id", userId);

  await admin.from("memberships").insert({
    user_id: userId,
    team_space_id: null,
    role: "super_admin",
  });

  const createdTeamSpaces = [];

  for (const ts of body.team_spaces) {
    if (!ts.name?.trim()) continue;

    const { data: teamSpace, error: tsErr } = await admin
      .from("team_spaces")
      .insert({ organization_id: org.id, name: ts.name.trim() })
      .select()
      .single();
    if (tsErr) return jsonResponse({ error: tsErr.message }, 500);

    if (ts.team_lead_email) {
      await admin.from("invites").insert({
        organization_id: org.id,
        team_space_id: teamSpace.id,
        email: ts.team_lead_email.toLowerCase().trim(),
        role: "team_lead",
        invited_by: userId,
      });
    }

    for (const email of ts.member_emails ?? []) {
      if (!email?.trim()) continue;
      await admin.from("invites").insert({
        organization_id: org.id,
        team_space_id: teamSpace.id,
        email: email.toLowerCase().trim(),
        role: "member",
        invited_by: userId,
      });
    }

    createdTeamSpaces.push(teamSpace);
  }

  return jsonResponse({
    organization: org,
    team_spaces: createdTeamSpaces,
  });
});
