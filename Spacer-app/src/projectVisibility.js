// Which department projects someone sees listed (sidebar Team Spaces and Projects).
// Kept free of imports so `npm test` can load it without Supabase.
//
// Organization admins and super admins see every project. A department's team
// leads and admins see all of that department's projects (including shared
// projects it works on). Everyone else sees only projects they lead, were added
// to, or have a task assigned in.

const MANAGER_ROLES = new Set(["team_lead", "admin", "super_admin", "superadmin"])

/**
 * @param {object} options
 * @param {Array<{id, team_space_id, team_lead}>} options.projects
 * @param {Array<{project_id, team_space_id}>} [options.links] a project's other departments
 * @param {Array<{team_space_id, role}>} options.myDepartments
 * @param {Set<string>} options.myProjectIds projects the user was added to or has a task in
 */
export function visibleProjects({ projects = [], links = [], userId, isOrgAdmin = false, myDepartments = [], myProjectIds = new Set() }) {
    if (isOrgAdmin) return projects
    const managed = new Set(myDepartments.filter((d) => MANAGER_ROLES.has(d.role)).map((d) => String(d.team_space_id)))
    const mine = new Set([...myProjectIds].map(String))
    const departmentsOf = (project) => [
        String(project.team_space_id),
        ...links.filter((l) => String(l.project_id) === String(project.id)).map((l) => String(l.team_space_id)),
    ]
    return projects.filter((project) =>
        (userId && project.team_lead === userId)
        || mine.has(String(project.id))
        || departmentsOf(project).some((id) => managed.has(id))
    )
}
