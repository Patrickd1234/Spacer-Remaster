// Cross-department projects: who is delaying, worked out from tasks every time
// (never stored, so it can't go stale). Kept free of imports so `npm test` can
// load it without Supabase.
//
// A department is one row of project_departments:
//   { team_space_id, name, lead_id, due_date, is_lead_department, status }
// A task belongs to a department through team_space_id (none = the lead
// department) and can wait on several other tasks: `blocked_by`, a list of
// { id, blocked_at } (attachDependencies, from task_dependencies). Older data
// with one blocked_by_task_id / blocked_at is read the same way.
//
// Waiting is normal: one department often needs another's work first. A wait
// only counts as "holding up" (dependencyState) when the task waited on is
// late, is due after the waiting task needs it, or, with no due date, has been
// waited on too long. Only those waits block a department or blame another.

// Proposed defaults; a project can override any of them
export const DEFAULT_DELAY_RULES = {
    atRiskDays: 3,          // due within this many days...
    atRiskProgress: 0.7,    // ...and under this share done
    waitingDays: 2,         // waited this long on a task with no due date
    overdueGraceDays: 1,    // a task more than this many days overdue is late
}

export const DEPARTMENT_STATUS = {
    on_track: { label: "On track", tone: "green" },
    at_risk: { label: "At risk", tone: "amber" },
    delayed: { label: "Delayed", tone: "red" },
    blocked: { label: "Blocked", tone: "amber" },
    done: { label: "Done", tone: "muted" },
}

// The whole project (projectDelayStatus)
export const PROJECT_STATUS = {
    on_track: { label: "On track", tone: "green" },
    at_risk: { label: "At risk", tone: "amber" },
    delayed: { label: "Delayed", tone: "red" },
    done: { label: "Done", tone: "muted" },
}

const DAY_MS = 86400000

// "2026-11-28" is a calendar day, read in local time; timestamps are kept as is
function toDate(value) {
    if (!value) return null
    const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value))
    return day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(value)
}

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

// Whole calendar days from `from` to `to` (negative when `to` is earlier)
export function daysBetween(from, to) {
    const a = toDate(from), b = toDate(to)
    if (!a || !b) return null
    return Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS)
}

const isDone = (task) => task.status === "done"

// Days a task is past its due date (0 when it isn't, or is done)
export function overdueDays(task, now = new Date()) {
    if (isDone(task) || !task.due_date) return 0
    return Math.max(0, daysBetween(task.due_date, now) ?? 0)
}

const departmentOf = (task, leadId) => String(task.team_space_id ?? leadId ?? "")

/**
 * Tasks with their dependencies: each gets `blocked_by` [{ id, blocked_at,
 * resolved_at, note }] from task_dependencies rows { task_id, blocker_task_id,
 * created_at, resolved_at, note }.
 */
export function attachDependencies(tasks = [], dependencies = []) {
    const byTask = new Map()
    for (const d of dependencies) {
        const key = String(d.task_id)
        byTask.set(key, [...(byTask.get(key) || []), {
            id: String(d.blocker_task_id), blocked_at: d.created_at, resolved_at: d.resolved_at ?? null, note: d.note ?? null,
        }])
    }
    return tasks.map((t) => ({ ...t, blocked_by: byTask.get(String(t.id)) || [] }))
}

// What a task waits on: [{ id, blocked_at }]
export function blockerEdges(task) {
    if (Array.isArray(task.blocked_by)) return task.blocked_by
    return task.blocked_by_task_id ? [{ id: String(task.blocked_by_task_id), blocked_at: task.blocked_at }] : []
}

const blockedAtFor = (task, blockerId) => blockerEdges(task).find((e) => String(e.id) === String(blockerId))?.blocked_at ?? null

/**
 * The open tasks this one waits on: [{ blocker, blockedAt }]. Finished ones no
 * longer count (the database marks those waits resolved).
 */
export function openBlockers(task, tasksById) {
    if (isDone(task)) return []
    return blockerEdges(task).flatMap((edge) => {
        const blocker = tasksById.get(String(edge.id))
        return blocker && !isDone(blocker) ? [{ blocker, blockedAt: edge.blocked_at }] : []
    })
}

// The first open task this one waits on, if any
export const openBlocker = (task, tasksById) => openBlockers(task, tasksById)[0]?.blocker ?? null

const indexTasks = (tasks) => new Map(tasks.map((t) => [String(t.id), t]))
const waitsOn = (task, blockerId) => blockerEdges(task).some((e) => String(e.id) === String(blockerId))

// The one meaning of "overdue" on screen (card count, banner, delay list): open,
// past its due date, and not waiting on another task, since that lateness isn't
// its department's. The grace days only decide when a department turns Delayed.
export const isOwnOverdue = (task, tasksById, now) => overdueDays(task, now) > 0 && !openBlocker(task, tasksById)

/**
 * How a wait between two tasks stands:
 * "late"        the task waited on is past its due date
 * "conflict"    it is due after the waiting task's own due date
 * "stalled"     it has no due date and has been waited on for waitingDays
 * "on_schedule" none of these: a normal hand-off, nobody is holding anyone up
 */
export function dependencyState(waitingTask, blocker, now = new Date(), rules = {}) {
    const { waitingDays } = { ...DEFAULT_DELAY_RULES, ...rules }
    if (overdueDays(blocker, now) > 0) return "late"
    if (blocker.due_date && waitingTask.due_date && daysBetween(waitingTask.due_date, blocker.due_date) > 0) return "conflict"
    if (!blocker.due_date && (daysBetween(blockedAtFor(waitingTask, blocker.id), now) ?? 0) >= waitingDays) return "stalled"
    return "on_schedule"
}

export const isHoldingUp = (state) => state === "late" || state === "conflict" || state === "stalled"

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`

function joinWords(words) {
    if (words.length <= 1) return words[0] || ""
    return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`
}

// Waiting links between departments: one per (waiting, waited-on) pair.
// `tasks` counts every wait; `holdingTasks` those holding up (and `conflicts`
// the date conflicts among them); `days` the longest of those waits.
function waitingLinks(tasks, leadId, now, rules) {
    const byId = indexTasks(tasks)
    const links = new Map()
    for (const task of tasks) for (const { blocker, blockedAt } of openBlockers(task, byId)) {
        const from = departmentOf(task, leadId)
        const to = departmentOf(blocker, leadId)
        if (from === to) continue
        const key = `${from}>${to}`
        const state = dependencyState(task, blocker, now, rules)
        const days = Math.max(0, daysBetween(blockedAt, now) ?? 0)
        const link = links.get(key) || { from, to, tasks: 0, holdingTasks: 0, conflicts: 0, days: 0 }
        links.set(key, {
            ...link,
            tasks: link.tasks + 1,
            holdingTasks: link.holdingTasks + Number(isHoldingUp(state)),
            conflicts: link.conflicts + Number(state === "conflict"),
            days: Math.max(link.days, days),
        })
    }
    return [...links.values()]
}

const isHolding = (link) => link.holdingTasks > 0

function statusFor(dept, figures, rules) {
    const { total, done, remaining, lateTasks, waitingOn, waitedOnBy, dueInDays, allRemainingBlocked } = figures
    if (dept.status === "signed_off" || (total > 0 && done === total)) return "done"
    if (dueInDays !== null && dueInDays < 0 && remaining > 0) return allRemainingBlocked ? "blocked" : "delayed"
    if (lateTasks > 0) return "delayed"
    if (waitingOn.some(isHolding)) return "blocked"
    const progress = total > 0 ? done / total : 0
    const dueSoon = dueInDays !== null && dueInDays <= rules.atRiskDays && progress < rules.atRiskProgress
    if (dueSoon || waitedOnBy.some(isHolding)) return "at_risk"
    return "on_track"
}

/**
 * Progress and delay status for each of a project's departments.
 * @returns {Array<object>} one summary per department, in the order given
 */
export function summarizeDepartments({ departments = [], tasks = [], now = new Date(), rules = {} }) {
    const settings = { ...DEFAULT_DELAY_RULES, ...rules }
    const leadId = departments.find((d) => d.is_lead_department)?.team_space_id ?? departments[0]?.team_space_id
    const links = waitingLinks(tasks, leadId, now, settings)
    const byId = indexTasks(tasks)
    const isWaiting = (t) => openBlockers(t, byId).length > 0
    const linkFrom = (l, otherId) => ({ departmentId: otherId, tasks: l.tasks, holdingTasks: l.holdingTasks, conflicts: l.conflicts, days: l.days })

    return departments.map((dept) => {
        const id = String(dept.team_space_id)
        const own = tasks.filter((t) => departmentOf(t, leadId) === id)
        const done = own.filter(isDone).length
        const open = own.filter((t) => !isDone(t))
        const blocked = open.filter(isWaiting)
        // A task waiting on someone else isn't this department's lateness
        const late = open.filter((t) => !isWaiting(t) && overdueDays(t, now) > settings.overdueGraceDays)
        const figures = {
            total: own.length,
            done,
            remaining: open.length,
            lateTasks: late.length,
            allRemainingBlocked: open.length > 0 && blocked.length === open.length,
            waitingOn: links.filter((l) => l.from === id).map((l) => linkFrom(l, l.to)),
            waitedOnBy: links.filter((l) => l.to === id).map((l) => linkFrom(l, l.from)),
            dueInDays: dept.due_date ? daysBetween(now, dept.due_date) : null,
        }
        return {
            ...dept,
            id,
            ...figures,
            progress: own.length > 0 ? done / own.length : 0,
            overdue: open.filter((t) => isOwnOverdue(t, byId, now)).length,
            waitingOnOthers: blocked.length,
            // Being worked on or reviewed, and not waiting on anyone
            inProgress: open.filter((t) => !isWaiting(t) && (t.status === "in_progress" || t.status === "in_review")).length,
            signedOff: dept.status === "signed_off",
            // The delay status; the saved sign-off is `signedOff`
            status: statusFor(dept, figures, settings),
        }
    })
}

// The whole project: late only once its own deadline has passed; a department
// running late before then puts it at risk
export function projectDelayStatus(summaries, projectDueDate, now = new Date()) {
    if (summaries.length > 0 && summaries.every((s) => s.status === "done")) return "done"
    const remaining = summaries.some((s) => s.remaining > 0)
    const due = projectDueDate ? daysBetween(now, projectDueDate) : null
    if (due !== null && due < 0 && remaining) return "delayed"
    if (summaries.some((s) => ["delayed", "blocked", "at_risk"].includes(s.status))) return "at_risk"
    return "on_track"
}

// Departments holding the project up: late ones, then those holding others up
// (late, conflicting or stalled waits), most first. Blocked departments are
// never blamed, and an on-schedule hand-off blames nobody.
export function delayCulprits(summaries) {
    const waitedOn = (s) => s.waitedOnBy.reduce((sum, link) => sum + link.holdingTasks, 0)
    return summaries
        .filter((s) => s.status !== "done" && s.status !== "blocked" && (s.status === "delayed" || waitedOn(s) > 0))
        .sort((a, b) => Number(b.status === "delayed") - Number(a.status === "delayed") || waitedOn(b) - waitedOn(a))
}

// Banner text for the department named as holding the project up
export function culpritHeadline(culprit, summaries, tasks, now = new Date()) {
    const nameOf = (id) => summaries.find((s) => s.id === String(id))?.name || "Another department"
    const leadId = summaries.find((s) => s.is_lead_department)?.id ?? summaries[0]?.id
    const byId = indexTasks(tasks)
    const lateDays = tasks
        .filter((t) => departmentOf(t, leadId) === culprit.id && isOwnOverdue(t, byId, now))
        .map((t) => overdueDays(t, now))
        .sort((a, b) => b - a)
    const parts = []
    if (lateDays.length > 0) {
        const verb = lateDays.length === 1 ? "task is" : "tasks are"
        parts.push(`${lateDays.length} ${verb} overdue (${joinWords(lateDays.map(String))} ${lateDays.length === 1 && lateDays[0] === 1 ? "day" : "days"}).`)
    } else if (culprit.dueInDays !== null && culprit.dueInDays < 0) {
        parts.push(`Its due date passed with ${Math.round((1 - culprit.progress) * 100)}% left.`)
    }
    for (const link of culprit.waitedOnBy.filter(isHolding)) {
        const who = nameOf(link.departmentId)
        const why = link.conflicts === link.holdingTasks ? `, due after ${who} needs ${link.holdingTasks === 1 ? "it" : "them"}.` : "."
        parts.push(`${who} is waiting on ${link.holdingTasks} of its tasks${why}`)
    }
    return { title: `${culprit.name} is holding this project up`, detail: parts.join(" ") }
}

/**
 * The open tasks behind the delay: overdue tasks in a culprit department (the
 * same ones its card and the banner count), and any of its tasks holding
 * another department up. Most overdue first.
 */
export function delayingTasks(tasks, summaries, now = new Date(), rules = {}) {
    const leadId = summaries.find((s) => s.is_lead_department)?.id ?? summaries[0]?.id
    const byId = indexTasks(tasks)
    const culprits = new Set(delayCulprits(summaries).map((s) => s.id))
    return tasks
        .filter((t) => !isDone(t) && culprits.has(departmentOf(t, leadId)))
        .map((t) => {
            const counts = new Map()
            tasks.filter((w) => !isDone(w) && waitsOn(w, t.id) && isHoldingUp(dependencyState(w, t, now, rules))).forEach((w) => {
                const dept = departmentOf(w, leadId)
                if (dept !== departmentOf(t, leadId)) counts.set(dept, (counts.get(dept) || 0) + 1)
            })
            return {
                task: t,
                departmentId: departmentOf(t, leadId),
                overdueDays: overdueDays(t, now),
                isOverdue: isOwnOverdue(t, byId, now),
                blocks: [...counts].map(([departmentId, count]) => ({ departmentId, count })),
            }
        })
        .filter((row) => row.isOverdue || row.blocks.length > 0)
        .sort((a, b) => b.overdueDays - a.overdueDays)
}

function dueNote(summary) {
    const left = Math.round((1 - summary.progress) * 100)
    if (summary.dueInDays === null) return ""
    if (summary.dueInDays < 0) return `Due date passed with ${left}% left.`
    if (summary.dueInDays === 0) return `Due today with ${left}% left.`
    return `Due in ${plural(summary.dueInDays, "day")} with ${left}% left.`
}

// The line under each department card
export function departmentNote(summary, nameOf) {
    if (summary.status === "done") return summary.signedOff ? "Signed off." : "All tasks done."
    if (summary.status === "blocked") {
        const link = summary.waitingOn.filter(isHolding).sort((a, b) => b.days - a.days)[0]
        const who = link ? nameOf(link.departmentId) : "another department"
        return `Waiting on ${who} for ${plural(link?.days ?? 0, "day")}. Not ${summary.name}'s fault, so it is not marked delayed.`
    }
    const holdingUp = summary.waitedOnBy.filter(isHolding).map((link) => nameOf(link.departmentId))
    if (holdingUp.length > 0) return `Holding up ${joinWords(holdingUp)}. ${dueNote(summary)}`.trim()
    if (summary.status === "delayed" || summary.status === "at_risk") return dueNote(summary) || `Nobody is waiting on ${summary.name}.`
    // Normal hand-offs, said plainly so nobody reads them as trouble
    if (summary.waitingOn.length > 0) {
        return `Waiting on ${joinWords(summary.waitingOn.map((l) => `${l.tasks} ${nameOf(l.departmentId)} task${l.tasks === 1 ? "" : "s"}`))}, on schedule.`
    }
    if (summary.waitedOnBy.length > 0) {
        const count = summary.waitedOnBy.reduce((sum, l) => sum + l.tasks, 0)
        const who = summary.waitedOnBy.map((l) => nameOf(l.departmentId))
        return `${joinWords(who)} ${who.length === 1 ? "is" : "are"} waiting on ${count} of its tasks, on schedule.`
    }
    return `Nobody is waiting on ${summary.name}.`
}

// True when `taskId` waiting on `blockerId` would make a loop, through any
// chain of dependencies (finished ones included, as in the database)
export function wouldCreateCycle(tasks, taskId, blockerId) {
    const byId = indexTasks(tasks)
    const pending = [String(blockerId)]
    const seen = new Set()
    while (pending.length > 0) {
        const current = pending.pop()
        if (current === String(taskId)) return true
        if (seen.has(current)) continue
        seen.add(current)
        const task = byId.get(current)
        if (task) pending.push(...blockerEdges(task).map((e) => String(e.id)))
    }
    return false
}

// Tasks the task can wait on: open, not itself or already waited on, not
// looping back; only in `departmentId` when one is given
export function blockableTasks(tasks, taskId, departmentId = null, leadId = null) {
    const task = tasks.find((t) => String(t.id) === String(taskId))
    return tasks.filter((t) =>
        String(t.id) !== String(taskId)
        && !isDone(t)
        && !(task && waitsOn(task, t.id))
        && (departmentId == null || departmentOf(t, leadId) === String(departmentId))
        && !wouldCreateCycle(tasks, taskId, t.id)
    )
}

// Tasks that could wait on this one (the "blocks" side): open, not itself, not
// already waiting on it, not looping back
export function blockedCandidates(tasks, blockerId) {
    return tasks.filter((t) =>
        String(t.id) !== String(blockerId)
        && !isDone(t)
        && !waitsOn(t, blockerId)
        && !wouldCreateCycle(tasks, t.id, blockerId)
    )
}

// The create form's rule: every department has a due date, none after the overall deadline
export function validateDepartmentDates(projectDueDate, departments) {
    for (const dept of departments) {
        if (!dept.due_date) return `Pick a due date for ${dept.name}.`
        if (projectDueDate && daysBetween(projectDueDate, dept.due_date) > 0) return `${dept.name} is due after the overall deadline.`
    }
    return null
}

// Whether a task shows under the Orbit board filter
// { departmentId: string | null, isBlockedOnly: boolean }. `tasksById`: Map of id → task.
export function matchesDepartmentFilter(task, filter, leadDepartmentId, tasksById) {
    if (filter.isBlockedOnly && openBlockers(task, tasksById).length === 0) return false
    if (!filter.departmentId) return true
    return String(task.team_space_id ?? leadDepartmentId) === String(filter.departmentId)
}

/**
 * One line for the whole project, for its header and lists:
 * { status, tone, culpritName, text }, e.g. "At risk · Development is holding this up".
 */
export function projectHealth({ departments = [], tasks = [], projectDueDate = null, now = new Date(), rules = {} }) {
    const summaries = summarizeDepartments({ departments, tasks, now, rules })
    const status = projectDelayStatus(summaries, projectDueDate, now)
    const culpritName = status === "done" ? null : delayCulprits(summaries)[0]?.name ?? null
    const { label, tone } = PROJECT_STATUS[status]
    return { status, tone, culpritName, text: culpritName ? `${label} · ${culpritName} is holding this up` : label }
}

/**
 * For board cards: Map of task id -> "holding" (another task waits on it and
 * it holds that up) or "held" (it waits on a task that holds it up). Tasks in
 * normal, on-schedule hand-offs aren't in the map.
 */
export function taskHoldupRoles(tasks, now = new Date(), rules = {}) {
    const byId = indexTasks(tasks)
    const roles = new Map()
    for (const task of tasks) for (const { blocker } of openBlockers(task, byId)) {
        if (!isHoldingUp(dependencyState(task, blocker, now, rules))) continue
        roles.set(String(blocker.id), "holding")
        if (!roles.has(String(task.id))) roles.set(String(task.id), "held")
    }
    return roles
}
