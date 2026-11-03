import { groupTasksByDepartment } from "./groupTasksByDepartment"

// Super admin view of All Tasks: departments → projects → tasks.
// Deliberately shows no assignees, only the work itself.

const STATUS_LABEL = { todo: "To do", in_progress: "In progress", done: "Done" }
const STATUS_STYLE = {
    todo: "bg-muted/15 text-soft border-muted/30",
    in_progress: "bg-[var(--primary-color)]/15 text-accent-ink border-accent-ink/30",
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

    return (
        // The Orbit space backdrop spans the whole area, as the board columns have it for everyone else
        <div className="orbit-column bg-raised/50 border border-line/30 rounded-xl p-4 space-y-8">
            {groups.map((dept) => (
                <section key={dept.id ?? "none"} aria-labelledby={`dept-${dept.id ?? "none"}`} className="space-y-3">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px] text-accent-ink">groups</span>
                        <h3 id={`dept-${dept.id ?? "none"}`} className="text-base font-semibold text-white">{dept.name}</h3>
                        <span className="text-xs text-muted">
                            {dept.taskCount} {dept.taskCount === 1 ? "task" : "tasks"} · {dept.projects.length} {dept.projects.length === 1 ? "project" : "projects"}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
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
                </section>
            ))}
        </div>
    )
}
