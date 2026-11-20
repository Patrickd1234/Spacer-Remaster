import { supabase } from "./supabase"

// Reads and writes for cross-department projects (migration 20261120100000).
// Each call resolves to { error: string | null } (plus data where it reads),
// with a message fit to show on screen; the details go to the console.

// Postgres codes for "column/table/function doesn't exist": the migration isn't applied yet
const MISSING_CODES = new Set(["42703", "42P01", "PGRST202", "PGRST204", "PGRST200"])
export const isMissingSchema = (error) => Boolean(error && MISSING_CODES.has(error.code))
export const MIGRATION_NOTE = "Cross-department projects need a database update: run the 20261120100000_cross_department_projects migration in Supabase."

// The raise exception messages in the migration are written for people; show those as they are
const readable = (error, fallback) => (error?.code === "42501" || error?.code === "23514" || error?.code === "P0001" || error?.code === "P0002")
    ? error.message
    : fallback

const DEPARTMENT_COLUMNS = "team_space_id, lead_id, due_date, is_lead_department, status, signed_off_at, team_space:team_spaces(name), lead:users(name)"

/**
 * A project's departments, lead department first.
 * `available` is false until the migration is applied; the caller then falls back
 * to the project's own department.
 */
export async function fetchProjectDepartments(projectId) {
    const { data, error } = await supabase
        .from("project_departments")
        .select(DEPARTMENT_COLUMNS)
        .eq("project_id", projectId)
    if (isMissingSchema(error)) return { data: [], available: false, error: null }
    if (error) {
        console.error("Loading the project's departments failed:", error)
        return { data: [], available: true, error: "Couldn't load this project's departments." }
    }
    const departments = (data || [])
        .map((row) => ({
            team_space_id: row.team_space_id,
            name: row.team_space?.name || "Department",
            lead_id: row.lead_id,
            lead_name: row.lead?.name || null,
            due_date: row.due_date,
            is_lead_department: row.is_lead_department,
            status: row.status,
        }))
        .sort((a, b) => Number(b.is_lead_department) - Number(a.is_lead_department) || a.name.localeCompare(b.name))
    return { data: departments, available: true, error: null }
}

export async function updateTaskDepartment(taskId, teamSpaceId) {
    const { error } = await supabase.from("tasks").update({ team_space_id: teamSpaceId }).eq("id", taskId)
    if (error) console.error("Changing the task's department failed:", error)
    return { error: error ? readable(error, "Couldn't change the department.") : null }
}

// Marks a task as waiting on another task, or clears that with `blockerId` null
export async function setTaskBlock(taskId, blockerId) {
    const { data, error } = await supabase
        .from("tasks")
        .update({ blocked_by_task_id: blockerId })
        .eq("id", taskId)
        .select("id, blocked_by_task_id, blocked_at")
    if (error) {
        console.error("Saving the task's block failed:", error)
        return { data: null, error: readable(error, "Couldn't save the block.") }
    }
    // Row-level security can quietly update nothing
    if (!data?.length) return { data: null, error: "You can't change this task's block." }
    return { data: data[0], error: null }
}

export async function nudgeDepartment(projectId, teamSpaceId) {
    const { error } = await supabase.rpc("nudge_department", { p_project_id: projectId, p_team_space_id: teamSpaceId })
    if (error) console.error("Nudging the department failed:", error)
    return { error: error ? readable(error, "Couldn't send the nudge.") : null }
}

export async function setDepartmentSignOff(projectId, teamSpaceId, isSignedOff) {
    const { data, error } = await supabase
        .from("project_departments")
        .update({ status: isSignedOff ? "signed_off" : "active" })
        .eq("project_id", projectId)
        .eq("team_space_id", teamSpaceId)
        .select("team_space_id")
    if (error) {
        console.error("Signing the department's part off failed:", error)
        return { error: readable(error, "Couldn't save the sign-off.") }
    }
    if (!data?.length) return { error: "Only the department's lead or a project manager can sign it off." }
    return { error: null }
}
