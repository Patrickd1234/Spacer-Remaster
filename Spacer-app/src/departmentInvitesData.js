import { supabase } from "./supabase"
import { readable } from "./crossDepartmentData"

// Invites for a department to work on a project (migration
// 20261124130000_department_invites). Each call resolves to { error } (plus
// data where it reads), with a message fit to show on screen.

/**
 * Invites the signed-in person can answer: for departments where they manage
 * projects. Rows: { project_id, project_name, project_due_date, lead_team_space_id,
 * lead_department_name, team_space_id, department_name, due_date,
 * invited_by_name, invited_at, proposed_member_ids } (the members the inviter
 * proposed, since 20261128090000_project_member_access).
 */
export async function fetchMyDepartmentInvites() {
    const { data, error } = await supabase.rpc("my_department_invites")
    if (error) {
        console.error("Loading department invites failed:", error)
        return { data: [], error: "Couldn't load your department's invites." }
    }
    return { data: data || [], error: null }
}

// Members of a department, for picking who leads its part and who works on
// it: { id, name, job_title }[] by name
export async function fetchDepartmentPeople(teamSpaceId) {
    const { data, error } = await supabase
        .from("memberships")
        .select("users(id, name, job_title)")
        .eq("team_space_id", teamSpaceId)
    if (error) {
        console.error("Loading the department's people failed:", error)
        return { data: [], error: "Couldn't load the department's people." }
    }
    const people = new Map((data || []).filter((row) => row.users?.id).map((row) => [row.users.id, row.users]))
    return { data: [...people.values()].sort((a, b) => (a.name || "").localeCompare(b.name || "")), error: null }
}

/**
 * Accept (with who leads the department's part, who works on it, and
 * optionally another due date) or decline. Declining removes the invite.
 * memberIds null keeps the inviter's proposal.
 */
export async function respondToDepartmentInvite({ projectId, teamSpaceId, isAccepting, leadId = null, dueDate = null, memberIds = null }) {
    const { error } = await supabase.rpc("respond_to_department_invite", {
        p_project_id: projectId,
        p_team_space_id: teamSpaceId,
        p_accept: isAccepting,
        p_lead_id: leadId || null,
        p_due_date: dueDate || null,
        // null keeps the proposal; [] means "nobody but the lead"
        p_member_ids: isAccepting && Array.isArray(memberIds) ? memberIds : null,
    })
    if (error) console.error("Answering the department invite failed:", error)
    return { error: error ? readable(error, "Couldn't answer the invite. Please try again.") : null }
}

// A project manager withdraws an invite that hasn't been answered
export async function cancelDepartmentInvite(projectId, teamSpaceId) {
    const { data, error } = await supabase
        .from("project_departments")
        .delete()
        .eq("project_id", projectId)
        .eq("team_space_id", teamSpaceId)
        .eq("status", "invited")
        .select("team_space_id")
    if (error) {
        console.error("Cancelling the department invite failed:", error)
        return { error: readable(error, "Couldn't cancel the invite.") }
    }
    if (!data?.length) return { error: "This invite was already answered or cancelled." }
    return { error: null }
}
