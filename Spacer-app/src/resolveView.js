// What the Resolve tab shows (design screen 6): the tasks holding others up,
// each department's next step, and whether the project can close. Tasks carry
// `blocked_by` (attachDependencies); summaries come from summarizeDepartments().
// No Supabase, so `npm test` can load it.
import { daysBetween, openBlockers } from "./crossDepartment.js"

const isDone = (t) => t.status === "done"
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`
const departmentOf = (task, leadId) => String(task.team_space_id ?? leadId ?? "")
const dayOf = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""))
    return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null
}

/** "Overdue by 2 days", "Due today", "Due tomorrow", "Due 12 Dec", "No due date". */
export function dueText(task, now = new Date()) {
    const due = dayOf(task.due_date)
    if (!due) return { text: "No due date", isOverdue: false }
    const days = daysBetween(new Date(now.getFullYear(), now.getMonth(), now.getDate()), due)
    if (days < 0) return { text: `Overdue by ${plural(-days, "day")}`, isOverdue: true }
    if (days === 0) return { text: "Due today", isOverdue: false }
    if (days === 1) return { text: "Due tomorrow", isOverdue: false }
    return { text: `Due ${due.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`, isOverdue: false }
}

/**
 * Open tasks that open tasks wait on, most urgent first (overdue longest, then
 * soonest due, then no due date): [{ task, departmentName, due: { text,
 * isOverdue }, label }] where `label` says whose work waits ("Blocking
 * Product", "Blocking Product, Design", or "Blocking 2 tasks" without
 * departments), `departmentId` and `blocksOthers` (another department's task
 * waits on it). `departments`: lead first, empty or one for a one-department project.
 */
export function projectBlockers(tasks = [], departments = [], now = new Date()) {
    const leadId = departments.find((d) => d.is_lead_department)?.team_space_id ?? departments[0]?.team_space_id
    const hasDepartments = departments.length > 1
    const nameOf = (id) => departments.find((d) => String(d.team_space_id) === id)?.name || "another department"
    const byId = new Map(tasks.map((t) => [String(t.id), t]))
    const waitingBy = new Map()
    tasks.forEach((t) => openBlockers(t, byId).forEach(({ blocker }) => {
        const key = String(blocker.id)
        waitingBy.set(key, [...(waitingBy.get(key) || []), t])
    }))
    const rank = (task) => {
        const due = dayOf(task.due_date)
        return due ? due.getTime() : Number.MAX_SAFE_INTEGER
    }
    return [...waitingBy.entries()]
        .map(([id, waiting]) => {
            const task = byId.get(id)
            const names = [...new Set(waiting.map((w) => nameOf(departmentOf(w, leadId))))]
            const own = departmentOf(task, leadId)
            return {
                task,
                departmentId: own,
                departmentName: hasDepartments ? nameOf(own) : "",
                // An open task of another department waits on it
                blocksOthers: waiting.some((w) => departmentOf(w, leadId) !== own),
                due: dueText(task, now),
                label: hasDepartments ? `Blocking ${names.join(", ")}` : `Blocking ${plural(waiting.length, "task")}`,
                waitingCount: waiting.length,
            }
        })
        .filter((b) => b.task && !isDone(b.task))
        .sort((a, b) => rank(a.task) - rank(b.task) || String(a.task.title).localeCompare(String(b.task.title)))
}

/**
 * Each department's next step: { id, name, status, text, action, leadId }
 * where `action` is "nudge" when it's behind and has a lead, else "view".
 * `blockers` from projectBlockers() count the tasks it holds others up with.
 */
export function departmentNextSteps(summaries = [], blockers = []) {
    return summaries.map((s) => {
        const blocking = blockers.filter((b) => b.departmentId === s.id && b.blocksOthers).length
        let text
        if (s.status === "done") text = "All its tasks are done"
        else if (s.overdue > 0) text = `${plural(s.overdue, "overdue task")} • Action needed`
        else if (s.status === "blocked") text = `Waiting on ${s.waitingOn.length > 0 ? "another department" : "other work"} for everything left`
        else if (blocking > 0) text = `${plural(blocking, "task")} blocking another department`
        else if (s.remaining > 0) text = "No overdue tasks"
        else text = "Nothing left to do"
        const isBehind = s.status === "delayed" || s.status === "at_risk" || s.overdue > 0
        return { id: s.id, name: s.name, status: s.status, text, action: isBehind && s.lead_id ? "nudge" : "view", leadId: s.lead_id }
    })
}

/**
 * Whether the project can close: every task done, no open blocker, no invite
 * waiting. { canClose, reason }.
 */
export function closeReadiness(tasks = [], invitedDepartments = [], blockers = []) {
    const open = tasks.filter((t) => !isDone(t)).length
    if (open > 0) {
        const extra = blockers.length > 0 ? ` and ${plural(blockers.length, "open blocker")}` : ""
        return { canClose: false, reason: `${plural(open, "task")} still open${extra}. Every task must be done first.` }
    }
    if (invitedDepartments.length > 0) {
        return { canClose: false, reason: `${invitedDepartments.length === 1 ? "An invite is" : `${invitedDepartments.length} invites are`} still waiting for an answer.` }
    }
    return { canClose: true, reason: tasks.length > 0 ? "All departments are complete and there are no open blockers." : "There are no tasks on this project." }
}
