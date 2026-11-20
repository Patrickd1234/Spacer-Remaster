// A project's departments: the main one (project_spaces.team_space_id) plus
// extra ones in project_departments (migration 20261112100000).

// Departments an extra-department picker can offer: not the main one and not
// one another picker already chose. `ownChoice` is that picker's current pick.
export function addableDepartments(teamSpaces = [], mainId, chosenIds = [], ownChoice = null) {
    const taken = new Set([String(mainId), ...chosenIds.map(String)]);
    if (ownChoice != null) taken.delete(String(ownChoice));
    return teamSpaces.filter((t) => !taken.has(String(t.id)));
}

// Projects that belong to a department, as main or extra department, each once
export function projectsInDepartment(projects = [], links = [], teamId) {
    const team = String(teamId);
    const linked = new Set((links || []).filter((l) => String(l.team_space_id) === team).map((l) => String(l.project_id)));
    return projects.filter((p) => String(p.team_space_id) === team || linked.has(String(p.id)));
}

// Team lead choices across the picked departments: one entry per person, with
// the departments they belong to (in picked order) shown in the label.
// `rows` are memberships: { team_space_id, users: { id, name } }.
export function teamLeadOptions(rows = [], teamSpaces = [], pickedIds = []) {
    const order = pickedIds.map(String);
    const nameOf = new Map(teamSpaces.map((t) => [String(t.id), t.name]));
    const byUser = new Map();
    (rows || []).forEach((row) => {
        const team = String(row.team_space_id);
        if (!row.users?.id || !order.includes(team)) return;
        const entry = byUser.get(row.users.id) || { id: row.users.id, name: row.users.name || "Unnamed", teams: new Set() };
        byUser.set(row.users.id, { ...entry, teams: new Set([...entry.teams, team]) });
    });
    return [...byUser.values()]
        .map(({ id, name, teams }) => {
            const departments = order.filter((t) => teams.has(t)).map((t) => nameOf.get(t) || "Department");
            return { id, name, departments, label: `${name} (${departments.join(", ")})` };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
}

const LEAD_ROLES = new Set(["team_lead", "admin", "super_admin"]);

// A department's lead choices on the Create Project form: its own members,
// sorted by name. The default is its first team lead (or higher), if any.
// `rows` are memberships: { team_space_id, role, users: { id, name } }.
export function departmentLeadOptions(rows = [], teamId) {
    const team = String(teamId);
    const byUser = new Map();
    (rows || []).forEach((row) => {
        if (String(row.team_space_id) !== team || !row.users?.id) return;
        const isLead = LEAD_ROLES.has(row.role) || Boolean(byUser.get(row.users.id)?.isLead);
        byUser.set(row.users.id, { id: row.users.id, name: row.users.name || "Unnamed", isLead });
    });
    const options = [...byUser.values()].sort((a, b) => a.name.localeCompare(b.name));
    return { options, defaultId: options.find((o) => o.isLead)?.id ?? "" };
}

// People the Add Members window offers: members of the project's departments
// (one department, or all of a cross-department project's), each once, sorted
// by name, with the departments they're in. `excludeIds`: a Set of user ids
// already on the project. `rows` are memberships: { team_space_id, user }.
export function addableProjectMembers(rows = [], departments = [], excludeIds = new Set()) {
    const nameOf = new Map(departments.map((d) => [String(d.team_space_id), d.name]));
    const order = departments.map((d) => String(d.team_space_id));
    const byUser = new Map();
    (rows || []).forEach((row) => {
        const user = row.user;
        if (!user?.id || excludeIds.has(user.id)) return;
        const entry = byUser.get(user.id) || { ...user, teams: new Set() };
        byUser.set(user.id, { ...entry, teams: new Set([...entry.teams, String(row.team_space_id)]) });
    });
    return [...byUser.values()]
        .map(({ teams, ...user }) => ({
            ...user,
            departments: order.filter((id) => teams.has(id)).map((id) => nameOf.get(id)),
        }))
        .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}
