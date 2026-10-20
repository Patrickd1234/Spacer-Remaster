// MY-01 / MY-02 — My Space aggregation
// Pulls the current user's tasks across every Team Space they belong to in
// a single request (Section 11: "single indexed query across Memberships
// rather than one query per Team Space"), plus their notification feed.
// Runs under the CALLER's own auth context (not the service role) so RLS
// does the permission filtering — this endpoint can only ever return what
// the user could already see via direct table queries.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, badRequest } from "../_shared/cors.ts";
import { callerHeaders } from "../_shared/mfa.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return badRequest("Missing Authorization header");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: callerHeaders(req) },
  });

  const { data: userData, error: userErr } = await client.auth.getUser();
  if (userErr || !userData.user) return badRequest("Not authenticated");
  const userId = userData.user.id;

  // Tasks assigned to me, across every Team Space RLS lets me see, plus
  // General Tasks assigned to me. Labeled with originating team/project
  // per MY-01 acceptance criteria.
  const { data: tasks, error: tasksErr } = await client
    .from("tasks")
    .select(`
      id, title, status, priority, due_date, project_id, organization_id,
      project_spaces ( id, name, team_space_id, team_spaces ( id, name ) )
    `)
    .eq("assignee_id", userId)
    .order("due_date", { ascending: true, nullsFirst: false });

  if (tasksErr) return jsonResponse({ error: tasksErr.message }, 500);

  // Notification feed (MY-02)
  const { data: notifications, error: notifErr } = await client
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  if (notifErr) return jsonResponse({ error: notifErr.message }, 500);

  const shaped = (tasks ?? []).map((t: any) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    due_date: t.due_date,
    is_general_task: t.project_id === null,
    team_space: t.project_spaces?.team_spaces
      ? { id: t.project_spaces.team_spaces.id, name: t.project_spaces.team_spaces.name }
      : null,
    project: t.project_spaces ? { id: t.project_spaces.id, name: t.project_spaces.name } : null,
  }));

  return jsonResponse({
    tasks: shaped,
    notifications: notifications ?? [],
    unread_count: (notifications ?? []).filter((n: any) => !n.read_at).length,
  });
});
