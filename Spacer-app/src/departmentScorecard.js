// The Reports page's department scorecard: across every project the person can
// see, how each department is doing and how much it holds others up. Kept free
// of Supabase so `npm test` can load it; departmentScorecardData.js reads.
import { daysBetween, overdueDays, dependencyState, isHoldingUp } from "./crossDepartment.js"

const departmentOf = (task) => String(task.team_space_id ?? task.project?.team_space_id ?? "")

/**
 * One row per department with tasks:
 * { id, name, open, overdue, onTimeRate (0..1, null when nothing finished had
 *   a due date), holdingUpNow (open waits it holds up in other departments),
 *   heldUpNow (its open tasks held up by others), othersWaitedDays (days other
 *   departments have waited on it, finished and ongoing waits) }
 * Most holding-up first, then most overdue.
 * @param {object[]} tasks with team_space_id, status, due_date, completed_at, project { team_space_id }
 * @param {object[]} dependencies task_dependencies rows
 */
export function departmentScorecard({ tasks = [], dependencies = [], nameOf = () => "A department", now = new Date() }) {
    const byId = new Map(tasks.map((t) => [String(t.id), t]))
    const rows = new Map()
    const rowFor = (id) => {
        if (!rows.has(id)) rows.set(id, { id, name: nameOf(id) || "A department", open: 0, overdue: 0, finishedWithDue: 0, finishedOnTime: 0, holdingUpNow: 0, heldUpNow: 0, othersWaitedDays: 0 })
        return rows.get(id)
    }

    for (const task of tasks) {
        const row = rowFor(departmentOf(task))
        if (task.status !== "done") {
            row.open += 1
            if (overdueDays(task, now) > 0) row.overdue += 1
        } else if (task.due_date && task.completed_at) {
            row.finishedWithDue += 1
            if ((daysBetween(task.due_date, task.completed_at) ?? 1) <= 0) row.finishedOnTime += 1
        }
    }

    for (const dep of dependencies) {
        const waiting = byId.get(String(dep.task_id))
        const blocker = byId.get(String(dep.blocker_task_id))
        if (!waiting || !blocker) continue
        const waitingDept = departmentOf(waiting)
        const blockerDept = departmentOf(blocker)
        if (waitingDept === blockerDept) continue
        const waitEnd = dep.resolved_at || (blocker.status === "done" ? blocker.completed_at : null) || now
        rowFor(blockerDept).othersWaitedDays += Math.max(0, daysBetween(dep.created_at, waitEnd) ?? 0)
        const isOpen = !dep.resolved_at && blocker.status !== "done" && waiting.status !== "done"
        const withEdge = { ...waiting, blocked_by: [{ id: String(blocker.id), blocked_at: dep.created_at }] }
        if (isOpen && isHoldingUp(dependencyState(withEdge, blocker, now))) {
            rowFor(blockerDept).holdingUpNow += 1
            rowFor(waitingDept).heldUpNow += 1
        }
    }

    return [...rows.values()]
        .filter((r) => r.id)
        .map(({ finishedWithDue, finishedOnTime, ...row }) => ({ ...row, onTimeRate: finishedWithDue > 0 ? finishedOnTime / finishedWithDue : null }))
        .sort((a, b) => b.holdingUpNow - a.holdingUpNow || b.overdue - a.overdue || a.name.localeCompare(b.name))
}
