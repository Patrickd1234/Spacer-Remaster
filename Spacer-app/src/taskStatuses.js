// A task's status (tasks.status). Five since 20261128100000_task_statuses:
// To do, In progress, Waiting (on another task, see Mark as waiting), In review
// and Done. Waiting and In review are open work: pages with three buckets
// (Reports, My Space, All Tasks, sprints, department stats) count them as in
// progress, and progress counts Done only.
// Kept free of imports so `npm test` can load it.

export const TASK_STATUSES = [
    { value: "todo", label: "To do", boardName: "Backlog", dot: "bg-muted", pill: "border-line text-soft" },
    { value: "in_progress", label: "In progress", boardName: "Doing", dot: "bg-[#3b82f6]", pill: "border-[#3b82f6]/40 text-[#7fb0ff]" },
    { value: "waiting", label: "Waiting", boardName: "Waiting", dot: "bg-amber-400", pill: "border-amber-400/40 text-amber-300" },
    { value: "in_review", label: "In review", boardName: "In review", dot: "bg-violet-400", pill: "border-violet-400/40 text-violet-300" },
    { value: "done", label: "Done", boardName: "Done", dot: "bg-accent", pill: "border-accent-ink/40 text-accent-ink" },
]

export const STATUS_VALUES = TASK_STATUSES.map((s) => s.value)

const byValue = new Map(TASK_STATUSES.map((s) => [s.value, s]))

// The status's entry; an unknown or empty status reads as To do
export function statusInfo(status) {
    return byValue.get(status) || byValue.get("todo")
}

// "In review"; with { board: true } the default board column's name ("Doing")
export function statusLabel(status, { board = false } = {}) {
    const info = statusInfo(status)
    return board ? info.boardName : info.label
}

// The three-bucket view: "todo", "in_progress" (In progress, Waiting, In review) or "done"
export function statusGroup(status) {
    if (status === "done") return "done"
    if (status === "in_progress" || status === "waiting" || status === "in_review") return "in_progress"
    return "todo"
}

export const isOpenStatus = (status) => status !== "done"
