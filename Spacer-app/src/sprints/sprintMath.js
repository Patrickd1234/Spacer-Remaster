// Pure sprint helpers for the Sprint tab. Sprints and tasks are rows from the
// `sprints` and `tasks` tables (20261031090000_sprints.sql).

// The only values tasks.story_points accepts
export const STORY_POINT_OPTIONS = [0, 1, 2, 3, 5, 8, 13, 21]
export const DEFAULT_SPRINT_DAYS = 14
const NAME_MAX = 80
const GOAL_MAX = 500
const DAY_MS = 24 * 60 * 60 * 1000

// "YYYY-MM-DD" for a Date, in local time
export function toDateKey(date) {
    const pad = (n) => String(n).padStart(2, "0")
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Whole days from one "YYYY-MM-DD" to another
function daysBetween(fromKey, toKey) {
    return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / DAY_MS)
}

function addDays(key, days) {
    return new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

// "3 Nov – 16 Nov"
export function formatSprintDates(sprint) {
    const fmt = (key) => new Date(`${key}T00:00:00`).toLocaleDateString([], { day: "numeric", month: "short" })
    return `${fmt(sprint.starts_on)} – ${fmt(sprint.ends_on)}`
}

// { active, planned (soonest first), completed (latest first) }
export function groupSprints(sprints) {
    const list = sprints || []
    return {
        active: list.find((s) => s.status === "active") || null,
        planned: list.filter((s) => s.status === "planned").sort((a, b) => a.starts_on.localeCompare(b.starts_on)),
        completed: list.filter((s) => s.status === "completed").sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || "")),
    }
}

export function sprintTotals(tasks) {
    const list = tasks || []
    const done = list.filter((t) => t.status === "done")
    const points = (items) => items.reduce((sum, t) => sum + (Number(t.story_points) || 0), 0)
    return {
        totalTasks: list.length,
        doneTasks: done.length,
        totalPoints: points(list),
        donePoints: points(done),
        percent: list.length === 0 ? 0 : Math.round((100 * done.length) / list.length),
    }
}

// Days until the sprint's last day (0 = ends today, negative = past its end)
export function daysLeft(endsOn, today = new Date()) {
    return daysBetween(toDateKey(today), endsOn)
}

export function daysLeftLabel(endsOn, today = new Date()) {
    const days = daysLeft(endsOn, today)
    if (days < 0) return `${-days} day${days === -1 ? "" : "s"} over`
    if (days === 0) return "Ends today"
    return `${days} day${days === 1 ? "" : "s"} left`
}

// Default dates for a new sprint: starts today, or the day after the latest planned/active one ends
export function suggestedSprintDates(sprints, today = new Date()) {
    const todayKey = toDateKey(today)
    const lastEnd = (sprints || []).filter((s) => s.status !== "completed").map((s) => s.ends_on).sort().pop()
    const startsOn = lastEnd && lastEnd >= todayKey ? addDays(lastEnd, 1) : todayKey
    return { startsOn, endsOn: addDays(startsOn, DEFAULT_SPRINT_DAYS - 1) }
}

export function nextSprintName(sprints) {
    return `Sprint ${(sprints || []).length + 1}`
}

// Error message for the sprint form, or null
export function validateSprint({ name, goal, startsOn, endsOn }) {
    const trimmed = (name || "").trim()
    if (!trimmed) return "Give the sprint a name."
    if (trimmed.length > NAME_MAX) return `Keep the name under ${NAME_MAX} characters.`
    if ((goal || "").length > GOAL_MAX) return `Keep the goal under ${GOAL_MAX} characters.`
    if (!startsOn || !endsOn) return "Pick a start and an end date."
    if (endsOn < startsOn) return "The sprint can't end before it starts."
    return null
}

// Burndown for a sprint: work left on each day, against an even ideal line.
// Counts story points, or tasks when nothing in the sprint is estimated.
// Days after `today` have remaining = null (not happened yet).
export function burndown(sprint, tasks, today = new Date()) {
    const list = tasks || []
    const usesPoints = list.some((t) => Number(t.story_points) > 0)
    const size = (t) => (usesPoints ? Number(t.story_points) || 0 : 1)
    const total = list.reduce((sum, t) => sum + size(t), 0)
    const length = Math.max(daysBetween(sprint.starts_on, sprint.ends_on), 0)
    const todayKey = toDateKey(today)
    const days = []
    for (let i = 0; i <= length; i++) {
        const date = addDays(sprint.starts_on, i)
        // Finished in this session before a reload: completed_at isn't loaded yet, so count it today
        const burned = list
            .filter((t) => t.status === "done" && (t.completed_at ? toDateKey(new Date(t.completed_at)) : todayKey) <= date)
            .reduce((sum, t) => sum + size(t), 0)
        days.push({
            date,
            ideal: length === 0 ? 0 : Math.round((total * (length - i)) / length * 10) / 10,
            remaining: date <= todayKey ? total - burned : null,
        })
    }
    return { unit: usesPoints ? "points" : "tasks", total, days }
}
