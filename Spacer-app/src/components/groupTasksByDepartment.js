// Groups tasks as departments → projects → tasks for the super admin All Tasks view.
// Tasks need `project_id`, `project_name` and `project_team_space_id`;
// departments are `{ id, name }`, already in display order.
// Only departments and projects that have tasks are returned. Tasks without a
// project, and projects without a department, are collected under "No project" /
// "No department", which always come last.

const NO_DEPARTMENT = "No department"
const NO_PROJECT = "No project"

const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
const lastIfNull = (a, b) => (a.id === null) - (b.id === null)

export function groupTasksByDepartment(tasks, departments) {
    const departmentNames = new Map((departments || []).map((d) => [String(d.id), d.name]))
    const departmentOrder = new Map((departments || []).map((d, i) => [String(d.id), i]))
    const groups = new Map()

    for (const task of tasks || []) {
        const rawDeptId = task.project_team_space_id
        const deptKnown = rawDeptId != null && departmentNames.has(String(rawDeptId))
        const deptId = deptKnown ? String(rawDeptId) : null
        const projectId = task.project_id != null ? String(task.project_id) : null

        if (!groups.has(deptId)) {
            groups.set(deptId, { id: deptId, name: deptId ? departmentNames.get(deptId) : NO_DEPARTMENT, projects: new Map() })
        }
        const dept = groups.get(deptId)
        if (!dept.projects.has(projectId)) {
            dept.projects.set(projectId, { id: projectId, name: projectId ? (task.project_name || "Untitled project") : NO_PROJECT, tasks: [] })
        }
        dept.projects.get(projectId).tasks.push(task)
    }

    return [...groups.values()]
        .sort((a, b) => lastIfNull(a, b) || (departmentOrder.get(a.id) ?? 0) - (departmentOrder.get(b.id) ?? 0))
        .map((dept) => {
            const projects = [...dept.projects.values()].sort((a, b) => lastIfNull(a, b) || byName(a, b))
            return {
                id: dept.id,
                name: dept.name,
                projects,
                taskCount: projects.reduce((sum, p) => sum + p.tasks.length, 0),
            }
        })
}
