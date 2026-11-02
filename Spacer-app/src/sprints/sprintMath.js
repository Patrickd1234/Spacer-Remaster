// Sprint numbers: progress, burndown, velocity and planning defaults.
// No Supabase imports, so it runs under `node --test`.
// Days are local "YYYY-MM-DD" strings, like the sprints' starts_on / ends_on.

// Same set as the tasks_story_points_check constraint
export const POINT_OPTIONS = [0, 1, 2, 3, 5, 8, 13, 21]
export const SPRINT_LENGTH_DAYS = 14
export const NAME_MAX = 80
export const GOAL_MAX = 500
const VELOCITY_WINDOW = 3
const DAY_MS = 24 * 60 * 60 * 1000

export function parseDay(value) {
    const [y, m, d] = value.slice(0, 10).split("-").map(Number)
    return new Date(y, m - 1, d)
}

export function toDay(date) {
    const m = String(date.getMonth() + 1).padStart(2, "0")
    const d = String(date.getDate()).padStart(2, "0")
    return `${date.getFullYear()}-${m}-${d}`
}

const addDays = (date, n) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n)
const daysBetween = (from, to) => Math.round((to - from) / DAY_MS)
const isDone = (task) => task.status === "done"

// Points when anyone has estimated, otherwise every task counts as one
function weighing(tasks) {
    const usesPoints = tasks.some((t) => t.story_points != null)
    return { usesPoints, weightOf: (t) => (usesPoints ? t.story_points ?? 0 : 1) }
}

const sum = (values) => values.reduce((total, v) => total + v, 0)

export function sprintTotals(tasks) {
    const { usesPoints, weightOf } = weighing(tasks)
    const total = sum(tasks.map(weightOf))
    const done = sum(tasks.filter(isDone).map(weightOf))
    return {
        usesPoints,
        total,
        done,
        totalTasks: tasks.length,
        doneTasks: tasks.filter(isDone).length,
        unestimated: usesPoints ? tasks.filter((t) => t.story_points == null).length : 0,
        percent: total === 0 ? 0 : Math.round((done / total) * 100),
    }
}

// 0 on the last day, negative once the end date has passed
export function daysLeft(sprint, today = new Date()) {
    return daysBetween(parseDay(toDay(today)), parseDay(sprint.ends_on))
}

// One point per sprint day: the ideal straight line to zero, and the work still
// open at the end of each day so far (null for days still to come). A done task
// with no completion time counts as done from the first day.
export function burndownSeries(sprint, tasks, today = new Date()) {
    const { weightOf } = weighing(tasks)
    const start = parseDay(sprint.starts_on)
    const length = daysBetween(start, parseDay(sprint.ends_on)) + 1
    const todayKey = toDay(today)
    const scope = sum(tasks.map(weightOf))
    const finishedOn = tasks.filter(isDone).map((t) => ({
        day: t.completed_at ? toDay(new Date(t.completed_at)) : sprint.starts_on,
        weight: weightOf(t),
    }))

    return Array.from({ length }, (_, i) => {
        const day = toDay(addDays(start, i))
        const ideal = length === 1 ? 0 : Math.round(scope * (1 - i / (length - 1)) * 100) / 100
        const remaining = day > todayKey ? null : scope - sum(finishedOn.filter((f) => f.day <= day).map((f) => f.weight))
        return { day, ideal, remaining }
    })
}

// Completed sprints oldest first, and the average points of the last few
export function velocityHistory(sprints) {
    const done = sprints
        .filter((s) => s.status === "completed")
        .sort((a, b) => new Date(a.completed_at) - new Date(b.completed_at))
    const recent = done.slice(-VELOCITY_WINDOW)
    return {
        sprints: done,
        average: recent.length === 0 ? null : Math.round(sum(recent.map((s) => s.completed_points ?? 0)) / recent.length),
    }
}

// "Sprint N", starting today or the day after the latest sprint ends
export function nextSprintDefaults(sprints, today = new Date(), length = SPRINT_LENGTH_DAYS) {
    const latestEnd = sprints.map((s) => s.ends_on).sort().at(-1)
    const todayDay = parseDay(toDay(today))
    const afterLatest = latestEnd ? addDays(parseDay(latestEnd), 1) : todayDay
    const start = afterLatest > todayDay ? afterLatest : todayDay
    return {
        name: `Sprint ${sprints.length + 1}`,
        startsOn: toDay(start),
        endsOn: toDay(addDays(start, length - 1)),
    }
}

export function validateSprint({ name, goal, startsOn, endsOn }) {
    if (!name.trim()) return "Give the sprint a name."
    if (name.trim().length > NAME_MAX) return `Keep the name under ${NAME_MAX} characters.`
    if ((goal || "").length > GOAL_MAX) return `Keep the goal under ${GOAL_MAX} characters.`
    if (!startsOn || !endsOn) return "Pick a start and end date."
    if (endsOn < startsOn) return "The end date is before the start date."
    return null
}

// "Nov 2 – Nov 15"
export function dateRange(sprint) {
    const fmt = (day) => parseDay(day).toLocaleDateString([], { month: "short", day: "numeric" })
    return `${fmt(sprint.starts_on)} – ${fmt(sprint.ends_on)}`
}

// "13 pts", or "4 tasks" when nothing is estimated (totals from sprintTotals)
export function pointsLabel(totals) {
    return totals.usesPoints ? `${totals.total} pts` : `${totals.totalTasks} task${totals.totalTasks === 1 ? "" : "s"}`
}
