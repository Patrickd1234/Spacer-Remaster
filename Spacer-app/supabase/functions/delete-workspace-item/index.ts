// delete-workspace-item
// Deletes a project or a whole department, including what the database's
// ON DELETE CASCADE can't reach:
//   - stored files in the project-files bucket ("<project_id>/...")
//   - chat channels of the project/department, and their attachments in the
//     chat-attachments bucket ("<channel_id>/...")
// Storage is removed first; rows are only deleted once that succeeded, so a
// failure leaves everything in place and the delete can simply be retried.
//
// Permission is checked as the CALLER (their JWT) using the same database
// functions the RLS policies use; only then does the service role act.
//   project:    can_manage_project(id)          (department team lead+ / org admin)
//   department: is_admin_of_org(department org) (org admin)
//
// Body: { type: "project" | "department", id: "<uuid>" }

import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, badRequest, notFound } from "../_shared/cors.ts";
import { requireMfa } from "../_shared/mfa.ts";

const PROJECT_FILES_BUCKET = "project-files";
const CHAT_ATTACHMENTS_BUCKET = "chat-attachments";
const LIST_PAGE_SIZE = 1000;
const REMOVE_BATCH_SIZE = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Every object path under a folder, walking sub-folders (folders have no id)
async function listAllPaths(admin: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; ; offset += LIST_PAGE_SIZE) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: LIST_PAGE_SIZE, offset });
    if (error) throw new Error(`Listing ${bucket}/${prefix} failed: ${error.message}`);
    for (const item of data ?? []) {
      const path = `${prefix}/${item.name}`;
      if (item.id === null) paths.push(...(await listAllPaths(admin, bucket, path)));
      else paths.push(path);
    }
    if (!data || data.length < LIST_PAGE_SIZE) return paths;
  }
}

async function removeFolders(admin: SupabaseClient, bucket: string, folders: string[]): Promise<number> {
  const paths = (await Promise.all(folders.map((f) => listAllPaths(admin, bucket, f)))).flat();
  for (let i = 0; i < paths.length; i += REMOVE_BATCH_SIZE) {
    const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + REMOVE_BATCH_SIZE));
    if (error) throw new Error(`Removing files from ${bucket} failed: ${error.message}`);
  }
  return paths.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return badRequest("Use POST");

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return badRequest("Missing Authorization header");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await caller.auth.getUser();
  if (userErr || !userData.user) return jsonResponse({ error: "Not authenticated" }, 401);
  const mfaBlocked = await requireMfa(caller);
  if (mfaBlocked) return mfaBlocked;

  let body: { type?: string; id?: string };
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  const { type, id } = body;
  if (type !== "project" && type !== "department") return badRequest('type must be "project" or "department"');
  if (!id || !UUID_PATTERN.test(id)) return badRequest("id must be a uuid");

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // ── Permission (as the caller) and the set of projects affected
  let projectIds: string[];
  if (type === "project") {
    const { data: allowed, error } = await caller.rpc("can_manage_project", { p_project_id: id });
    if (error) return jsonResponse({ error: "Permission check failed" }, 500);
    if (!allowed) return notFound(); // 404, not 403 — per Tech Spec 7.2
    projectIds = [id];
  } else {
    const { data: dept } = await admin.from("team_spaces").select("organization_id").eq("id", id).maybeSingle();
    if (!dept) return notFound();
    const { data: allowed, error } = await caller.rpc("is_admin_of_org", { p_org_id: dept.organization_id });
    if (error) return jsonResponse({ error: "Permission check failed" }, 500);
    if (!allowed) return notFound();
    const { data: projects, error: projErr } = await admin.from("project_spaces").select("id").eq("team_space_id", id);
    if (projErr) return jsonResponse({ error: projErr.message }, 500);
    projectIds = (projects ?? []).map((p) => p.id);
  }

  // Channels belonging to the department or any affected project
  const channelFilters = [
    ...(type === "department" ? [`department_id.eq.${id}`] : []),
    ...(projectIds.length ? [`project_id.in.(${projectIds.join(",")})`] : []),
  ];
  let channelIds: string[] = [];
  if (channelFilters.length) {
    const { data: channels, error: chErr } = await admin.from("chat_channels").select("id").or(channelFilters.join(","));
    if (chErr) return jsonResponse({ error: chErr.message }, 500);
    channelIds = (channels ?? []).map((c) => c.id);
  }

  try {
    // 1. Stored files first — if this fails, nothing has been deleted yet
    const filesRemoved = await removeFolders(admin, PROJECT_FILES_BUCKET, projectIds);
    const attachmentsRemoved = await removeFolders(admin, CHAT_ATTACHMENTS_BUCKET, channelIds);

    // 2. Channels (messages, members, reactions, attachment rows cascade)
    if (channelIds.length) {
      const { error } = await admin.from("chat_channels").delete().in("id", channelIds);
      if (error) throw new Error(`Deleting chat channels failed: ${error.message}`);
    }

    // 3. The project or department (tasks, files, milestones, members, memberships cascade)
    const { error: delErr } = type === "project"
      ? await admin.from("project_spaces").delete().eq("id", id)
      : await admin.from("team_spaces").delete().eq("id", id);
    if (delErr) throw new Error(`Deleting ${type} failed: ${delErr.message}`);

    await admin.from("activity_log").insert({
      entity_type: type,
      entity_id: id,
      actor_id: userData.user.id,
      action: `${type}_deleted`,
      new_state: { projects: projectIds.length, channels: channelIds.length, files: filesRemoved + attachmentsRemoved },
    });

    return jsonResponse({
      deleted: type,
      projects: projectIds.length,
      channels: channelIds.length,
      files_removed: filesRemoved,
      attachments_removed: attachmentsRemoved,
    });
  } catch (err) {
    console.error("delete-workspace-item failed:", err);
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
