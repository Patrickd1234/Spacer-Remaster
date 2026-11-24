// mfa-recovery
// Two ways back in for someone who lost the phone with their authenticator
// (migration 20261124110000_mfa_recovery.sql has the rules):
//
//   { action: "use_code", code }
//     The person themself, signed in with their password (the code screen,
//     aal1). A valid one-time recovery code removes their authenticator.
//   { action: "admin_reset", user_id }
//     An Owner or Organization Admin with two-factor on, signed in with their
//     code (aal2), removes a member's authenticator (check_two_factor_reset()
//     decides who may).
//
// Either way the authenticator is deleted through the Supabase admin API,
// then finish_two_factor_reset() forgets the person's recovery codes and
// remembered devices, signs out their other sessions and logs it, and the
// person gets an email saying so.
//
// Required secrets: RESEND_API_KEY (for the notice). Optional: EMAIL_FROM, SITE_URL.

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, badRequest } from "../_shared/cors.ts";
import { callerHeaders } from "../_shared/mfa.ts";
import { sendEmail } from "../_shared/email.ts";
import { escapeHtml } from "../_shared/html.ts";

const MAX_CODE_LENGTH = 40;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Method = "recovery_code" | "admin_reset";

// The caller's session id, so a recovery keeps the device that used the code
// signed in. The JWT was already checked by auth.getUser().
function sessionIdOf(accessToken: string): string | null {
  try {
    const payload = accessToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const id = JSON.parse(atob(payload)).session_id;
    return typeof id === "string" && UUID.test(id) ? id : null;
  } catch {
    return null;
  }
}

// deno-lint-ignore no-explicit-any
type AdminClient = SupabaseClient<any, "public", any>;

async function hasVerifiedFactor(admin: AdminClient, userId: string): Promise<boolean> {
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId });
  if (error) throw new Error(`Listing factors failed: ${error.message}`);
  return (data?.factors ?? []).some((f) => f.status === "verified");
}

// Deletes every authenticator (verified or half set up), then the rest
async function resetTwoFactor(
  admin: AdminClient,
  { userId, actorId, method, keepSession }: { userId: string; actorId: string; method: Method; keepSession: string | null },
): Promise<void> {
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId });
  if (error) throw new Error(`Listing factors failed: ${error.message}`);
  for (const factor of data?.factors ?? []) {
    const { error: deleteErr } = await admin.auth.admin.mfa.deleteFactor({ id: factor.id, userId });
    if (deleteErr) throw new Error(`Deleting factor failed: ${deleteErr.message}`);
  }
  const { error: finishErr } = await admin.rpc("finish_two_factor_reset", {
    p_user_id: userId,
    p_actor_id: actorId,
    p_method: method,
    p_keep_session: keepSession,
  });
  if (finishErr) throw new Error(`Finishing the reset failed: ${finishErr.message}`);
}

// The reset is already done, so a failed notice is logged, not returned
async function notifyPerson(admin: AdminClient, userId: string, method: Method, actorName: string | null) {
  try {
    await sendResetNotice(admin, userId, method, actorName);
  } catch (err) {
    console.error(`Two-factor reset notice for ${userId} failed:`, err);
  }
}

async function sendResetNotice(admin: AdminClient, userId: string, method: Method, actorName: string | null) {
  const { data: person, error } = await admin.from("users").select("email, name").eq("id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!person?.email) {
    console.error(`Two-factor reset notice for ${userId} not sent: no email address`);
    return;
  }
  const siteUrl = (Deno.env.get("SITE_URL") || "http://localhost:5173").replace(/\/$/, "");
  const how = method === "recovery_code"
    ? "A recovery code was used to sign in to your account"
    : `${escapeHtml(actorName || "An organization admin")} reset it for you`;
  const sent = await sendEmail({
    to: person.email,
    subject: "Your Spacer two-factor sign-in was reset",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
        <h2 style="color: #1a202c; margin-top: 0;">Hello ${escapeHtml(person.name || "there")},</h2>
        <p style="font-size: 16px; color: #4a5568; line-height: 1.5;">
          Two-factor sign-in was removed from your Spacer account. ${how}.
          Your old authenticator and recovery codes no longer work, and your other devices were signed out.
        </p>
        <p style="font-size: 16px; color: #4a5568; line-height: 1.5;">
          Set up two-factor again with your new phone in Settings → Security &amp; Access.
        </p>
        <p style="font-size: 14px; color: #c53030; line-height: 1.5;">
          If this wasn't you, change your password straight away and tell your organization admin.
        </p>
        <p style="margin-top: 24px;"><a href="${siteUrl}/settings" style="display: inline-block; background-color: #aff82a; color: #1C1F26; font-weight: bold; padding: 10px 18px; border-radius: 8px; text-decoration: none;">Open Settings</a></p>
      </div>
    `,
  });
  if (!sent) console.error(`Two-factor reset notice for ${userId} was not sent`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return badRequest("Use POST");

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return badRequest("Missing Authorization header");
  const accessToken = authHeader.replace(/^Bearer\s+/i, "");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const caller = createClient(supabaseUrl, anonKey, { global: { headers: callerHeaders(req) } });
  const { data: userData, error: userErr } = await caller.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ error: "Not authenticated" }, 401);
  const callerId = userData.user.id;

  let body: { action?: unknown; code?: unknown; user_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    if (body.action === "use_code") {
      const code = typeof body.code === "string" ? body.code.trim() : "";
      if (!code || code.length > MAX_CODE_LENGTH) return badRequest("Enter one of your recovery codes.");
      // Don't use up a code on an account that has nothing to recover
      if (!(await hasVerifiedFactor(admin, callerId))) {
        return badRequest("Two-factor isn't on for this account.");
      }

      const { data: result, error: consumeErr } = await admin.rpc("consume_mfa_recovery_code", {
        p_user_id: callerId,
        p_code: code,
      });
      if (consumeErr) throw new Error(`Checking the code failed: ${consumeErr.message}`);
      if (result === "locked") {
        return jsonResponse({ error: "Too many wrong codes. Wait 15 minutes and try again." }, 429);
      }
      if (result !== "ok") return badRequest("That recovery code didn't work. Each code works only once.");

      try {
        await resetTwoFactor(admin, {
          userId: callerId,
          actorId: callerId,
          method: "recovery_code",
          keepSession: sessionIdOf(accessToken),
        });
      } catch (err) {
        // Give the code back so the person can try again with it
        const { error: restoreErr } = await admin.rpc("restore_mfa_recovery_code", { p_user_id: callerId, p_code: code });
        if (restoreErr) console.error("Restoring the recovery code failed:", restoreErr);
        throw err;
      }
      await notifyPerson(admin, callerId, "recovery_code", null);
      return jsonResponse({ reset: true });
    }

    if (body.action === "admin_reset") {
      const targetId = typeof body.user_id === "string" ? body.user_id : "";
      if (!UUID.test(targetId)) return badRequest("Choose who to reset.");

      // Raises the reason when the caller may not (their own session, so
      // their own organization and roles). It also requires the caller to
      // have two-factor on and to have just passed it (aal2), which is
      // stricter than requireMfa().
      const { error: checkErr } = await caller.rpc("check_two_factor_reset", { p_target: targetId });
      if (checkErr) {
        const shown = checkErr.hint === "rbac";
        if (!shown) console.error("check_two_factor_reset failed:", checkErr);
        return jsonResponse({ error: shown ? checkErr.message : "Couldn't check your permissions." }, shown ? 403 : 500);
      }
      if (!(await hasVerifiedFactor(admin, targetId))) {
        return badRequest("They don't have two-factor on, so there's nothing to reset.");
      }

      await resetTwoFactor(admin, { userId: targetId, actorId: callerId, method: "admin_reset", keepSession: null });
      const { data: actor } = await admin.from("users").select("name").eq("id", callerId).maybeSingle();
      await notifyPerson(admin, targetId, "admin_reset", actor?.name ?? null);
      return jsonResponse({ reset: true });
    }

    return badRequest("Unknown action");
  } catch (err) {
    console.error("mfa-recovery failed:", err);
    return jsonResponse({ error: "Something went wrong. Please try again." }, 500);
  }
});
