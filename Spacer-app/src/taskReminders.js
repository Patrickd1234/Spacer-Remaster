// Daily in-app reminders about the user's own open tasks, built in the browser
// from the tasks assigned to them (no database rows):
// - one summary per day of the open tasks assigned to them
// - one reminder per day for each task whose deadline is approaching
// Ids include the date, so each reminder comes back unread the next day.
// They are dated at the start of the local day, which keeps "Mark all read"
// working with the bell's read state (see notifications.js).

const DUE_SOON_DAYS = 2 // due today, tomorrow or the day after
const MS_PER_DAY = 24 * 60 * 60 * 1000
const MAX_TITLES_IN_SUMMARY = 3

const pad = (n) => String(n).padStart(2, "0")
const localDateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate())

// due_date is a date column ("YYYY-MM-DD"); only the date part is used
const daysUntil = (dueDate, today) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dueDate))
    if (!match) return null
    const due = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
    return Math.round((due - today) / MS_PER_DAY)
}

const dueLabel = (days) => (days === 0 ? "due today" : days === 1 ? "due tomorrow" : `due in ${days} days`)

const taskTitle = (task) => task.title || "Untitled task"

/**
 * @param {Array<{ id: string, title?: string, due_date?: string | null, status?: string }>} tasks tasks assigned to the user
 * @param {Date} now
 * @returns {Array<{ id: string, kind: "daily" | "due", taskId?: string, title: string, message: string, created_at: string }>}
 */
export function buildTaskReminders(tasks, now = new Date()) {
    const openTasks = (tasks || []).filter((task) => task && task.status !== "done")
    if (openTasks.length === 0) return []

    const today = startOfDay(now)
    const dayKey = localDateKey(today)
    const created_at = today.toISOString()

    const titles = openTasks.slice(0, MAX_TITLES_IN_SUMMARY).map(taskTitle)
    const more = openTasks.length - titles.length
    const daily = {
        id: `reminder:daily:${dayKey}`,
        kind: "daily",
        title: `You have ${openTasks.length} open ${openTasks.length === 1 ? "task" : "tasks"} assigned to you`,
        message: titles.join(", ") + (more > 0 ? ` and ${more} more` : ""),
        created_at,
    }

    const dueSoon = openTasks
        .map((task) => ({ task, days: task.due_date ? daysUntil(task.due_date, today) : null }))
        .filter(({ days }) => days !== null && days >= 0 && days <= DUE_SOON_DAYS)
        .sort((a, b) => a.days - b.days)
        .map(({ task, days }) => ({
            id: `reminder:due:${task.id}:${dayKey}`,
            kind: "due",
            taskId: task.id,
            title: `"${taskTitle(task)}" is ${dueLabel(days)}`,
            message: "Deadline approaching for a task assigned to you.",
            created_at,
        }))

    return [...dueSoon, daily]
}
