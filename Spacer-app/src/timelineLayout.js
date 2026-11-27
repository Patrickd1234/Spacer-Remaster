// What a project's Timeline shows (design screen 7): a window of days (a
// two-week or six-week view you move through), one row per task grouped by
// department, a bar from when the task was created to its due date, arrows
// from a task to the tasks waiting on it, and the tiles, key dates and
// insights around it. Days, not pixels: the component multiplies by its day
// width. Kept free of React and Supabase so `npm test` can load it.
import {
    daysBetween, openBlockers, dependencyState, isHoldingUp,
    summarizeDepartments, delayCulprits, culpritHeadline, isOwnOverdue,
} from "./crossDepartment.js"

export const TIMELINE_VIEWS = {
    week: { key: "week", label: "Week view", days: 14, step: 7, dayWidth: 64 },
    month: { key: "month", label: "Month view", days: 42, step: 28, dayWidth: 26 },
}
const SOON_DAYS = 7
const MAX_INSIGHTS = 3

export const toDay = (value) => {
    if (!value) return null
    if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate())
    const text = String(value)
    const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(text)
    if (!day) return null
    // Timestamps count on the day they fall in locally
    if (text.length > 10) {
        const date = new Date(text)
        return new Date(date.getFullYear(), date.getMonth(), date.getDate())
    }
    return new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]))
}
export const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
const mondayOf = (date) => addDays(date, -((date.getDay() + 6) % 7))
const isDone = (t) => t.status === "done"
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`

/** The first day shown: this week's Monday (week view), or the Monday before the month's 1st (month view). */
export function windowStart(viewKey, anchor = new Date()) {
    const day = toDay(anchor)
    if (viewKey === "month") return mondayOf(new Date(day.getFullYear(), day.getMonth(), 1))
    return mondayOf(day)
}

/**
 * The window moved a step back (-1) or forward (+1): a week in the week view,
 * a calendar month in the month view (the month shown is the one around the
 * window's middle).
 */
export function shiftWindow(start, viewKey, direction) {
    if (viewKey === "month") {
        const middle = addDays(start, 14)
        return windowStart("month", new Date(middle.getFullYear(), middle.getMonth() + direction, 1))
    }
    return addDays(start, direction * TIMELINE_VIEWS.week.step)
}

/** A task's span: created day to due day (just the created day without a due date). */
export function taskSpan(task) {
    const due = toDay(task.due_date)
    const created = toDay(task.created_at) || due || toDay(new Date())
    if (!due) return { start: created, end: created, hasNoDueDate: true }
    return { start: created <= due ? created : due, end: due, hasNoDueDate: false }
}

/**
 * Where a span falls in the window, in day indexes: { from, to, startsBefore,
 * endsAfter }, or null when it's wholly outside.
 */
export function placeInWindow(span, start, days) {
    const from = daysBetween(start, span.start)
    const to = daysBetween(start, span.end)
    if (to < 0 || from > days - 1) return null
    return { from: Math.max(0, from), to: Math.min(days - 1, to), startsBefore: from < 0, endsAfter: to > days - 1 }
}

/**
 * Rows grouped by department (one group, "Tasks", on a one-department
 * project), tasks in each by start, then due date. `departments` lead first.
 * Returns [{ id, name, dueDate, tasks }].
 */
export function timelineGroups(tasks = [], departments = []) {
    const byStart = (a, b) => taskSpan(a).start - taskSpan(b).start || taskSpan(a).end - taskSpan(b).end
        || String(a.title || "").localeCompare(String(b.title || ""))
    if (departments.length < 2) return [{ id: "all", name: "Tasks", dueDate: null, tasks: [...tasks].sort(byStart) }]
    const leadId = String(departments.find((d) => d.is_lead_department)?.team_space_id ?? departments[0].team_space_id)
    const known = new Set(departments.map((d) => String(d.team_space_id)))
    // A task in a department that isn't on the project (any more) shows with the lead department
    const groupOf = (t) => {
        const id = String(t.team_space_id ?? leadId)
        return known.has(id) ? id : leadId
    }
    return departments.map((d) => ({
        id: String(d.team_space_id),
        name: d.name,
        dueDate: d.due_date || null,
        tasks: tasks.filter((t) => groupOf(t) === String(d.team_space_id)).sort(byStart),
    }))
}

/** Arrows from each open task waited on to the open task waiting on it: [{ fromId, toId, isHolding }]. */
export function timelineArrows(tasks = [], now = new Date()) {
    const byId = new Map(tasks.map((t) => [String(t.id), t]))
    return tasks.flatMap((task) => openBlockers(task, byId).map(({ blocker }) => ({
        fromId: String(blocker.id),
        toId: String(task.id),
        isHolding: isHoldingUp(dependencyState(task, blocker, now)),
    })))
}

// Overdue as everywhere else (isOwnOverdue): open, past due, and not waiting on another task
const ownOverdue = (tasks, now) => {
    const byId = new Map(tasks.map((t) => [String(t.id), t]))
    return tasks.filter((t) => isOwnOverdue(t, byId, now))
}

/** The four tiles: progress (Done of all), total tasks, overdue (see ownOverdue) and open dependencies. */
export function timelineStats(tasks = [], now = new Date()) {
    const done = tasks.filter(isDone).length
    const overdue = ownOverdue(tasks, now).length
    return {
        progress: tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0,
        total: tasks.length,
        overdue,
        activeDependencies: timelineArrows(tasks, now).length,
    }
}

/**
 * Key dates: when the work started (the earliest task), the deadline, and the
 * next milestone (the next department due date still open, else the next open
 * task's due date). Dates are Date objects or null.
 */
export function keyDates({ tasks = [], departments = [], projectDueDate = null, now = new Date() }) {
    const today = toDay(now)
    const starts = tasks.map((t) => toDay(t.created_at)).filter(Boolean)
    const upcomingDepartment = departments
        .filter((d) => d.status !== "signed_off" && toDay(d.due_date) && toDay(d.due_date) >= today)
        .sort((a, b) => toDay(a.due_date) - toDay(b.due_date))[0]
    const upcomingTask = tasks
        .filter((t) => !isDone(t) && toDay(t.due_date) && toDay(t.due_date) >= today)
        .sort((a, b) => toDay(a.due_date) - toDay(b.due_date))[0]
    const milestone = departments.length > 1 && upcomingDepartment
        ? { label: `${upcomingDepartment.name} due`, date: toDay(upcomingDepartment.due_date) }
        : upcomingTask ? { label: `“${upcomingTask.title}” due`, date: toDay(upcomingTask.due_date) } : null
    return {
        start: starts.length > 0 ? new Date(Math.min(...starts)) : null,
        deadline: toDay(projectDueDate),
        milestone,
    }
}

/**
 * Up to three insights worked out from the tasks: who is delaying the project
 * (on a Collab project), overdue work, a department or task due soon with work
 * left, tasks without a due date. On schedule when none apply.
 * Each { tone: "warning" | "info" | "ok", title, detail }.
 */
export function timelineInsights({ tasks = [], departments = [], now = new Date() }) {
    const today = toDay(now)
    const insights = []
    const isSplit = departments.length > 1
    if (isSplit) {
        const summaries = summarizeDepartments({ departments, tasks, now })
        const culprit = delayCulprits(summaries)[0]
        if (culprit) {
            const headline = culpritHeadline(culprit, summaries, tasks, now)
            insights.push({ tone: "warning", title: headline.title, detail: headline.detail })
        }
        const soon = summaries
            .filter((s) => s.remaining > 0 && s.dueInDays !== null && s.dueInDays >= 0 && s.dueInDays <= SOON_DAYS)
            .sort((a, b) => a.dueInDays - b.dueInDays)[0]
        if (soon) {
            const when = soon.dueInDays === 0 ? "today" : `in ${plural(soon.dueInDays, "day")}`
            insights.push({ tone: "info", title: `${soon.name} is due ${when}.`, detail: `${plural(soon.remaining, "task")} still open.` })
        }
    }
    const overdue = ownOverdue(tasks, now)
    if (overdue.length > 0 && !insights.some((i) => i.tone === "warning")) {
        const oldest = [...overdue].sort((a, b) => toDay(a.due_date) - toDay(b.due_date))[0]
        const ago = daysBetween(toDay(oldest.due_date), today)
        insights.push({ tone: "warning", title: `${plural(overdue.length, "task")} ${overdue.length === 1 ? "is" : "are"} overdue.`, detail: `The oldest, “${oldest.title}”, was due ${ago === 1 ? "yesterday" : `${ago} days ago`}.` })
    }
    if (!isSplit) {
        const next = tasks.filter((t) => !isDone(t) && toDay(t.due_date) && toDay(t.due_date) >= today)
            .sort((a, b) => toDay(a.due_date) - toDay(b.due_date))[0]
        const inDays = next ? daysBetween(today, toDay(next.due_date)) : null
        if (next && inDays <= SOON_DAYS) {
            insights.push({ tone: "info", title: `“${next.title}” is due ${inDays === 0 ? "today" : `in ${plural(inDays, "day")}`}.`, detail: "The next due date on this project." })
        }
    }
    const undated = tasks.filter((t) => !isDone(t) && !t.due_date).length
    if (undated > 0) {
        insights.push({ tone: "info", title: `${plural(undated, "open task")} ${undated === 1 ? "has" : "have"} no due date.`, detail: "They show as a short dashed bar on the day they were created." })
    }
    if (insights.length === 0) {
        insights.push({ tone: "ok", title: "On schedule.", detail: tasks.length > 0 ? "No overdue tasks or hold-ups." : "Add tasks with due dates to plan the work here." })
    }
    return insights.slice(0, MAX_INSIGHTS)
}
