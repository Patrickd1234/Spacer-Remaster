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
        return { data: null, error: "Creating projects needs a database update: run the 20261128090000_project_member_access migration in Supabase." }
    }
    return { data: null, error: readable(error, "Couldn't create the project. Please try again.") }
}

export async function updateTaskDepartment(taskId, teamSpaceId) {
    const { error } = await supabase.from("tasks").update({ team_space_id: teamSpaceId }).eq("id", taskId)
    if (error) console.error("Changing the task's department failed:", error)
    return { error: error ? readable(error, "Couldn't change the department.") : null }
}

// A project's dependencies (task_dependencies): { task_id, blocker_task_id,
// created_at, resolved_at, note }[]. Before 20261128110000_task_waiting there
// is no note: read without it then.
export async function fetchTaskDependencies(projectId) {
    const read = (columns) => supabase.from("task_dependencies").select(columns).eq("project_id", projectId)
    let { data, error } = await read("task_id, blocker_task_id, created_at, resolved_at, note")
    if (error?.code === "42703") ({ data, error } = await read("task_id, blocker_task_id, created_at, resolved_at"))
    if (error) {
        console.error("Loading the project's dependencies failed:", error)
        return { data: [], error: "Couldn't load which tasks wait on which." }
    }
    return { data: data || [], error: null }
}

const NO_RIGHTS = "Only either task's assignee or creator, a lead of its department, or a project manager can change this."
const dependencyError = (error, fallback) => (error?.code === "42501" ? NO_RIGHTS : readable(error, fallback))

// `taskId` waits on `blockerId` (either task's side may set it)
export async function addTaskDependency(projectId, taskId, blockerId) {
    const { data, error } = await supabase
        .from("task_dependencies")
        .insert({ project_id: projectId, task_id: taskId, blocker_task_id: blockerId })
        .select("task_id, blocker_task_id, created_at, resolved_at")
        .single()
    if (error) {
        console.error("Adding the dependency failed:", error)
        return { data: null, error: error.code === "23505" ? "It already waits on that task." : dependencyError(error, "Couldn't save the dependency.") }
    }
    return { data, error: null }
}

/**
 * Mark as waiting (design screen 05): `taskId` waits on `blockerId`, with an
 * optional note, and becomes Waiting; with `setWaiting` false only the
 * dependency is added. One transaction (mark_task_waiting(), migration
 * 20261128110000_task_waiting). Resolves to { error }.
 */
export async function markTaskWaiting({ taskId, blockerId, note = "", setWaiting = true }) {
    const { error } = await supabase.rpc("mark_task_waiting", {
        p_task_id: taskId,
        p_blocker_task_id: blockerId,
        p_note: note.trim() || null,
        p_set_waiting: setWaiting,
    })
    if (!error) return { error: null }
    console.error("Marking the task as waiting failed:", error)
    if (error.code === "PGRST202") return { error: "This needs a database update: run the 20261128110000_task_waiting migration in Supabase." }
    return { error: dependencyError(error, "Couldn't save. Please try again.") }
}

export async function removeTaskDependency(taskId, blockerId) {
    const { data, error } = await supabase
        .from("task_dependencies")
        .delete()
        .eq("task_id", taskId)
        .eq("blocker_task_id", blockerId)
        .select("task_id")
    if (error) {
        console.error("Removing the dependency failed:", error)
        return { error: dependencyError(error, "Couldn't remove the dependency.") }
    }
    // Row-level security can quietly delete nothing
    if (!data?.length) return { error: NO_RIGHTS }
    return { error: null }
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

/**
 * A project manager adds a department to an existing project
 * (add_project_department()): it joins at once where they can create projects,
 * otherwise it is invited. Resolves to { status: "active" | "invited", error }.
 */
export async function addProjectDepartment({ projectId, teamSpaceId, leadId = null, dueDate = null }) {
    const { data, error } = await supabase.rpc("add_project_department", {
        p_project_id: projectId, p_team_space_id: teamSpaceId, p_lead_id: leadId || null, p_due_date: dueDate || null,
    })
    if (error) console.error("Adding the department failed:", error)
    return { status: error ? null : data, error: error ? readable(error, "Couldn't add the department.") : null }
}

/**
 * Change a department's lead (project managers) or due date (managers, or the
 * department's lead). `changes`: { lead_id?, due_date? }.
 */
export async function updateProjectDepartment(projectId, teamSpaceId, changes) {
    const { data, error } = await supabase
        .from("project_departments")
        .update(changes)
        .eq("project_id", projectId)
        .eq("team_space_id", teamSpaceId)
        .select("team_space_id")
    if (error) {
        console.error("Changing the department failed:", error)
        return { error: readable(error, "Couldn't save the change.") }
    }
    if (!data?.length) return { error: "You can't change this department." }
    return { error: null }
}

// A project manager removes a department; its tasks move to the lead department
export async function removeProjectDepartment(projectId, teamSpaceId) {
    const { data, error } = await supabase
        .from("project_departments")
        .delete()
        .eq("project_id", projectId)
        .eq("team_space_id", teamSpaceId)
        .select("team_space_id")
    if (error) {
        console.error("Removing the department failed:", error)
        return { error: readable(error, "Couldn't remove the department.") }
    }
    if (!data?.length) return { error: "Only the project's managers can remove a department, and never the lead one." }
    return { error: null }
}
