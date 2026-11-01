import { supabase } from "../supabase"

// Reads and writes for sprints (20261031090000_sprints.sql). Every call returns
// { data, error }; the database decides who may do what (can_manage_project),
// so errors carry its message for the UI.

const SPRINT_FIELDS = "id, project_id, name, goal, starts_on, ends_on, status, committed_points, committed_tasks, completed_points, completed_tasks, started_at, completed_at, retro_went_well, retro_to_improve, retro_actions, created_at"

function logged(label, result) {
    if (result.error) console.error(`${label} failed:`, result.error)
    return { data: result.data ?? null, error: result.error ?? null }
}

export async function fetchSprints(projectId) {
    return logged("Loading sprints", await supabase.from("sprints").select(SPRINT_FIELDS).eq("project_id", projectId).order("starts_on"))
}

// fields: { name, goal, startsOn, endsOn }
const toRow = ({ name, goal, startsOn, endsOn }) => ({
    name: name.trim(),
    goal: goal?.trim() || null,
    starts_on: startsOn,
    ends_on: endsOn,
})

export async function createSprint(projectId, fields) {
    return logged("Creating the sprint", await supabase.from("sprints").insert({ project_id: projectId, ...toRow(fields) }).select(SPRINT_FIELDS).single())
}

export async function updateSprint(sprintId, fields) {
    return logged("Updating the sprint", await supabase.from("sprints").update(toRow(fields)).eq("id", sprintId).select(SPRINT_FIELDS).single())
}

// Only planned sprints can be deleted; their tasks go back to the backlog
export async function deleteSprint(sprintId) {
    return logged("Deleting the sprint", await supabase.from("sprints").delete().eq("id", sprintId))
}

export async function startSprint(sprintId) {
    return logged("Starting the sprint", await supabase.rpc("start_sprint", { p_sprint_id: sprintId }))
}

// carryOverTo: a planned sprint for unfinished work, or null for the backlog
export async function completeSprint(sprintId, { carryOverTo, wentWell, toImprove, actions }) {
    return logged("Completing the sprint", await supabase.rpc("complete_sprint", {
        p_sprint_id: sprintId,
        p_carry_over_to: carryOverTo || null,
        p_went_well: wentWell || null,
        p_to_improve: toImprove || null,
        p_actions: actions || null,
    }))
}

// sprintId null = back to the backlog
export async function setTaskSprint(taskId, sprintId) {
    return logged("Moving the task", await supabase.from("tasks").update({ sprint_id: sprintId }).eq("id", taskId))
}

export async function setTaskPoints(taskId, points) {
    return logged("Saving the estimate", await supabase.from("tasks").update({ story_points: points }).eq("id", taskId))
}
