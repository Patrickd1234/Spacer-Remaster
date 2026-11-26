import { supabase } from "../supabase"

// Reads and writes for the task panel. Row-level security decides what each
// person may see and change; these only shape the requests and the messages.

const HISTORY_LIMIT = 100
const byName = (a, b) => (a.name || "").localeCompare(b.name || "")
const errorText = (error, fallback) => (error?.hint === "subtask" && error.message) || fallback

/** The task's activity_log rows, newest first. Resolves to { data, error }. */
export async function fetchTaskHistory(taskId) {
    const { data, error } = await supabase
        .from("activity_log")
        .select("id, action, actor_id, prior_state, new_state, created_at, actor:users(name)")
        .eq("entity_type", "task")
        .eq("entity_id", taskId)
        .order("created_at", { ascending: false })
        .limit(HISTORY_LIMIT)
    if (error) console.error("Loading the task's history failed:", error)
    return { data: data || [], error: error ? "Couldn't load the history." : null }
}

/**
 * People a task can be assigned to: members of its department plus people
 * added to the project directly (the same list as the Create Task form).
 * Resolves to { data: [{ id, name }], error }.
 */
export async function fetchAssignablePeople(projectId, teamSpaceId) {
    const [department, project] = await Promise.all([
        teamSpaceId
            ? supabase.from("memberships").select("user:users(id, name)").eq("team_space_id", teamSpaceId)
            : Promise.resolve({ data: [] }),
        projectId
            ? supabase.from("project_members").select("user:users(id, name)").eq("project_id", projectId)
            : Promise.resolve({ data: [] }),
    ])
    const failed = department.error || project.error
    if (failed) console.error("Loading who can be assigned failed:", failed)
    const people = new Map()
    for (const row of [...(department.data || []), ...(project.data || [])]) {
        if (row.user?.id) people.set(row.user.id, row.user)
    }
    return { data: [...people.values()].sort(byName), error: failed ? "Couldn't load everyone who can be assigned." : null }
}

/**
 * Saves some of a task's fields. Resolves to { error } (a message or null).
 * .select() confirms a row changed: without the right, an update silently
 * changes nothing.
 */
export async function saveTaskFields(taskId, changes) {
    const { data, error } = await supabase.from("tasks").update(changes).eq("id", taskId).select("id")
    if (error || !data?.length) {
        if (error) console.error("Saving the task failed:", error)
        return { error: errorText(error, "Couldn't save the change. You may not have the right to edit this task.") }
    }
    return { error: null }
}

/** Adds a task. Resolves to { data: the new row, error }. */
export async function insertTask(fields) {
    const { data, error } = await supabase.from("tasks").insert(fields).select().single()
    if (error) console.error("Adding the task failed:", error)
    return { data, error: error ? errorText(error, "Couldn't add it. You may not have the right to add tasks here.") : null }
}
