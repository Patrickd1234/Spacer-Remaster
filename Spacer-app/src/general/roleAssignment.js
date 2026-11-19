// Rules for the Directory's role editor (docs/RBAC.md, step 5). Kept free of
// React and Supabase so they can be unit tested.
import { roleKey } from "../permissions.js"

// What an organization admin can give someone in a department. The first
// option removes them from the department. Owner and Organization Admin are
// not department roles; Organization Admin is a separate switch, and Owner
// changes only by migration for now.
export const DEPARTMENT_ROLE_OPTIONS = [
    { key: "", name: "Not a member" },
    { key: "viewer", name: "Viewer" },
    { key: "member", name: "Member" },
    { key: "team_lead", name: "Team Lead" },
    { key: "department_admin", name: "Department Admin" },
]

/**
 * The person's role in one department, as a role key, or "" if none.
 * @param {{ teams?: { id: string, role: string }[] }} person
 * @param {string} teamId
 * @returns {string}
 */
export function departmentRoleKey(person, teamId) {
    const team = (person.teams || []).find((t) => String(t.id) === String(teamId))
    return team ? roleKey(team.id, team.role) : ""
}

/**
 * @param {{ orgRole?: string | null }} person
 * @returns {boolean}
 */
export function isOwner(person) {
    return person.orgRole === "owner"
}

/**
 * Whether the viewer may change this person's roles: they must hold
 * member.assign_role, it must be someone else, and never an owner.
 * @param {{ person: { id: string, orgRole?: string | null }, viewerId: string | null, canAssign: boolean }} args
 * @returns {boolean}
 */
export function canEditRoles({ person, viewerId, canAssign }) {
    return Boolean(canAssign) && person.id !== viewerId && !isOwner(person)
}
