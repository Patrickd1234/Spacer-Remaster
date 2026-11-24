// The Create Project form's rules: which departments it holds, what must be
// filled in, and the arguments for create_project() (migration
// 20261124120000_create_project, invites since 20261124130000_department_invites).
// Kept free of Supabase so `npm test` can load it.
//
// A form department is { teamSpaceId, leadId, dueDate, isInvite? }, lead
// department first. leadId undefined = that department's default lead; "" = no
// lead. isInvite: the user can't create projects there, so it's invited.
import { daysBetween } from "./crossDepartment.js"

/**
 * The picked departments that still fit: the lead falls back to the first
 * department the user may create projects in; the others may be any of the
 * organization's departments and drop out when unknown or repeated.
 * @param {Array<{teamSpaceId, leadId?, dueDate?}>} picked
 * @param {Array<{id}>} creatableTeamSpaces departments the user may create projects in
 * @param {Array<{id}>} [allTeamSpaces] every department of the organization
 */
export function normalizeDepartments(picked = [], creatableTeamSpaces = [], allTeamSpaces = creatableTeamSpaces) {
    const creatable = new Set(creatableTeamSpaces.map((t) => String(t.id)))
    const known = new Set([...allTeamSpaces, ...creatableTeamSpaces].map((t) => String(t.id)))
    const [first, ...rest] = picked
    const leadId = first && creatable.has(String(first.teamSpaceId)) ? first.teamSpaceId : creatableTeamSpaces[0]?.id
    if (!leadId) return []
    const seen = new Set([String(leadId)])
    const extras = rest.filter((d) => {
        const ok = known.has(String(d.teamSpaceId)) && !seen.has(String(d.teamSpaceId))
        seen.add(String(d.teamSpaceId))
        return ok
    })
    return [{ ...(first || { dueDate: "" }), teamSpaceId: leadId }, ...extras]
}

/**
 * What still needs fixing before the project can be created, or null.
 * With one department the deadline is optional; with more it is required and
 * no department (an empty due date means the deadline) may be due after it.
 */
export function newProjectProblem({ name, deadline, departments, nameOf }) {
    if (!String(name || "").trim()) return "Please specify a project name."
    if (departments.length === 0) return "You can only create projects in a department where you're a team lead or admin."
    if (departments.length > 1 && !deadline) return "Please pick the overall deadline."
    if (!deadline) return null
    const late = departments.find((d) => d.dueDate && daysBetween(deadline, d.dueDate) > 0)
    return late ? `${nameOf(late.teamSpaceId)} is due after the overall deadline.` : null
}

/**
 * Arguments for supabase.rpc("create_project"). `departments` carry their
 * resolved leadId, and `isInvite` for a department the user can't create
 * projects in: it is invited, and its own lead picks who leads it on accepting.
 * With one department, the project lead leads it and it is due on the deadline.
 */
export function createProjectArgs({ name, deadline, projectLeadId, departments }) {
    const isShared = departments.length > 1
    const leadOf = (d) => {
        if (d.isInvite) return null
        return (isShared ? d.leadId : projectLeadId) || null
    }
    return {
        p_name: String(name || "").trim(),
        p_due_date: deadline || null,
        p_project_lead: projectLeadId || null,
        p_departments: departments.map((d) => ({
            team_space_id: d.teamSpaceId,
            lead_id: leadOf(d),
            due_date: (isShared && d.dueDate) || null,
        })),
    }
}
