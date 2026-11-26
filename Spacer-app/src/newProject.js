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

export const DESCRIPTION_MAX = 250

/**
 * What still needs fixing before the project can be created, or null.
 * The overall deadline, the project lead and each joined department's lead
 * are required (design doc "Project Creation & Cross-Department Workflow");
 * a department with nobody in it yet may go without a lead. No department (an
 * empty due date means the deadline) may be due after the deadline.
 * Departments carry `leadId` (resolved), `hasPeople` and `isInvite`.
 */
export function newProjectProblem({ name, deadline, projectLeadId, description = "", departments, nameOf }) {
    if (!String(name || "").trim()) return "Please specify a project name."
    if (departments.length === 0) return "You can only create projects in a department where you're a team lead or admin."
    if (!projectLeadId) return "Please pick the project lead."
    if (!deadline) return "Please pick the overall deadline."
    if (String(description || "").trim().length > DESCRIPTION_MAX) return `The description can be at most ${DESCRIPTION_MAX} characters.`
    const leadless = departments.find((d) => !d.isInvite && d.hasPeople && !d.leadId)
    if (leadless) return `Please pick a lead for ${nameOf(leadless.teamSpaceId)}.`
    const late = departments.find((d) => d.dueDate && daysBetween(deadline, d.dueDate) > 0)
    return late ? `${nameOf(late.teamSpaceId)} is due after the overall deadline.` : null
}

/**
 * Arguments for supabase.rpc("create_project") (migration
 * 20261128090000_project_member_access). `departments` carry their resolved
 * leadId and the picked memberIds. An invited department (`isInvite`) is sent
 * without a lead: its own lead picks one, and confirms the picked members, on
 * accepting.
 */
export function createProjectArgs({ name, deadline, projectLeadId, description = "", departments }) {
    return {
        p_name: String(name || "").trim(),
        p_due_date: deadline || null,
        p_project_lead: projectLeadId || null,
        p_description: String(description || "").trim() || null,
        p_departments: departments.map((d) => ({
            team_space_id: d.teamSpaceId,
            lead_id: d.isInvite ? null : d.leadId || null,
            due_date: d.dueDate || null,
            member_ids: [...new Set(d.memberIds || [])],
        })),
    }
}

/**
 * The people of one department for the member picker, each once, by name:
 * { id, name, jobTitle }. `memberships` are org_team_memberships() rows
 * ({ user_id, team_space_id }); `usersById` a Map of id to { name, job_title }.
 */
export function departmentPeople(memberships = [], usersById = new Map(), teamId) {
    const team = String(teamId)
    const byId = new Map()
    memberships.forEach((m) => {
        if (String(m.team_space_id) !== team || !m.user_id || byId.has(m.user_id)) return
        const user = usersById.get(m.user_id) || {}
        byId.set(m.user_id, { id: m.user_id, name: user.name || "Unnamed", jobTitle: user.job_title || "" })
    })
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
}

// Whether a person matches the picker's search: any part of the name or job title
export function matchesPerson(person, query) {
    const q = String(query || "").trim().toLowerCase()
    if (!q) return true
    return person.name.toLowerCase().includes(q) || (person.jobTitle || "").toLowerCase().includes(q)
}

// The member list with `userId` added, or removed if it was there
export function toggleMember(memberIds = [], userId) {
    return memberIds.includes(userId) ? memberIds.filter((id) => id !== userId) : [...memberIds, userId]
}

/**
 * Who joins the project for a department: its lead (always added, see
 * create_project()) and the picked members, each once. An invited
 * department's list is a proposal; its lead joins when they accept.
 */
export function selectedMemberIds(department) {
    const lead = !department.isInvite && department.leadId ? [department.leadId] : []
    return [...new Set([...lead, ...(department.memberIds || [])])]
}

/**
 * Department dates after the overall deadline changes: an empty date, one that
 * followed the old deadline, or one now after the new deadline takes the new
 * deadline; dates picked by hand that still fit stay. Clearing the deadline
 * changes nothing.
 */
export function applyDeadlineChange(departments, oldDeadline, newDeadline) {
    if (!newDeadline) return departments
    const follows = (d) => !d.dueDate || d.dueDate === oldDeadline || daysBetween(newDeadline, d.dueDate) > 0
    return departments.map((d) => (follows(d) ? { ...d, dueDate: newDeadline } : d))
}
