// Which board column each task shows in. The Tasks board and the Summary
// overview both use this, so their counts always agree.
// Kept free of imports so `npm test` can load it without Supabase.

// Derived from due dates; always last, can't be edited or dropped into
export const OVERDUE_COLUMN = { key: "overdue", name: "Overdue", isOverdue: true }

// Past its due date and not finished
export function isTaskOverdue(task, now = new Date()) {
    return task.status !== "done" && Boolean(task.due_date) && new Date(task.due_date) < now
}

// The column a task shows in: its saved column if that still matches its status,
// otherwise the first column for its status (status can change via subtasks)
export function columnKeyForTask(task, columns) {
    const saved = task.column_id && columns.find((c) => c.id === task.column_id)
    if (saved && saved.base_status === task.status) return saved.key
    return (columns.find((c) => c.base_status === task.status) || columns[0])?.key ?? null
}

// { [column key]: tasks } for every column plus Overdue. Each task is in exactly
// one: an overdue task shows only under Overdue, not under its status's column.
export function groupTasksByColumn(tasks, columns, now = new Date()) {
    const groups = Object.fromEntries([...columns, OVERDUE_COLUMN].map((c) => [c.key, []]))
    for (const task of tasks) {
        const key = isTaskOverdue(task, now) ? OVERDUE_COLUMN.key : columnKeyForTask(task, columns)
        groups[key]?.push(task)
    }
    return groups
}
