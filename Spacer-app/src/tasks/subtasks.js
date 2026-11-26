// Subtasks: real tasks with parent_task_id set, one level deep, in the same
// project as their parent (the database's tasks_guard_parent enforces this).
// They show on the board like any task. The older "checklist" (tasks.sub_tasks
// JSON, see taskStatus.js) is separate: plain items without an assignee.
// No imports, so `npm test` can load it.

const idOf = (value) => String(value ?? "")

/** The task's subtasks, oldest first (the order they were added). */
export function subtasksOf(tasks, parentId) {
    if (parentId == null) return []
    return tasks
        .filter((t) => idOf(t.parent_task_id) === idOf(parentId))
        .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")))
}

/** { done, total } of the task's subtasks; total 0 when it has none. */
export function subtaskProgress(tasks, parentId) {
    const children = subtasksOf(tasks, parentId)
    return { done: children.filter((t) => t.status === "done").length, total: children.length }
}

/** The task's parent from a Map(id -> task), or null. */
export function parentOf(task, byId) {
    if (!task?.parent_task_id) return null
    return byId.get(idOf(task.parent_task_id)) ?? null
}

/** Only top-level tasks get subtasks: a subtask can't have its own. */
export function canHaveSubtasks(task) {
    return Boolean(task) && !task.parent_task_id
}

/** Fields a new subtask copies from its parent, plus its title. */
export function newSubtaskFields(parent, title, createdBy) {
    return {
        title: title.trim(),
        project_id: parent.project_id ?? null,
        organization_id: parent.organization_id,
        parent_task_id: parent.id,
        status: "todo",
        priority: "medium",
        created_by: createdBy ?? null,
        ...(parent.team_space_id ? { team_space_id: parent.team_space_id } : {}),
    }
}
