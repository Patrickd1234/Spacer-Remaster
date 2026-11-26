import { isTaskOverdue } from "./boardGrouping.js"
import { statusGroup } from "./taskStatuses.js"

// Status of a project on the Reports page's Project Workspaces, from its task
// counts: all tasks done is "done", any overdue task makes it "attention"
// (the card's Needs Attention badge), otherwise "in_progress".
export function projectStatus({ total, done, overdue }) {
    if (total > 0 && done === total) return "done"
    if (overdue > 0) return "attention"
    return "in_progress"
}

// A task the project's Orbit board shows under Doing (or Waiting, In review):
// in progress and not overdue (overdue tasks show under Overdue instead; see boardGrouping.js)
export function isInDoingColumn(task, now = new Date()) {
    return statusGroup(task.status) === "in_progress" && !isTaskOverdue(task, now)
}

// Whether a project shows under a status filter. In Progress lists only
// unfinished projects with at least one task under Doing on their Orbit board,
// whatever their badge says (a Needs Attention project keeps its badge).
export function matchesStatusFilter(project, filter) {
    if (filter === "all") return true
    if (filter === "done") return project.calculatedStatus === "done"
    if (filter === "attention") return project.calculatedStatus === "attention"
    if (filter === "in_progress") return project.calculatedStatus !== "done" && project.doingTasks > 0
    return true
}
