// AUTH-05 — Invite Additional Teams Post-Launch
// Lets an Organization Admin create a new Team Space after initial launch,
// or invite (including bulk CSV/paste-list) members to an existing one.
// Supports Phase 2 expansion and mandated rollouts per the Product
// Strategy's "onboard, don't just provision" guidance — the response
// includes a flag the client uses to trigger the distinct onboarding
// prompt described in User Flow 8.4, rather than a bare confirmation.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, badRequest, notFound } from "../_shared/cors.ts";
import { callerHeaders, requireMfa } from "../_shared/mfa.ts";

interface InviteRequest {
  organization_id: string;
  team_space_id?: string; // omit to create a new Team Space
  new_team_space_name?: string;
  invites: { email: string; role: "team_lead" | "member" | "viewer" }[];
  is_mandated_rollout?: boolean;
}

const ALLOWED_ROLES = ["team_lead", "member", "viewer"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return badRequest("Missing Authorization header");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Scoped client: confirms the caller is actually an org admin under RLS
  // before we touch anything with the service role.
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: callerHeaders(req) },
  });
  const { data: userData, error: userErr } = await caller.auth.getUser();
  if (userErr || !userData.user) return badRequest("Not authenticated");
  const mfaBlocked = await requireMfa(caller);
  if (mfaBlocked) return mfaBlocked;

  const { data: isAdmin } = await caller.rpc("is_org_admin");
  if (!isAdmin) return notFound(); // 404, not 403 — per Tech Spec 7.2

  const body: InviteRequest = await req.json();
  if (!body.organization_id) return badRequest("organization_id is required");
  if (!body.team_space_id && !body.new_team_space_name?.trim()) {
    return badRequest("Provide team_space_id or new_team_space_name");
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // is_org_admin() only says the caller administers *some* organization —
  // make sure it's the one named in the request before acting on it.
  const { data: callerProfile } = await admin
    .from("users")
    .select("organization_id")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (!callerProfile?.organization_id || callerProfile.organization_id !== body.organization_id) {
    return notFound();
  }

  let teamSpaceId = body.team_space_id;

  if (teamSpaceId) {
    const { data: teamSpace } = await admin
      .from("team_spaces")
      .select("id")
      .eq("id", teamSpaceId)
      .eq("organization_id", body.organization_id)
      .maybeSingle();
    if (!teamSpace) return notFound();
  } else {
    const { data: teamSpace, error: tsErr } = await admin
      .from("team_spaces")
      .insert({ organization_id: body.organization_id, name: body.new_team_space_name!.trim() })
      .select()
      .single();
    if (tsErr) return jsonResponse({ error: tsErr.message }, 500);
    teamSpaceId = teamSpace.id;
  }

  const results = [];
  for (const invite of body.invites ?? []) {
    if (!invite.email?.trim()) continue;
    if (!ALLOWED_ROLES.includes(invite.role)) {
      results.push({ email: invite.email, status: "invalid_role" });
      continue;
    }

    // If the invited user already has an account, join them immediately
    // rather than waiting for a "first login" claim. Escape LIKE wildcards so
    // an "email" like "%" can't match some other user's account.
    const emailPattern = invite.email.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data: existingUser } = await admin
      .from("users")
      .select("id, organization_id")
      .ilike("email", emailPattern)
      .maybeSingle();

    if (existingUser?.organization_id && existingUser.organization_id !== body.organization_id) {
      // Belongs to another organization — never pull them across
      results.push({ email: invite.email, status: "other_organization" });
      continue;
    }

    if (existingUser) {
      if (!existingUser.organization_id) {
        await admin.from("users").update({ organization_id: body.organization_id }).eq("id", existingUser.id);
      }
      await admin.from("memberships").insert({
        user_id: existingUser.id,
        team_space_id: teamSpaceId,
        role: invite.role,
      }).select();
      results.push({ email: invite.email, status: "joined" });
    } else {
      await admin.from("invites").insert({
        organization_id: body.organization_id,
        team_space_id: teamSpaceId,
        email: invite.email.toLowerCase().trim(),
        role: invite.role,
        invited_by: userData.user.id,
      });
      results.push({ email: invite.email, status: "invited" });
    }
  }

  return jsonResponse({
    team_space_id: teamSpaceId,
    results,
    // Signals the client to show the "onboard, don't just provision"
    // conversation prompt described in User Flow 8.4, distinct from a
    // generic company-wide announcement.
    needs_onboarding_conversation: !!body.is_mandated_rollout,
  });
});
