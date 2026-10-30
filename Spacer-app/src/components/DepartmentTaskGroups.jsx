import { groupTasksByDepartment } from "./groupTasksByDepartment"

// Super admin view of All Tasks: departments → projects → tasks.
// Deliberately shows no assignees, only the work itself.

const STATUS_LABEL = { todo: "To do", in_progress: "In progress", done: "Done" }
const STATUS_STYLE = {
    todo: "bg-[#8c947b]/15 text-[#c4cbb3] border-[#8c947b]/30",
    in_progress: "bg-[var(--primary-color)]/15 text-[var(--primary-color)] border-[var(--primary-color)]/30",
    done: "bg-green-500/15 text-green-400 border-green-500/30",
}

function TaskRow({ task, onClick }) {
    const status = STATUS_LABEL[task.status] ? task.status : "todo"
    const isOverdue = status !== "done" && task.due_date && new Date(task.due_date) < new Date()
    return (
        <button
            type="button"
            onClick={onClick}
            className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[#252a33] transition-colors cursor-pointer"
        >
            <span className={`flex-1 min-w-0 truncate text-sm ${status === "done" ? "line-through text-[#8c947b]" : "text-white"}`}>
                {task.title || task.name || "Untitled"}
            </span>
            {task.due_date && (
                <span className={`shrink-0 flex items-center gap-1 text-[11px] ${isOverdue ? "text-red-400" : "text-[#8c947b]"}`}>
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
        <div className="space-y-8">
            {groups.map((dept) => (
                <section key={dept.id ?? "none"} aria-labelledby={`dept-${dept.id ?? "none"}`} className="space-y-3">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px] text-[var(--primary-color)]">groups</span>
                        <h3 id={`dept-${dept.id ?? "none"}`} className="text-base font-semibold text-white">{dept.name}</h3>
                        <span className="text-xs text-[#8c947b]">
                            {dept.taskCount} {dept.taskCount === 1 ? "task" : "tasks"} · {dept.projects.length} {dept.projects.length === 1 ? "project" : "projects"}
                        </span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                        {dept.projects.map((project) => (
                            <div key={project.id ?? "none"} className="bg-[#191c21] border border-[#2D3139] rounded-xl">
                                <div className="flex items-center justify-between px-4 py-3 border-b border-[#2D3139]/40">
                                    <span className="flex items-center gap-2 min-w-0">
                                        <span className="material-symbols-outlined text-[16px] text-[#8c947b]">folder</span>
                                        <span className="font-semibold text-sm text-white truncate">{project.name}</span>
                                    </span>
                                    <span className="text-xs text-[#8c947b] font-bold shrink-0">{project.tasks.length}</span>
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
