// Figures for the Departments tab (design screen 2) and the board's dependency
// summary (design screen 4), from summarizeDepartments() rows and tasks with
// their `blocked_by` edges. No Supabase, so `npm test` can load it.

const isDone = (t) => t.status === "done"
const departmentOf = (task, leadId) => String(task.team_space_id ?? leadId ?? "")
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`

// "10 Dec" or "10 Dec 2026" from a date or timestamp string
export const formatDay = (value, withYear = false) => {
    if (!value) return ""
    const [y, m, d] = String(value).slice(0, 10).split("-").map(Number)
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", ...(withYear ? { year: "numeric" } : {}) })
}

/**
 * The four tiles: departments, tasks done of all, overdue tasks, and how many
 * departments wait on another one.
 */
export function departmentStats(summaries = []) {
    return {
        departments: summaries.length,
        done: summaries.reduce((n, s) => n + s.done, 0),
        total: summaries.reduce((n, s) => n + s.total, 0),
        overdue: summaries.reduce((n, s) => n + s.overdue, 0),
        waitingDepartments: summaries.filter((s) => s.waitingOn.length > 0).length,
    }
}

// The cards and table under a status filter ("" = all)
export const filterByStatus = (summaries = [], status = "") => (status ? summaries.filter((s) => s.status === status) : summaries)

/**
 * Who waits on whom, one entry per pair: { from, to, tasks, holdingTasks,
 * days, label } where `label` describes the department waited on: "holding
 * up 2 tasks" when it holds the other up, else "2 tasks on schedule".
 */
export function dependencyPairs(summaries = []) {
    return summaries.flatMap((s) => s.waitingOn.map((link) => ({
        from: s.id,
        to: String(link.departmentId),
        tasks: link.tasks,
        holdingTasks: link.holdingTasks,
        days: link.days,
        label: link.holdingTasks > 0 ? `holding up ${plural(link.holdingTasks, "task")}` : `${plural(link.tasks, "task")} on schedule`,
    })))
}

/**
 * Project members per department: Map of team_space_id to how many of
 * `memberIds` belong to it. `memberships`: { user_id, team_space_id }[].
 */
export function departmentMemberCounts(memberIds = [], memberships = []) {
    const members = new Set(memberIds.map(String))
    const seen = new Set()
    const counts = new Map()
    memberships.forEach((m) => {
        const key = `${m.team_space_id}:${m.user_id}`
        if (!members.has(String(m.user_id)) || seen.has(key)) return
        seen.add(key)
        counts.set(String(m.team_space_id), (counts.get(String(m.team_space_id)) || 0) + 1)
    })
    return counts
}

/**
 * The board's dependency summary bar. On a Collab project: open tasks waiting
 * on open work of another department, by that department (each task under the
 * first such wait), and how many open tasks hold up a task of another
 * department; waits inside one department aren't counted. With one department:
 * every open task waiting on open work.
 * `departments`: { team_space_id, name }[], lead first; with one department
 * (or none) the counts aren't split.
 * Returns { waiting: [{ name, count }], waitingTotal, blockingOthers, text }.
 */
export function boardDependencySummary(tasks = [], departments = []) {
    const leadId = departments[0]?.team_space_id
    const hasDepartments = departments.length > 1
    const byId = new Map(tasks.map((t) => [String(t.id), t]))
    const nameOf = (id) => departments.find((d) => String(d.team_space_id) === id)?.name || "another department"
    const openWaitsOf = (t) => (isDone(t) ? [] : (t.blocked_by || []).map((e) => byId.get(String(e.id))).filter((b) => b && !isDone(b)))

    const waitingCounts = new Map()
    let waitingTotal = 0
    const blockers = new Set()
    tasks.forEach((t) => {
        const own = departmentOf(t, leadId)
        const waits = openWaitsOf(t).filter((b) => !hasDepartments || departmentOf(b, leadId) !== own)
        if (waits.length === 0) return
        waitingTotal += 1
        const name = hasDepartments ? nameOf(departmentOf(waits[0], leadId)) : ""
        waitingCounts.set(name, (waitingCounts.get(name) || 0) + 1)
        if (hasDepartments) waits.forEach((b) => blockers.add(String(b.id)))
    })
    const waiting = [...waitingCounts].map(([name, count]) => ({ name, count }))
    const verb = (n) => (n === 1 ? "is" : "are")
    const waitingText = waitingTotal === 0
        ? (hasDepartments ? "No task is waiting on another department" : "No task is waiting")
        : hasDepartments
            ? waiting.map((w) => `${plural(w.count, "task")} ${verb(w.count)} waiting on ${w.name}`).join(", ")
            : `${plural(waitingTotal, "task")} ${verb(waitingTotal)} waiting on other tasks`
    const text = hasDepartments
        ? `${waitingText} • ${plural(blockers.size, "task")} ${verb(blockers.size)} blocking other departments`
        : waitingText
    return { waiting, waitingTotal, blockingOthers: blockers.size, text }
}
