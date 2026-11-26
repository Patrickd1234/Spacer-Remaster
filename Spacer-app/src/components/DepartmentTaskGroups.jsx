import { useState } from "react"
import { groupTasksByDepartment } from "./groupTasksByDepartment"

// Super admin view of All Tasks: departments → projects → tasks.
// Deliberately shows no assignees, only the work itself. Departments start
// collapsed and open from their heading, so a big organization doesn't crowd
// the page.

const STATUS_LABEL = { todo: "To do", in_progress: "In progress", waiting: "Waiting", in_review: "In review", done: "Done" }
const STATUS_STYLE = {
    todo: "bg-muted/15 text-soft border-muted/30",
    in_progress: "bg-[var(--primary-color)]/15 text-accent-ink border-accent-ink/30",
    waiting: "bg-amber-500/10 text-amber-300 border-amber-400/30",
    in_review: "bg-violet-500/10 text-violet-300 border-violet-400/30",
    done: "bg-green-500/15 text-green-400 border-green-500/30",
}

function TaskRow({ task, onClick }) {
    const status = STATUS_LABEL[task.status] ? task.status : "todo"
    const isOverdue = status !== "done" && task.due_date && new Date(task.due_date) < new Date()
    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-surface2 transition-colors cursor-pointer"
        >
            <span className={`flex-1 min-w-0 truncate text-sm ${status === "done" ? "line-through text-muted" : "text-white"}`}>
                {task.title || task.name || "Untitled"}
            </span>
            {task.due_date && (
                <span className={`shrink-0 flex items-center gap-1 text-[11px] ${isOverdue ? "text-red-400" : "text-muted"}`}>
                    <span className="material-symbols-outlined text-[13px]">calendar_today</span>
                    {new Date(task.due_date).toLocaleDateString("en-GB")}
                </span>
            )}
            <span className={`shrink-0 px-2 py-0.5 rounded border text-[10px] font-bold uppercase tracking-wider ${STATUS_STYLE[status]}`}>
                {STATUS_LABEL[status]}
            </span>
        </button>
    )
}

export default function DepartmentTaskGroups({ tasks, departments, onSelectTask }) {
    const groups = groupTasksByDepartment(tasks, departments)
    // Tracks the open ones, so departments that load later also start collapsed
    const [expandedIds, setExpandedIds] = useState(() => new Set())
    const toggleDepartment = (key) => setExpandedIds((prev) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
    })

    return (
        // The Orbit space backdrop spans the whole area, as the board columns have it for everyone else
        <div className="orbit-column bg-raised/50 border border-line/30 rounded-xl p-4 space-y-8">
            {groups.map((dept) => {
                const key = dept.id ?? "none"
                const isCollapsed = !expandedIds.has(key)
                return (
                <section key={key} aria-labelledby={`dept-${key}`} className="space-y-3">
                    <h3 id={`dept-${key}`} className="text-base font-semibold text-white">
                        <button
                            type="button"
                            onClick={() => toggleDepartment(key)}
                            aria-expanded={!isCollapsed}
                            aria-controls={`dept-projects-${key}`}
                            title={isCollapsed ? `Expand ${dept.name}` : `Collapse ${dept.name}`}
                            className="group flex items-center gap-2 text-left cursor-pointer"
                        >
                            <span className={`material-symbols-outlined text-[18px] text-muted group-hover:text-white transition-transform duration-200 ${isCollapsed ? "-rotate-90" : ""}`}>expand_more</span>
                            <span className="material-symbols-outlined text-[18px] text-accent-ink">groups</span>
                            <span className="group-hover:text-accent-ink transition-colors">{dept.name}</span>
                            <span className="text-xs font-normal text-muted">
                                {dept.taskCount} {dept.taskCount === 1 ? "task" : "tasks"} · {dept.projects.length} {dept.projects.length === 1 ? "project" : "projects"}
                            </span>
                        </button>
                    </h3>

                    {/* Left out while folded: the grid class would override the hidden attribute */}
                    {!isCollapsed && (
                    <div id={`dept-projects-${key}`} className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                        {dept.projects.map((project) => (
                            <div key={project.id ?? "none"} className="bg-raised border border-line rounded-xl">
                                <div className="flex items-center justify-between px-4 py-3 border-b border-line/40">
                                    <span className="flex items-center gap-2 min-w-0">
                                        <span className="material-symbols-outlined text-[16px] text-muted">folder</span>
                                        <span className="font-semibold text-sm text-white truncate">{project.name}</span>
                                    </span>
                                    <span className="text-xs text-muted font-bold shrink-0">{project.tasks.length}</span>
                                </div>
                                <div className="p-1.5">
                                    {project.tasks.map((task) => (
                                        <TaskRow key={task.id} task={task} onClick={() => onSelectTask(task)} />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    )}
                </section>
                )
            })}
        </div>
    )
}
