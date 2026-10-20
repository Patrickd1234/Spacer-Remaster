// tasks.sub_tasks is stored as a JSON string of [{ text, done }, ...]
export function parseSubtasks(raw) {
    if (!raw) return [];
    try {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

// Status implied by a task's subtasks, or null when it has none — a task
// without subtasks keeps whatever status a person gave it.
export function statusFromSubtasks(subtasks) {
    if (!subtasks || subtasks.length === 0) return null;
    if (subtasks.every(st => st.done)) return "done";
    if (subtasks.some(st => st.done)) return "in_progress";
    return "todo";
}
