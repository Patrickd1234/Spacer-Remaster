import { supabase } from "../supabase"

// Reads and writes for a project's sprints (migration 20261031090000).
// Row-level security shows sprints to everyone with project access; only
// project managers create, start, complete or plan them, and the database
// enforces that. Every function returns { data, error } and never throws.

const SPRINT_FIELDS = "id, project_id, name, goal, starts_on, ends_on, status, committed_points, committed_tasks, completed_points, completed_tasks, started_at, completed_at, retro_went_well, retro_to_improve, retro_actions, created_at"

// Messages the sprint functions raise are written for people; anything else
// (network, permissions) gets a general one
const READABLE = /^(Only |Complete the active sprint|Unfinished work|A task can only|Sprint not found)/

export function sprintErrorMessage(error, fallback) {
    return error?.message && READABLE.test(error.message) ? error.message : fallback
}

export async function fetchSprints(projectId) {
    const { data, error } = await supabase.from("sprints").select(SPRINT_FIELDS).eq("project_id", projectId).order("starts_on")
    if (error) console.error("Loading sprints failed:", error)
    return { data: data || [], error }
}

export async function fetchCanEditProject(projectId) {
    const { data, error } = await supabase.rpc("can_edit_project", { p_project_id: projectId })
    if (error) console.error("Checking project access failed:", error)
    return { data: Boolean(data) && !error, error }
}

// form: { name, goal, startsOn, endsOn }
const sprintRow = (form) => ({
    name: form.name.trim(),
    goal: form.goal.trim() || null,
    starts_on: form.startsOn,
    ends_on: form.endsOn,
})

export async function createSprint(projectId, form) {
    const { data, error } = await supabase.from("sprints").insert({ ...sprintRow(form), project_id: projectId }).select(SPRINT_FIELDS).single()
    if (error) console.error("Creating sprint failed:", error)
    return { data, error }
}

export async function updateSprint(sprintId, form) {
    const { data, error } = await supabase.from("sprints").update(sprintRow(form)).eq("id", sprintId).select(SPRINT_FIELDS).single()
    if (error) console.error("Updating sprint failed:", error)
    return { data, error }
}

// Only sprints that never started; their tasks go back to the backlog
export async function deleteSprint(sprintId) {
    const { error } = await supabase.from("sprints").delete().eq("id", sprintId)
    if (error) console.error("Deleting sprint failed:", error)
    return { data: null, error }
}

export async function startSprint(sprintId) {
    const { data, error } = await supabase.rpc("start_sprint", { p_sprint_id: sprintId })
    if (error) console.error("Starting sprint failed:", error)
    return { data, error }
}

// carryOverTo: a planned sprint's id, or null for the backlog
export async function completeSprint(sprintId, { carryOverTo, wentWell, toImprove, actions }) {
    const { data, error } = await supabase.rpc("complete_sprint", {
        p_sprint_id: sprintId,
        p_carry_over_to: carryOverTo || null,
        p_went_well: wentWell,
        p_to_improve: toImprove,
        p_actions: actions,
    })
    if (error) console.error("Completing sprint failed:", error)
    return { data, error }
}

// sprintId null moves the task back to the backlog
export async function setTaskSprint(taskId, sprintId) {
    const { error } = await supabase.from("tasks").update({ sprint_id: sprintId }).eq("id", taskId)
    if (error) console.error("Moving task between sprints failed:", error)
    return { data: null, error }
}

export async function setTaskPoints(taskId, points) {
    const { error } = await supabase.from("tasks").update({ story_points: points }).eq("id", taskId)
    if (error) console.error("Estimating task failed:", error)
    return { data: null, error }
}
