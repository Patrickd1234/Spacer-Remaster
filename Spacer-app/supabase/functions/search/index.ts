// SEARCH-01 — Global Search
// Runs Postgres full-text search (DEC-03) across tasks, projects, and
// people, under the CALLER's own auth context so RLS filters results
// before they're ever grouped or returned — search cannot be used to
// discover inaccessible content, per Section 9.

import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, badRequest } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return badRequest("Missing Authorization header");

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim();
  if (!q) return badRequest("q parameter is required");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userErr } = await client.auth.getUser();
  if (userErr || !userData.user) return badRequest("Not authenticated");

  const tsQuery = q.split(/\s+/).filter(Boolean).join(" & ");

  const [tasksRes, projectsRes, peopleRes] = await Promise.all([
    client
      .from("tasks")
      .select("id, title, status, project_id")
      .textSearch("search_vector", tsQuery, { type: "plain" })
      .limit(15),
    client
      .from("project_spaces")
      .select("id, name, team_space_id")
      .textSearch("search_vector", tsQuery, { type: "plain" })
      .limit(15),
    client
      .from("users")
      .select("id, name, email")
      .textSearch("search_vector", tsQuery, { type: "plain" })
      .limit(15),
  ]);

  if (tasksRes.error) return jsonResponse({ error: tasksRes.error.message }, 500);
  if (projectsRes.error) return jsonResponse({ error: projectsRes.error.message }, 500);
  if (peopleRes.error) return jsonResponse({ error: peopleRes.error.message }, 500);

  return jsonResponse({
    tasks: tasksRes.data ?? [],
    projects: projectsRes.data ?? [],
    people: peopleRes.data ?? [],
  });
});
