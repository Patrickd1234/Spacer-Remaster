// supabase/functions/invite-department-member/index.ts
//
// Called from Department.jsx via supabase.functions.invoke("invite-department-member", ...)
//
// Handles BOTH cases from one endpoint, decided by whether `email` already
// has a Spacer account:
//   - Existing account  -> insert membership immediately, log activity,
//                          send a "you've been added" notification email.
//   - No account yet    -> use Supabase Auth's built-in invite-by-email
//                          (creates the auth user + sends a magic-link
//                          email), then immediately create their profile +
//                          membership row so the department assignment is
//                          already in place by the time they set a password.
//
// SECURITY: the caller's permission (admin/super_admin on this team) is
// re-checked here using the service-role client, derived from their JWT —
// never trusted from the request body. A tampered client call cannot add
// someone without actually holding the role server-side.
//
// Deploy: supabase functions deploy invite-department-member
// Required secrets: SITE_URL, RESEND_API_KEY (optional), EMAIL_FROM (optional)
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY are auto-injected.

// @ts-ignore – Deno URL imports, resolved at runtime by the Deno runtime.
import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
// @ts-ignore – Deno URL imports, resolved at runtime by the Deno runtime.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4"
import { corsHeaders } from "../_shared/cors.ts"
import { escapeHtml } from "../_shared/html.ts"
import { requireMfa } from "../_shared/mfa.ts"

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") // optional
const EMAIL_FROM = Deno.env.get("EMAIL_FROM") || "Spacer <notifications@yourdomain.com>"
const SITE_URL = Deno.env.get("SITE_URL") || "http://localhost:5173"

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

    try {
        const authHeader = req.headers.get("Authorization")
        if (!authHeader) return json({ error: "Missing Authorization header" }, 401)

        // Re-derive the caller's identity from their JWT.
        const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
            global: { headers: { Authorization: authHeader } },
        })
        const { data: callerData, error: callerErr } = await callerClient.auth.getUser()
        if (callerErr || !callerData?.user) return json({ error: "Not authenticated" }, 401)
        const mfaBlocked = await requireMfa(callerClient)
        if (mfaBlocked) return mfaBlocked
        const callerId = callerData.user.id

        const body = await req.json().catch(() => ({}))
        const role = body.role
        const team_space_id = body.team_space_id
        const organization_id = body.organization_id
        const email = String(body.email || "").trim().toLowerCase()

        if (!email || !team_space_id) return json({ error: "email and team_space_id are required" }, 400)
        if (!["member", "admin"].includes(role)) return json({ error: "Invalid role" }, 400)

        // ── Permission check (server-side, can't be bypassed from the client)
        const { data: callerMemberships, error: memErr } = await admin
            .from("memberships")
            .select("role, team_space_id")
            .eq("user_id", callerId)

        if (memErr) return json({ error: "Could not verify permissions" }, 500)

        const isSuperAdmin = (callerMemberships || []).some(
            (m: { role: string; team_space_id: string }) => m.role === "super_admin" || m.role === "superadmin"
        )
        const isAdminOnThisTeam = (callerMemberships || []).some(
            (m: { role: string; team_space_id: string }) => m.team_space_id === team_space_id && m.role === "admin"
        )

        if (!isSuperAdmin && !isAdminOnThisTeam) {
            return json({ error: "Only admins or super admins can add members to this department." }, 403)
        }

        const { data: team } = await admin
            .from("team_spaces")
            .select("id, name, organization_id")
            .eq("id", team_space_id)
            .maybeSingle()
        if (!team) return json({ error: "Department not found" }, 404)

        const { data: inviterProfile } = await admin
            .from("users")
            .select("name, email")
            .eq("id", callerId)
            .maybeSingle()
        const inviterName = inviterProfile?.name || inviterProfile?.email || "A Spacer admin"

        // ── Does an account already exist for this email?
        const { data: existingUser } = await admin
            .from("users")
            .select("id, name, email")
            .eq("email", email)
            .maybeSingle()

        if (existingUser) {
            const { data: existingMembership } = await admin
                .from("memberships")
                .select("id")
                .eq("user_id", existingUser.id)
                .eq("team_space_id", team_space_id)
                .maybeSingle()

            if (existingMembership) {
                return json({ error: `${email} is already a member of ${team.name}.` }, 409)
            }

            const { error: insertMemErr } = await admin.from("memberships").insert({
                user_id: existingUser.id,
                team_space_id,
                role,
            })
            if (insertMemErr) return json({ error: insertMemErr.message }, 500)

            // Surfaces in the existing header.jsx in-app notifications feed,
            // which is driven directly off activity_log.
            await admin.from("activity_log").insert({
                entity_type: "membership",
                entity_id: existingUser.id,
                actor_id: callerId,
                action: "invited",
                new_state: { team_space_id, team_name: team.name, role, email },
            })

            // Best-effort audit row. If the `invitations` table hasn't been
            // created yet (see the accompanying migration), this silently
            // no-ops rather than failing the whole request.
            await admin
                .from("invitations")
                .insert({
                    email,
                    organization_id: organization_id || team.organization_id,
                    team_space_id,
                    role,
                    invited_by: callerId,
                    invited_user_id: existingUser.id,
                    status: "accepted",
                    accepted_at: new Date().toISOString(),
                })
                .then(
                    () => {},
                    () => {}
                )

            await sendEmail({
                to: email,
                subject: `You've been added to ${team.name} on Spacer`,
                html: addedToTeamEmailHtml({
                    recipientName: existingUser.name,
                    teamName: team.name,
                    role,
                    inviterName,
                    loginUrl: `${SITE_URL}/login`,
                }),
            })

            return json({ status: "added_existing", message: `${email} added to ${team.name}` })
        }

        // ── No account yet — Supabase's built-in invite creates the auth user
        //    and emails them a magic link to SITE_URL/accept-invite.
        const { data: inviteResult, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
            redirectTo: `${SITE_URL}/accept-invite`,
            data: {
                invited_team_space_id: team_space_id,
                invited_role: role,
                organization_id: organization_id || team.organization_id,
            },
        })

        if (inviteErr) {
            return json({ error: inviteErr.message || "Could not send invite email." }, 500)
        }

        const newUserId = inviteResult?.user?.id
        if (!newUserId) return json({ error: "Invite email sent, but no user id was returned." }, 500)

        // The on_auth_user_created trigger already made the profile row; upsert sets the org on it
        const { error: profileErr } = await admin.from("users").upsert({
            id: newUserId,
            email,
            name: email.split("@")[0],
            organization_id: organization_id || team.organization_id,
        })
        if (profileErr) console.error("Profile insert error (non-fatal):", profileErr.message)

        const { error: newMemErr } = await admin.from("memberships").insert({
            user_id: newUserId,
            team_space_id,
            role,
        })
        if (newMemErr) return json({ error: newMemErr.message }, 500)

        await admin.from("activity_log").insert({
            entity_type: "membership",
            entity_id: newUserId,
            actor_id: callerId,
            action: "invited",
            new_state: { team_space_id, team_name: team.name, role, email },
        })

        await admin
            .from("invitations")
            .insert({
                email,
                organization_id: organization_id || team.organization_id,
                team_space_id,
                role,
                invited_by: callerId,
                invited_user_id: newUserId,
                status: "pending",
            })
            .then(
                () => {},
                () => {}
            )

        // Supabase's inviteUserByEmail() above already sent its own invite
        // email (template editable in Dashboard > Authentication > Email
        // Templates > Invite user) — not sending a second email here.

        return json({ status: "invited_new", message: `Invite sent to ${email}` })
    } catch (err) {
        console.error("invite-department-member error:", err)
        const message = err instanceof Error ? err.message : "Unexpected server error"
        return json({ error: message }, 500)
    }
})

async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
    if (!RESEND_API_KEY) {
        console.warn(`RESEND_API_KEY not set — skipping notify email to ${to}`)
        return
    }
    try {
        await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${RESEND_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ from: EMAIL_FROM, to, subject, html }),
        })
    } catch (err) {
        console.error("sendEmail failed (non-fatal):", err)
    }
}

function addedToTeamEmailHtml({ recipientName, teamName, role, inviterName, loginUrl }: {
    recipientName: string;
    teamName: string;
    role: string;
    inviterName: string;
    loginUrl: string;
}) {
    return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
      <h2>You're in ${escapeHtml(teamName)} \u{1F389}</h2>
      <p>Hi ${escapeHtml(recipientName || "there")},</p>
      <p><strong>${escapeHtml(inviterName)}</strong> just added you to <strong>${escapeHtml(teamName)}</strong> on Spacer as a <strong>${escapeHtml(role)}</strong>.</p>
      <p>You already have an account, so just log in and you'll see it in your Departments list.</p>
      <p><a href="${loginUrl}" style="display:inline-block;background:#aff82a;color:#1C1F26;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Log in to Spacer</a></p>
    </div>
  `
}
