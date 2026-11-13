// What the signed-in person may do, as the database sees it (docs/RBAC.md).
//
// The database decides access: every rule asks has_permission(). The app only
// uses this to show or hide controls, so it must ask the same question
// instead of guessing from role names. my_permissions() returns rows of
// { team_space_id, permission }; a null department means "in the whole
// organization". Kept free of Supabase and React so it can be unit tested.

/**
 * @typedef {{ everywhere: Set<string>, byDepartment: Map<string, Set<string>> }} PermissionIndex
 */

/** @type {PermissionIndex} */
export const EMPTY_PERMISSIONS = { everywhere: new Set(), byDepartment: new Map() };

/**
 * @param {{ team_space_id: string | number | null, permission: string }[] | null | undefined} rows
 * @returns {PermissionIndex}
 */
export function buildPermissionIndex(rows) {
    const everywhere = new Set();
    const byDepartment = new Map();
    for (const row of rows || []) {
        if (row.team_space_id == null) {
            everywhere.add(row.permission);
            continue;
        }
        const id = String(row.team_space_id);
        byDepartment.set(id, new Set([...(byDepartment.get(id) || []), row.permission]));
    }
    return { everywhere, byDepartment };
}

/**
 * May they do this? Name the department for a department permission.
 * @param {PermissionIndex | null | undefined} index
 * @param {string} permission
 * @param {string | number | null} [departmentId]
 * @returns {boolean}
 */
export function can(index, permission, departmentId = null) {
    if (!index) return false;
    if (index.everywhere.has(permission)) return true;
    if (departmentId == null) return false;
    return index.byDepartment.get(String(departmentId))?.has(permission) ?? false;
}

/**
 * May they do this in at least one place? (e.g. show "New project" at all)
 * @param {PermissionIndex | null | undefined} index
 * @param {string} permission
 * @returns {boolean}
 */
export function canAnywhere(index, permission) {
    if (!index) return false;
    if (index.everywhere.has(permission)) return true;
    return [...index.byDepartment.values()].some((granted) => granted.has(permission));
}

// Most powerful first. Mirrors rbac_roles in the database.
const ROLES = [
    { key: "owner", name: "Owner" },
    { key: "org_admin", name: "Organization Admin" },
    { key: "department_admin", name: "Department Admin" },
    { key: "team_lead", name: "Team Lead" },
    { key: "member", name: "Member" },
    { key: "viewer", name: "Viewer" },
];
const FALLBACK_ROLE_NAME = "Member";

/**
 * How a memberships row reads as a role. Mirrors membership_role_key() in the database.
 * @param {string | number | null} teamSpaceId
 * @param {string} role the memberships.role value
 * @returns {string}
 */
export function roleKey(teamSpaceId, role) {
    if (role === "super_admin") return "owner";
    if (role === "admin") return teamSpaceId == null ? "org_admin" : "department_admin";
    return role;
}

/**
 * @param {string} key a role key
 * @returns {string}
 */
export function roleName(key) {
    return ROLES.find((role) => role.key === key)?.name ?? FALLBACK_ROLE_NAME;
}

/**
 * The name of the most powerful role among someone's memberships, for labels.
 * @param {{ team_space_id: string | number | null, role: string }[] | null | undefined} memberships
 * @returns {string}
 */
export function highestRoleName(memberships) {
    const held = new Set((memberships || []).map((m) => roleKey(m.team_space_id, m.role)));
    return ROLES.find((role) => held.has(role.key))?.name ?? FALLBACK_ROLE_NAME;
}
