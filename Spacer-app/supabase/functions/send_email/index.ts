// send_email.ts - Supabase Edge Function / TypeScript Email Dispatcher
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Resend } from "npm:resend";
import { isServiceRoleRequest, unauthorized } from "../_shared/webhookAuth.ts";
import { DEFAULT_EMAIL_FROM, escapeHtml, safeUrl } from "../_shared/html.ts";

interface NotificationQueueRecord {
    id: string;
    organization_id: string;
    recipient_email: string;
    notification?: string;
    notification_type?: "invite_team_lead" | "invite_member" | "task_assignment" | "task_overdue" | string;
    payload: {
        organization_name?: string;
        team_space_name?: string;
        project_name?: string;
        task_name?: string;
        role?: string;
        invited_by_email?: string;
        invite_url?: string;
        [key: string]: any;
    };
    status: "pending" | "processing" | "sent" | "failed";
    attempts: number;
    max_attempts: number;
}

interface WebhookPayload {
    type: "INSERT" | "UPDATE";
    table: string;
    schema: string;
    record: NotificationQueueRecord;
}

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(supabaseUrl, serviceRoleKey);
const SENDER_EMAIL = Deno.env.get("EMAIL_FROM") || Deno.env.get("SENDER_EMAIL") || DEFAULT_EMAIL_FROM;
const SITE_URL = Deno.env.get("SITE_URL") || "http://localhost:5173";

// Escape every text field and allow only http(s) links, since queue rows can carry user-entered text
function sanitizePayload(payload: NotificationQueueRecord["payload"] | undefined): Record<string, string> {
    const clean: Record<string, string> = {};
    for (const [key, value] of Object.entries(payload ?? {})) {
        if (value === null || value === undefined) continue;
        clean[key] = key === "invite_url" ? safeUrl(value, SITE_URL) : escapeHtml(value);
    }
    return clean;
}

serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: { "Content-Type": "application/json" } });
    }

    // Only the notification_queue database webhook may trigger emails
    if (!isServiceRoleRequest(req)) {
        return unauthorized();
    }

    try {
        const body: WebhookPayload = await req.json();
        const record = body?.record;

        if (!record || !record.id) {
            return new Response(JSON.stringify({ error: "Invalid payload: missing record" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        const payload = sanitizePayload(record.payload);

        // Handles both 'notification' and 'notification_type' column names
        const notificationType = record.notification || record.notification_type || payload.notification_type;

        // 1. Mark status as 'processing' and increment attempts
        await admin
            .from("notification_queue")
            .update({
                status: "processing",
                attempts: (record.attempts || 0) + 1,
            })
            .eq("id", record.id);

        let subject = "";
        let html = "";

        // 2. Build email subject and body based on notification type
        switch (notificationType) {
            case "task_assignment": {
                const task_name = payload.task_name ?? "a task";
                const assigned_by = payload.invited_by_email ?? "A team administrator";
                const project_name = payload.project_name ?? "your project";
                const task_url = payload.invite_url ?? SITE_URL;

                subject = `You've been assigned to ${task_name}`;
                html = `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.6; color: #1a1a1a; padding: 24px; border: 1px solid #eaeaea; border-radius: 12px;">
                    <div style="border-bottom: 2px solid #aff82a; padding-bottom: 12px; margin-bottom: 20px;">
                        <h2 style="margin: 0; color: #111;">You've been assigned a task!</h2>
                    </div>
                    <p style="font-size: 15px; margin-bottom: 16px;">
                        <strong>${assigned_by}</strong> has assigned you to <strong>${task_name}</strong> in <strong>${project_name}</strong>.
                    </p>
                    <div style="margin: 28px 0;">
                        <a href="${task_url}" 
                            style="background-color: #111318; color: #aff82a; font-weight: bold; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block;">
                            View Task &rarr;
                        </a>
                    </div>
                    <p style="color: #888; font-size: 13px; border-top: 1px solid #eee; padding-top: 16px; margin-top: 24px;">
                        If you weren't expecting this assignment, you can ignore this email.
                    </p>
                </div>`;
                break;
            }

            case "task_overdue": {
                const task_name = payload.task_name ?? "a task";
                subject = `${task_name} is overdue`;
                html = `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.5; padding: 20px;">
                    <h2>Your task is overdue!</h2>
                    <p><strong>${task_name}</strong> is overdue.</p>
                    <p style="color: #666; font-size: 13px;">Please complete this task as soon as possible.</p>
                </div>`;
                break;
            }

            case "org_invite": {
                const orgName = payload.organization_name ?? "an organization";
                const spaceName = payload.team_space_name ?? "a team space";
                const role = payload.role === "team_lead" ? "Team Lead" : "Member";
                const invitedBy = payload.invited_by_email ?? "A team administrator";

                subject = `You've been invited to join ${spaceName} on ${orgName}`;
                html = `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.5; padding: 20px;">
                    <h2>You've been invited!</h2>
                    <p><strong>${invitedBy}</strong> has invited you to join <strong>${orgName}</strong> as a <strong>${role}</strong> in the <strong>${spaceName}</strong> space.</p>
                    <div style="margin: 24px 0;">
                        <a href="${payload.invite_url ?? SITE_URL}" 
                            style="background-color: #000; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; display: inline-block;">
                            Accept Invitation
                        </a>
                    </div>
                    <p style="color: #666; font-size: 13px;">If you weren't expecting this invitation, you can ignore this email.</p>
                </div>`;
                break;
            }

            case "proj_invite": {
                const project_name = payload.project_name ?? "a project";
                const invitedBy = payload.invited_by_email ?? "A team administrator";

                subject = `You've been invited to join ${project_name}`;
                html = `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.5; padding: 20px;">
                    <h2>You've been invited!</h2>
                    <p><strong>${invitedBy}</strong> has invited you to join <strong>${project_name}</strong> space.</p>
                    <div style="margin: 24px 0;">
                        <a href="${payload.invite_url ?? SITE_URL}" 
                            style="background-color: #000; color: #fff; padding: 10px 20px; border-radius: 6px; text-decoration: none; display: inline-block;">
                            Accept Invitation
                        </a>
                    </div>
                    <p style="color: #666; font-size: 13px;">If you weren't expecting this invitation, you can ignore this email.</p>
                </div>`;
                break;
            }

            case "proj_remove": {
                const project_name = payload.project_name ?? "a project";
                const removedBy = payload.invited_by_email ?? "A team administrator";

                subject = `You've been removed from ${project_name}`;
                html = `
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; line-height: 1.5; padding: 20px;">
                    <h2>You've been removed!</h2>
                    <p><strong>${removedBy}</strong> has removed you from <strong>${project_name}</strong> space.</p>
                    <p style="color: #666; font-size: 13px;">If you weren't expecting this removal, you can ignore this email.</p>
                </div>`;
                break;
            }

            default: {
                console.warn(`Unknown notification type: ${notificationType}`);
                return new Response(JSON.stringify({ error: `Unknown notification type: ${notificationType}` }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
            }
        }

        // 3. Dispatch the email via Resend
        try {
            const { error: sendError } = await resend.emails.send({
                from: SENDER_EMAIL,
                to: record.recipient_email,
                subject: subject,
                html: html,
            });

            if (sendError) {
                throw new Error(sendError.message);
            }

            // 4. Mark status as 'sent'
            await admin
                .from("notification_queue")
                .update({
                    status: "sent",
                    processed_at: new Date().toISOString(),
                    last_error: null,
                })
                .eq("id", record.id);

            return new Response(JSON.stringify({ success: true, queue_id: record.id }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        } catch (error) {
            console.error("Failed to process notification:", error);

            // 5. If failed, record error message and mark status as 'failed'
            try {
                await admin
                    .from("notification_queue")
                    .update({
                        status: "failed",
                        last_error: (error as Error).message,
                        next_retry_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
                    })
                    .eq("id", record.id);
            } catch (_) {
                // Ignore secondary error logging failure
            }

            return new Response(JSON.stringify({ error: (error as Error).message }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
            });
        }

    } catch (error) {
        console.error("Unhandled error in serve handler:", error);
        return new Response(JSON.stringify({ error: "Internal server error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
});
