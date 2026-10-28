import { parseSubtasks } from "../taskStatus.js";

// Pure helpers behind the My Space dashboard (tested in taskStats.test.js).
// tasks.due_date is a date column ("YYYY-MM-DD"), compared against the local day.

export const BOARD_TASK_LIMIT = 4;

export function localDateKey(date = new Date()) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const dueKey = (task) => (task.due_date ? String(task.due_date).slice(0, 10) : null);

// "overdue" | "due_today" | null (done tasks are never late)
export function dueState(task, todayKey) {
    const due = dueKey(task);
    if (!due || task.status === "done") return null;
    if (due < todayKey) return "overdue";
    if (due === todayKey) return "due_today";
    return null;
}

export function summarizeTasks(tasks, todayKey) {
    const states = tasks.map((t) => dueState(t, todayKey));
    return {
        active: tasks.filter((t) => t.status !== "done").length,
        dueToday: states.filter((s) => s === "due_today").length,
        overdue: states.filter((s) => s === "overdue").length,
        completed: tasks.filter((t) => t.status === "done").length,
    };
}

export function taskProgress(task) {
    const subtasks = parseSubtasks(task.sub_tasks);
    const done = subtasks.filter((st) => st.done).length;
    const total = subtasks.length;
    const percent = total > 0 ? Math.round((done / total) * 100) : task.status === "done" ? 100 : 0;
    return { done, total, percent };
}

const STATUS_LABELS = { todo: "To do", in_progress: "In progress", done: "Done" };
export const statusLabel = (task, todayKey) =>
    dueState(task, todayKey) === "overdue" ? "Overdue" : STATUS_LABELS[task.status] || "To do";

const PRIORITY_LABELS = { urgent: "Urgent", high: "High", medium: "Normal", low: "Low" };
export const priorityLabel = (priority) => PRIORITY_LABELS[priority] || null;

// Open tasks for the board: overdue first, then by due date (undated last)
export function boardTasks(tasks, todayKey, limit = BOARD_TASK_LIMIT) {
    const rank = (t) => (dueState(t, todayKey) === "overdue" ? 0 : 1);
    return tasks
        .filter((t) => t.status !== "done")
        .sort((a, b) => rank(a) - rank(b) || (dueKey(a) || "9999").localeCompare(dueKey(b) || "9999"))
        .slice(0, limit);
}

export function greetingFor(hour) {
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
}
