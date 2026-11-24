import { supabase } from "./supabase"

// Reads and writes for cross-department projects (migration 20261120100000).
// Each call resolves to { error: string | null } (plus data where it reads),
// with a message fit to show on screen; the details go to the console.

// The raise exception messages in the migrations are written for people; show those as they are
export const readable = (error, fallback) => (["42501", "23514", "22023", "P0001", "P0002"].includes(error?.code))
    ? error.message
    : fallback

const DEPARTMENT_COLUMNS = "team_space_id, lead_id, due_date, is_lead_department, status, signed_off_at, invited_at, team_space:team_spaces(name), lead:users(name)"

/**
 * Every department of the caller's organization, { id, name } by name
 * (organization_departments(): team_spaces only shows a team lead their own).
 */
export async function fetchOrganizationDepartments() {
    const { data, error } = await supabase.rpc("organization_departments")
    if (error) {
        console.error("Loading the organization's departments failed:", error)
        return { data: [], error: "Couldn't load the organization's departments." }
    }
    return { data: data || [], error: null }
}

/**
 * A project's departments, lead department first, invited ones included
 * (status "invited"). Empty on failure; callers then fall back to the
 * project's own department.
 */
export async function fetchProjectDepartments(projectId) {
    const { data, error } = await supabase
        .from("project_departments")
        .select(DEPARTMENT_COLUMNS)
        .eq("project_id", projectId)
    if (error) {
        console.error("Loading the project's departments failed:", error)
        return { data: [], error: "Couldn't load this project's departments." }
    }
    // An invited department's name isn't readable through team_spaces
    const isMissingName = (data || []).some((row) => !row.team_space?.name)
    const names = isMissingName ? new Map((await fetchOrganizationDepartments()).data.map((d) => [String(d.id), d.name])) : new Map()
    const departments = (data || [])
        .map((row) => ({
            team_space_id: row.team_space_id,
            name: row.team_space?.name || names.get(String(row.team_space_id)) || "Department",
            lead_id: row.lead_id,
            lead_name: row.lead?.name || null,
            due_date: row.due_date,
            is_lead_department: row.is_lead_department,
            status: row.status,
            invited_at: row.invited_at,
        }))
        .sort((a, b) => Number(b.is_lead_department) - Number(a.is_lead_department) || a.name.localeCompare(b.name))
    return { data: departments, error: null }
}

/**
 * Creates a project with its departments, leads and log entry in one
 * transaction (create_project(); `args` from newProject.js createProjectArgs).
 * Resolves to { data: { project, invitedDepartmentIds }, error: null } or
 * { data: null, error }. project is the project_spaces row.
 */
export async function createProject(args) {
    const { data, error } = await supabase.rpc("create_project", args)
    if (!error) return { data: { project: data?.project, invitedDepartmentIds: data?.invited_department_ids || [] }, error: null }
    console.error("Creating the project failed:", error)
    if (error.code === "PGRST202") {
        return { data: null, error: "Creating projects needs a database update: run the 20261124120000_create_project migration in Supabase." }
    }
    return { data: null, error: readable(error, "Couldn't create the project. Please try again.") }
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
