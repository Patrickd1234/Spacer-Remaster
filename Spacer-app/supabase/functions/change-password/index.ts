// change-password
// Changes the signed-in user's password only after checking their CURRENT
// password (supabase.auth.updateUser alone doesn't ask for it, so anyone
// with access to an unlocked session could take over the account).
// The check happens here, on a throwaway client, so the user's own session
// isn't replaced or downgraded from its two-factor level. Afterwards the
// user's other sessions are signed out.
//
// Body: { current_password: string, new_password: string }

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, badRequest } from "../_shared/cors.ts";
import { requireMfa } from "../_shared/mfa.ts";

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 72; // bcrypt only uses the first 72 bytes

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return badRequest("Use POST");

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return badRequest("Missing Authorization header");
  const accessToken = authHeader.replace(/^Bearer\s+/i, "");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await caller.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ error: "Not authenticated" }, 401);
  const user = userData.user;

  const mfaBlocked = await requireMfa(caller);
  if (mfaBlocked) return mfaBlocked;

  let body: { current_password?: unknown; new_password?: unknown };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const currentPassword = typeof body.current_password === "string" ? body.current_password : "";
  const newPassword = typeof body.new_password === "string" ? body.new_password : "";

  if (!currentPassword) return badRequest("Enter your current password.");
  if (newPassword.length < MIN_PASSWORD_LENGTH) return badRequest(`New password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  if (newPassword.length > MAX_PASSWORD_LENGTH) return badRequest(`New password must be at most ${MAX_PASSWORD_LENGTH} characters.`);
  if (newPassword === currentPassword) return badRequest("New password must be different from the current one.");

  const hasPasswordLogin = (user.identities ?? []).some((i) => i.provider === "email");
  if (!user.email || !hasPasswordLogin) {
    return badRequest("Your account signs in with Google, so it has no password to change.");
  }

  // Verify the current password on a throwaway client (never touches the user's session)
  const verifier = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: check, error: checkErr } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (checkErr || !check.session) {
    const tooMany = checkErr?.status === 429;
    return badRequest(tooMany ? "Too many attempts. Please wait a few minutes and try again." : "Your current password is incorrect.");
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // The verification created a session of its own; revoke it right away
  await admin.auth.admin.signOut(check.session.access_token, "local");

  const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, { password: newPassword });
  if (updateErr) return badRequest(updateErr.message);

  // Keep this device signed in, sign out everywhere else
  const { error: othersErr } = await admin.auth.admin.signOut(accessToken, "others");
  if (othersErr) console.error("Signing out other sessions failed:", othersErr.message);

  return jsonResponse({ changed: true, other_sessions_signed_out: !othersErr });
});
