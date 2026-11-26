import { supabase } from "../supabase"
import { normalizeView } from "./taskViews"
import { saveTaskFields } from "./taskPanelData"

// Saved views (task_views, migration 20261127100000), the people a project's
// tasks can go to, and changes to several tasks at once. Row-level security
// decides what each person may do; these shape the requests and messages.

const byName = (a, b) => (a.name || "").localeCompare(b.name || "")
const LAST_VIEW_KEY = (projectId) => `spacer:task-view:${projectId}`

/** The project's saved views: yours and the shared ones. Resolves to { data, error }. */
export async function fetchTaskViews(projectId) {
    const { data, error } = await supabase
        .from("task_views")
        .select("id, project_id, owner_id, name, config, is_shared, updated_at")
        .eq("project_id", projectId)
        .order("name")
    // 42P01: the table isn't there yet (migration not applied); saved views just stay hidden
    if (error && error.code !== "42P01") console.error("Loading saved views failed:", error)
    return {
        data: (data || []).map((row) => ({ ...row, config: normalizeView(row.config) })),
        error: error ? "Couldn't load saved views." : null,
        isAvailable: !error || error.code !== "42P01",
    }
}

/** Saves a new view. Resolves to { data, error }. */
export async function createTaskView(projectId, { name, config, isShared }) {
    const { data, error } = await supabase
        .from("task_views")
        .insert({ project_id: projectId, name: name.trim(), config: normalizeView(config), is_shared: Boolean(isShared) })
        .select("id, project_id, owner_id, name, config, is_shared, updated_at")
        .single()
    if (error) console.error("Saving the view failed:", error)
    return {
        data: data ? { ...data, config: normalizeView(data.config) } : null,
        error: error ? (isShared ? "Couldn't save it. Only the project's managers can share views." : "Couldn't save the view.") : null,
    }
}

/** Changes a view's config or name. Resolves to { error }. */
export async function updateTaskView(id, changes) {
    const payload = {
        ...(changes.name !== undefined ? { name: changes.name.trim() } : {}),
        ...(changes.config !== undefined ? { config: normalizeView(changes.config) } : {}),
    }
    const { data, error } = await supabase.from("task_views").update(payload).eq("id", id).select("id")
    if (error) console.error("Updating the view failed:", error)
    return { error: error || !data?.length ? "Couldn't update it. Only the project's managers can change a shared view." : null }
}

/** Deletes a view. Resolves to { error }. */
export async function deleteTaskView(id) {
    const { data, error } = await supabase.from("task_views").delete().eq("id", id).select("id")
    if (error) console.error("Deleting the view failed:", error)
    return { error: error || !data?.length ? "Couldn't delete it. Only the project's managers can delete a shared view." : null }
}

/** The view last used on this project in this browser, or null. */
export function readLastView(projectId) {
    try {
        const raw = window.localStorage.getItem(LAST_VIEW_KEY(projectId))
        return raw ? normalizeView(JSON.parse(raw)) : null
    } catch {
        return null
    }
}

export function rememberLastView(projectId, view) {
    try {
        window.localStorage.setItem(LAST_VIEW_KEY(projectId), JSON.stringify(normalizeView(view)))
    } catch {
        // Storage blocked or full: the view just isn't remembered
    }
}

/**
 * Everyone a task on the project can be assigned to: members of its
 * departments and people added to the project directly. Resolves to
 * { data: [{ id, name }], error }.
 */
export async function fetchProjectPeople(projectId, departmentIds) {
    const ids = [...new Set((departmentIds || []).filter(Boolean).map(String))]
    const [departments, project] = await Promise.all([
        ids.length > 0
            ? supabase.from("memberships").select("user:users(id, name)").in("team_space_id", ids)
            : Promise.resolve({ data: [] }),
        supabase.from("project_members").select("user:users(id, name)").eq("project_id", projectId),
    ])
    const failed = departments.error || project.error
    if (failed) console.error("Loading the project's people failed:", failed)
    const people = new Map()
    for (const row of [...(departments.data || []), ...(project.data || [])]) {
        if (row.user?.id) people.set(row.user.id, row.user)
    }
    return { data: [...people.values()].sort(byName), error: failed ? "Couldn't load everyone on the project." : null }
}

/**
 * The same change to several tasks, one request each so a task you can't
 * change doesn't stop the others. Resolves to [{ id, error }].
 */
export function updateTasks(ids, changes) {
    return Promise.all(ids.map(async (id) => ({ id, ...(await saveTaskFields(id, changes)) })))
}

/** Deletes several tasks. Resolves to [{ id, error }]. */
export function deleteTasks(ids) {
    return Promise.all(ids.map(async (id) => {
        const { data, error } = await supabase.from("tasks").delete().eq("id", id).select("id")
        if (error) console.error("Deleting a task failed:", error)
        return { id, error: error || !data?.length ? "only its creator or a project manager can delete a task." : null }
    }))
}
