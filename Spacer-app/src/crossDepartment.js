// Cross-department projects: who is delaying, worked out from tasks every time
// (never stored, so it can't go stale). Kept free of imports so `npm test` can
// load it without Supabase.
//
// A department is one row of project_departments:
//   { team_space_id, name, lead_id, due_date, is_lead_department, status }
// A task belongs to a department through team_space_id (none = the lead
// department) and can wait on another task through blocked_by_task_id.

// Proposed defaults; a project can override any of them
export const DEFAULT_DELAY_RULES = {
    atRiskDays: 3,          // due within this many days...
    atRiskProgress: 0.7,    // ...and under this share done
    waitingDays: 2,         // another department has waited this long
    overdueGraceDays: 1,    // a task more than this many days overdue is late
}

export const DEPARTMENT_STATUS = {
    on_track: { label: "On track", tone: "green" },
    at_risk: { label: "At risk", tone: "amber" },
    delayed: { label: "Delayed", tone: "red" },
    blocked: { label: "Blocked", tone: "amber" },
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

// The open task this one waits on, if any. A finished blocker no longer counts:
// the database clears those blocks itself (tasks_block_notify).
export function openBlocker(task, tasksById) {
    if (isDone(task) || !task.blocked_by_task_id) return null
    const blocker = tasksById.get(String(task.blocked_by_task_id))
    return blocker && !isDone(blocker) ? blocker : null
}
const indexTasks = (tasks) => new Map(tasks.map((t) => [String(t.id), t]))

// The one meaning of "overdue" on screen (card count, banner, delay list): open,
// past its due date, and not waiting on another task, since that lateness isn't
// its department's. The grace days only decide when a department turns Delayed.
const isOwnOverdue = (task, tasksById, now) => overdueDays(task, now) > 0 && !openBlocker(task, tasksById)

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`

function joinWords(words) {
    if (words.length <= 1) return words[0] || ""
    return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`
}

// Waiting links between departments: one per (waiting, waited-on) pair
function waitingLinks(tasks, leadId, now) {
    const byId = indexTasks(tasks)
    const links = new Map()
    for (const task of tasks) {
        const blocker = openBlocker(task, byId)
        if (!blocker) continue
        const from = departmentOf(task, leadId)
        const to = departmentOf(blocker, leadId)
        if (from === to) continue
        const key = `${from}>${to}`
        const days = Math.max(0, daysBetween(task.blocked_at, now) ?? 0)
        const link = links.get(key) || { from, to, tasks: 0, days: 0 }
        links.set(key, { ...link, tasks: link.tasks + 1, days: Math.max(link.days, days) })
    }
    return [...links.values()]
}

function statusFor(dept, figures, rules) {
    const { total, done, remaining, lateTasks, waitingOn, waitedOnBy, dueInDays, allRemainingBlocked } = figures
    if (dept.status === "signed_off" || (total > 0 && done === total)) return "done"
    if (dueInDays !== null && dueInDays < 0 && remaining > 0) return allRemainingBlocked ? "blocked" : "delayed"
    if (lateTasks > 0) return "delayed"
    if (waitingOn.length > 0) return "blocked"
    const progress = total > 0 ? done / total : 0
    const dueSoon = dueInDays !== null && dueInDays <= rules.atRiskDays && progress < rules.atRiskProgress
    if (dueSoon || waitedOnBy.some((link) => link.days >= rules.waitingDays)) return "at_risk"
    return "on_track"
}

/**
 * Progress and delay status for each of a project's departments.
 * @returns {Array<object>} one summary per department, in the order given
 */
export function summarizeDepartments({ departments = [], tasks = [], now = new Date(), rules = {} }) {
    const settings = { ...DEFAULT_DELAY_RULES, ...rules }
    const leadId = departments.find((d) => d.is_lead_department)?.team_space_id ?? departments[0]?.team_space_id
    const links = waitingLinks(tasks, leadId, now)
    const byId = indexTasks(tasks)
    const isWaiting = (t) => Boolean(openBlocker(t, byId))

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
            waitingOn: links.filter((l) => l.from === id).map((l) => ({ departmentId: l.to, tasks: l.tasks, days: l.days })),
            waitedOnBy: links.filter((l) => l.to === id).map((l) => ({ departmentId: l.from, tasks: l.tasks, days: l.days })),
            dueInDays: dept.due_date ? daysBetween(now, dept.due_date) : null,
        }
        return {
            ...dept,
            id,
            ...figures,
            progress: own.length > 0 ? done / own.length : 0,
            overdue: open.filter((t) => isOwnOverdue(t, byId, now)).length,
            waitingOnOthers: blocked.length,
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

// Departments holding the project up: late ones, then those others wait on,
// most waited-on first. Blocked departments are never blamed.
export function delayCulprits(summaries) {
    const waitedOn = (s) => s.waitedOnBy.reduce((sum, link) => sum + link.tasks, 0)
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
    for (const link of culprit.waitedOnBy) {
        parts.push(`${nameOf(link.departmentId)} is waiting on ${link.tasks} of its task${link.tasks === 1 ? "" : "s"}.`)
    }
    return { title: `${culprit.name} is holding this project up`, detail: parts.join(" ") }
}

/**
 * The open tasks behind the delay: overdue tasks in a culprit department (the
 * same ones its card and the banner count), and any of its tasks another
 * department is waiting on. Most overdue first.
 */
export function delayingTasks(tasks, summaries, now = new Date()) {
    const leadId = summaries.find((s) => s.is_lead_department)?.id ?? summaries[0]?.id
    const byId = indexTasks(tasks)
    const culprits = new Set(delayCulprits(summaries).map((s) => s.id))
    return tasks
        .filter((t) => !isDone(t) && culprits.has(departmentOf(t, leadId)))
        .map((t) => {
            const counts = new Map()
            tasks.filter((w) => !isDone(w) && String(w.blocked_by_task_id) === String(t.id)).forEach((w) => {
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
        const link = [...summary.waitingOn].sort((a, b) => b.days - a.days)[0]
        const who = link ? nameOf(link.departmentId) : "another department"
        return `Waiting on ${who} for ${plural(link?.days ?? 0, "day")}. Not ${summary.name}'s fault, so it is not marked delayed.`
    }
    const waiting = summary.waitedOnBy.map((link) => nameOf(link.departmentId))
    if (waiting.length > 0) return `Holding up ${joinWords(waiting)}. ${dueNote(summary)}`.trim()
    if (summary.status === "delayed" || summary.status === "at_risk") return dueNote(summary) || `Nobody is waiting on ${summary.name}.`
    return `Nobody is waiting on ${summary.name}.`
}

// True when `taskId` waiting on `blockerId` would make a loop
export function wouldCreateCycle(tasks, taskId, blockerId) {
    const byId = new Map(tasks.map((t) => [String(t.id), t]))
    let current = String(blockerId)
    const seen = new Set()
    while (current && !seen.has(current)) {
        if (current === String(taskId)) return true
        seen.add(current)
        current = byId.get(current)?.blocked_by_task_id ? String(byId.get(current).blocked_by_task_id) : ""
    }
    return false
}

// Tasks in `departmentId` that the task can wait on: open, and not looping back
export function blockableTasks(tasks, taskId, departmentId, leadId = null) {
    return tasks.filter((t) =>
        String(t.id) !== String(taskId)
        && !isDone(t)
        && departmentOf(t, leadId) === String(departmentId)
        && !wouldCreateCycle(tasks, taskId, t.id)
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
    if (filter.isBlockedOnly && !openBlocker(task, tasksById)) return false
    if (!filter.departmentId) return true
    return String(task.team_space_id ?? leadDepartmentId) === String(filter.departmentId)
}
