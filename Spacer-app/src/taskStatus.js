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
// without subtasks keeps whatever status a person gave it. A task that is
// Waiting or In review (`currentStatus`) stays there until every item is
// ticked: ticking some shouldn't pull it back to Doing.
export function statusFromSubtasks(subtasks, currentStatus = null) {
    if (!subtasks || subtasks.length === 0) return null;
    if (subtasks.every(st => st.done)) return "done";
    if (currentStatus === "waiting" || currentStatus === "in_review") return null;
    if (subtasks.some(st => st.done)) return "in_progress";
    return "todo";
}
