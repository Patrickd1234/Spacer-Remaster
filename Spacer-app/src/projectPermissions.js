// Who may create projects, matching the project_spaces insert policy:
// team lead or higher in the project's department, or an org admin.
// `departments` is RoleContext's list: { team_space_id, role, name }.

const PROJECT_MANAGER_ROLES = new Set(["team_lead", "admin", "super_admin", "superadmin"]);

// Ids (as strings) of the departments where the user can create projects
export function projectDepartmentIds(departments = []) {
    return departments
        .filter((d) => PROJECT_MANAGER_ROLES.has(d.role))
        .map((d) => String(d.team_space_id));
}

// Super admins (including org-level admins) can create projects anywhere
export function canCreateProjects({ isSuperAdmin, departments = [] }) {
    return Boolean(isSuperAdmin) || projectDepartmentIds(departments).length > 0;
}
