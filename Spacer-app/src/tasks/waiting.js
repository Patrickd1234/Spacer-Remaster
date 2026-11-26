// What the task panel says about a task's waits (design screens 03, 05, 09):
// the open tasks it waits on, the label "Waiting on Design", and a wait that
// ended recently (the "Dependency resolved" banner). Tasks carry `blocked_by`
// edges { id, blocked_at, resolved_at, note } (attachDependencies).
// `departments`: { team_space_id, name }[], lead department first; on a
// one-department project it may be empty.
// No Supabase, so `npm test` can load it.

export const RECENT_UNBLOCK_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000

const departmentNameOf = (task, departments) => {
    const leadId = departments[0]?.team_space_id
    const id = String(task?.team_space_id ?? leadId ?? "")
    return departments.find((d) => String(d.team_space_id) === id)?.name || ""
}

const edgesOf = (task) => (Array.isArray(task?.blocked_by) ? task.blocked_by : [])

/**
 * The open tasks `task` waits on, oldest wait first:
 * [{ blocker, departmentName, note, since }]. None once the task is done.
 */
export function openWaits(task, tasks = [], departments = []) {
    if (!task || task.status === "done") return []
    const byId = new Map(tasks.map((t) => [String(t.id), t]))
    return edgesOf(task)
        .map((edge) => ({ edge, blocker: byId.get(String(edge.id)) }))
        .filter(({ blocker }) => blocker && blocker.status !== "done")
        .sort((a, b) => String(a.edge.blocked_at || "").localeCompare(String(b.edge.blocked_at || "")))
        .map(({ edge, blocker }) => ({ blocker, departmentName: departmentNameOf(blocker, departments), note: edge.note || "", since: edge.blocked_at }))
}

/**
 * "Waiting on Design" (the departments of the open waits), "Waiting on “Draft”"
 * without departments, "Waiting on 2 tasks" for several in a one-department
 * project; null when nothing open is waited on.
 */
export function waitingLabel(task, tasks = [], departments = []) {
    const waits = openWaits(task, tasks, departments)
    if (waits.length === 0) return null
    const names = [...new Set(waits.map((w) => w.departmentName).filter(Boolean))]
    if (departments.length > 1 && names.length > 0) return `Waiting on ${names.join(", ")}`
    return waits.length === 1 ? `Waiting on “${waits[0].blocker.title}”` : `Waiting on ${waits.length} tasks`
}

/**
 * The wait that ended last, if the task no longer waits on anything open, isn't
 * done or Waiting itself, and it ended within `days`:
 * { blocker, departmentName, resolvedAt } or null.
 */
export function recentUnblock(task, tasks = [], departments = [], now = new Date(), days = RECENT_UNBLOCK_DAYS) {
    if (!task || task.status === "done" || task.status === "waiting") return null
    if (openWaits(task, tasks, departments).length > 0) return null
    const byId = new Map(tasks.map((t) => [String(t.id), t]))
    const latest = edgesOf(task)
        .filter((e) => e.resolved_at && byId.get(String(e.id))?.status === "done")
        .sort((a, b) => String(b.resolved_at).localeCompare(String(a.resolved_at)))[0]
    if (!latest || now.getTime() - new Date(latest.resolved_at).getTime() > days * DAY_MS) return null
    const blocker = byId.get(String(latest.id))
    return { blocker, departmentName: departmentNameOf(blocker, departments), resolvedAt: latest.resolved_at }
}

// The department a task belongs to, by name ("" on a one-department project)
export const taskDepartmentName = (task, departments = []) => (departments.length > 1 ? departmentNameOf(task, departments) : "")

/**
 * Tasks the Mark as Waiting window offers in one department (all with no
 * department picked). `choices` already leave out the task itself, finished
 * tasks and loops (blockableTasks).
 */
export function choicesInDepartment(choices = [], departments = [], departmentId = null) {
    if (departmentId == null || departmentId === "") return choices
    const leadId = departments[0]?.team_space_id
    return choices.filter((t) => String(t.team_space_id ?? leadId ?? "") === String(departmentId))
}

/**
 * Tasks whose wait ended between two loads of the project, assigned to
 * `userId`: Waiting before, and now neither Waiting nor done. For the
 * "Task unblocked" notice.
 */
export function newlyUnblocked(before = [], after = [], userId) {
    if (!userId) return []
    const was = new Map(before.map((t) => [String(t.id), t.status]))
    return after.filter((t) => String(t.assignee_id) === String(userId)
        && was.get(String(t.id)) === "waiting" && t.status !== "waiting" && t.status !== "done")
}
