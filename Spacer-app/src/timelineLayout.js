// Where things go on a project's Timeline: one lane per department, a bar per
// task from when it was created to its due date, and an arrow from each task
// to every task waiting on it (red when it holds that task up). Days, not
// pixels: the component multiplies by its day width. Kept free of React and
// Supabase so `npm test` can load it.
import { daysBetween, openBlockers, dependencyState, isHoldingUp } from "./crossDepartment.js"

const MARGIN_DAYS = 2
const DEFAULT_MAX_DAYS = 180

const toDay = (value) => {
    if (!value) return null
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
// A Date as its local calendar day, "2026-11-25"
const dayKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
const addDays = (date, days) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)

/**
 * The days shown: from a little before the earliest of today and every task,
 * to a little after the latest of today, every due date and the deadline,
 * at most `maxDays` (keeping the end).
 * @returns {{ start: Date, end: Date, days: number }}
 */
export function timelineRange(tasks, projectDueDate, now = new Date(), { maxDays = DEFAULT_MAX_DAYS } = {}) {
    const today = toDay(dayKey(now))
    const dates = [today, toDay(projectDueDate), ...tasks.flatMap((t) => [toDay(t.created_at), toDay(t.due_date)])].filter(Boolean)
    const first = new Date(Math.min(...dates))
    const last = new Date(Math.max(...dates))
    const end = addDays(last, MARGIN_DAYS)
    let start = addDays(first, -MARGIN_DAYS)
    if (daysBetween(start, end) + 1 > maxDays) start = addDays(end, -(maxDays - 1))
    return { start, end, days: daysBetween(start, end) + 1 }
}

/**
 * Rows for bars so none overlap: Map-like object id -> row, earliest rows first.
 * @param {Array<{id, from, to}>} bars in days, sorted by `from`
 */
export function packRows(bars) {
    const rowEnds = []
    const rows = {}
    for (const bar of bars) {
        let row = rowEnds.findIndex((end) => end < bar.from)
        if (row === -1) row = rowEnds.length
        rowEnds[row] = bar.to
        rows[bar.id] = row
    }
    return rows
}

/**
 * Everything the Timeline draws.
 * `departments`: the project's departments (empty or one = a single lane);
 * tasks carry `blocked_by` (attachDependencies).
 */
export function layoutTimeline({ tasks = [], departments = [], projectDueDate = null, now = new Date() }) {
    const range = timelineRange(tasks, projectDueDate, now)
    const dayOf = (value) => {
        const day = toDay(value)
        return day ? Math.min(range.days - 1, Math.max(0, daysBetween(range.start, day))) : null
    }
    const isSplit = departments.length > 1
    const leadId = String(departments.find((d) => d.is_lead_department)?.team_space_id ?? departments[0]?.team_space_id ?? "")
    const laneOf = (task) => (isSplit ? String(task.team_space_id ?? leadId) : "all")
    const laneDefs = isSplit
        ? departments.map((d) => ({ id: String(d.team_space_id), name: d.name, dueDay: dayOf(d.due_date) }))
        : [{ id: "all", name: "Tasks", dueDay: null }]
    const todayDay = dayOf(dayKey(now))

    const barFor = (task) => {
        const due = dayOf(task.due_date)
        const created = dayOf(task.created_at) ?? todayDay
        if (due === null) return { task, from: created, to: created, hasNoDueDate: true }
        return { task, from: Math.min(created, due), to: due, hasNoDueDate: false }
    }
    const lanes = laneDefs.map((lane) => {
        const bars = tasks.filter((t) => laneOf(t) === lane.id).map(barFor)
            .sort((a, b) => a.from - b.from || String(a.task.id).localeCompare(String(b.task.id)))
        const rows = packRows(bars.map((b) => ({ id: String(b.task.id), from: b.from, to: b.to })))
        const placed = bars.map((b) => ({ ...b, row: rows[String(b.task.id)] }))
        return { ...lane, bars: placed, rowCount: Math.max(1, ...placed.map((b) => b.row + 1)) }
    })

    const byId = new Map(tasks.map((t) => [String(t.id), t]))
    const arrows = tasks.flatMap((task) => openBlockers(task, byId).map(({ blocker }) => ({
        fromId: String(blocker.id),
        toId: String(task.id),
        isHolding: isHoldingUp(dependencyState(task, blocker, now)),
    })))
    return { range, dayOf, todayDay, projectDueDay: dayOf(projectDueDate), lanes, arrows }
}
