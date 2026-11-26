// Hold-ups across every project the user can see: which department's task is
// keeping another department waiting, for the Home panel and the sidebar dots.
// The same rules as the project page (dependencyState in crossDepartment.js).
// Kept free of Supabase so `npm test` can load it; holdupsData.js reads the rows.
import { dependencyState, isHoldingUp, overdueDays, daysBetween } from "./crossDepartment.js"

// A task's department: its own, else its project's lead department
const departmentOf = (task) => String(task.team_space_id ?? task.project?.team_space_id ?? "")

/**
 * One row per open cross-department wait.
 * @param {object[]} dependencies task_dependencies rows { task_id, blocker_task_id, created_at }
 *   with `task` (the waiting task) and `blocker` embedded, each with `project` { id, name, team_space_id }
 */
export function buildHoldups(dependencies = [], now = new Date()) {
    return dependencies.flatMap((dep) => {
        const { task, blocker } = dep
        if (!task || !blocker || task.status === "done" || blocker.status === "done") return []
        const waitingDepartmentId = departmentOf(task)
        const blockerDepartmentId = departmentOf(blocker)
        if (waitingDepartmentId === blockerDepartmentId) return []
        // dependencyState reads when this wait began from the task's blocked_by
        const waitingTask = { ...task, blocked_by: [{ id: String(blocker.id), blocked_at: dep.created_at }] }
        const state = dependencyState(waitingTask, blocker, now)
        return [{
            projectId: String(task.project_id),
            projectName: task.project?.name || "A project",
            waitingTask: task,
            blocker,
            waitingDepartmentId,
            blockerDepartmentId,
            state,
            isHolding: isHoldingUp(state),
            lateDays: overdueDays(blocker, now),
            waitingDays: Math.max(0, daysBetween(dep.created_at, now) ?? 0),
        }]
    })
}

/**
 * What concerns this person: hold-ups their departments (or their own tasks)
 * cause, and those keeping their departments waiting. Organization-wide admins
 * see every hold-up under holdingUp. Most late first.
 */
export function holdupsForMe(rows, { departmentIds = [], userId = null, isOrgWide = false }) {
    const mine = new Set(departmentIds.map(String))
    const byLateness = (a, b) => b.lateDays - a.lateDays || b.waitingDays - a.waitingDays
    const holding = rows.filter((r) => r.isHolding)
    const isMineBlocking = (r) => isOrgWide || mine.has(r.blockerDepartmentId) || (userId && r.blocker.assignee_id === userId)
    const isMineWaiting = (r) => !isOrgWide && mine.has(r.waitingDepartmentId)
    return {
        holdingUp: holding.filter(isMineBlocking).sort(byLateness),
        waitingOn: holding.filter((r) => isMineWaiting(r) && !isMineBlocking(r)).sort(byLateness),
        onScheduleCount: rows.filter((r) => !r.isHolding && (isOrgWide || mine.has(r.blockerDepartmentId) || mine.has(r.waitingDepartmentId))).length,
    }
}

/**
 * Projects with at least one hold-up: Map of project id -> a short line such as
 * "Development is holding up Design". `nameOf(departmentId)` gives names.
 */
export function heldUpProjects(rows, nameOf = () => "A department") {
    const result = new Map()
    rows.filter((r) => r.isHolding).sort((a, b) => b.lateDays - a.lateDays).forEach((r) => {
        if (!result.has(r.projectId)) {
            result.set(r.projectId, `${nameOf(r.blockerDepartmentId) || "A department"} is holding up ${nameOf(r.waitingDepartmentId) || "another department"}`)
        }
    })
    return result
}

const days = (n) => `${n} day${n === 1 ? "" : "s"}`

// Why a hold-up counts, in a few words
export function holdupReason(row) {
    if (row.state === "late") return `${days(row.lateDays)} late`
    if (row.state === "conflict") return "due after it's needed"
    if (row.state === "stalled") return `waited on for ${days(row.waitingDays)}, no due date`
    return "on schedule"
}
