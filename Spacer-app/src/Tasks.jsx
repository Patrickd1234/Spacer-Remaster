import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "./supabase"
import Sidebar from "./partials/SidebarRouter"
import Header from "./partials/header"
import { useRole } from "./RoleContext"

const PRIORITY_STYLE = {
    urgent: "bg-red-500/15 text-red-400 border-red-500/30",
    high: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    medium: "bg-teal-500/15 text-teal-400 border-teal-500/30",
    low: "bg-[#aff82a]/15 text-[#aff82a] border-[#aff82a]/30",
}

function TaskCard({ task, onClick }) {
    const isOverdue = task.status !== "done" && task.due_date && new Date(task.due_date) < new Date()

    return (
        <div
            onClick={onClick}
            className="bg-[#191c21] border border-[#2D3139] rounded-xl p-4 cursor-pointer hover:border-[#aff82a]/50 transition-all duration-200 group flex flex-col gap-1.5"
        >
            <h4 className={`font-semibold text-sm leading-snug ${task.status === "done" ? "line-through text-[#8c947b]" : "text-white"}`}>
                {task.title || task.name || "Untitled"}
            </h4>

            {(task.project_name || task.description) && (
                <p className="text-[11px] text-[#8c947b] truncate">
                    {task.project_name || task.description}
                </p>
            )}

            {task.due_date && (
                <div className={`flex items-center gap-1 text-[11px] mt-1 ${isOverdue ? "text-red-400" : "text-[#aff82a]"}`}>
                    <span className="material-symbols-outlined text-[13px]">calendar_today</span>
                    <span>{new Date(task.due_date).toLocaleDateString("en-GB")}</span>
                </div>
            )}
        </div>
    )
}

export default function Tasks() {
    const navigate = useNavigate()
    const [tasks, setTasks] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedTask, setSelectedTask] = useState(null)
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const { roleLoading } = useRole()


    useEffect(() => {
        const fetchTasks = async () => {
            setLoading(true)
            try {
                const { data: authData } = await supabase.auth.getUser()
                const userId = authData?.user?.id
                if (!userId) return

                const { data: profile } = await supabase
                    .from("users")
                    .select("organization_id")
                    .eq("id", userId)
                    .maybeSingle()

                const orgId = profile?.organization_id

                let query = supabase
                    .from("tasks")
                    .select("*, project:project_spaces(name)")

                if (orgId) {
                    query = query.eq("organization_id", orgId)
                } else {
                    query = query.eq("assignee_id", userId)
                }

                const { data, error } = await query.order("created_at", { ascending: false })

                if (error) {
                    console.error("Error fetching tasks:", error)
                    return
                }

                const corrected = (data || []).map(t => {
                    let subtasksList = []
                    if (t.sub_tasks) {
                        try {
                            subtasksList = JSON.parse(t.sub_tasks)
                            if (!Array.isArray(subtasksList)) subtasksList = []
                        } catch {}
                    }
                    const allDone = subtasksList.length > 0 && subtasksList.every(st => st.done)
                    const anyDone = subtasksList.some(st => st.done)
                    let expectedStatus = t.status
                    if (allDone) expectedStatus = "done"
                    else if (subtasksList.length === 0 || !anyDone) expectedStatus = "todo"
                    else expectedStatus = "in_progress"
                    return {
                        ...t,
                        status: expectedStatus,
                        project_name: t.project?.name || null,
                    }
                })
                setTasks(corrected)
            } catch (err) {
                console.error("Error fetching tasks:", err)
            } finally {
                setLoading(false)
            }
        }

        if (!roleLoading) {
            fetchTasks()
        }
    }, [roleLoading])

    const todoTasks = tasks.filter(t => t.status === "todo")
    const inProgressTasks = tasks.filter(t => t.status === "in_progress")
    const doneTasks = tasks.filter(t => t.status === "done")
    const overdueTasks = tasks.filter(t => t.status !== "done" && t.due_date && new Date(t.due_date) < new Date())
    const openCount = todoTasks.length + inProgressTasks.length

    return (
        <div className="bg-[#0F1115] min-h-screen text-white font-sans antialiased flex">
            <Sidebar onCollapsedChange={setSidebarCollapsed} />
            <div className="flex-1 flex flex-col min-w-0">
                <Header />
                <main className={`${sidebarCollapsed ? "ml-[72px]" : "ml-[260px]"} flex-1 flex flex-col pt-16 transition-all duration-300 ease-out`}>
                    <div className="p-8 space-y-8 max-w-[1400px] w-full mx-auto">

                        {/* Page Header */}
                        <section className="flex items-start justify-between">
                            <div>
                                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                                    All Tasks
                                </h1>
                                <p className="text-[#8c947b] text-sm mt-1">
                                    View all tasks across the organization.
                                </p>
                            </div>
                            <div className="flex items-center gap-2 text-[#8c947b] text-xs">
                                <span className="material-symbols-outlined text-[16px]">task</span>
                                <span>/</span>
                                <span className="text-white font-medium">All Tasks</span>
                            </div>
                        </section>

                        {/* Metric Strip */}
                        {!loading && (
                            <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-[#191c21] border border-[#2D3139] rounded-xl p-5 flex flex-col">
                                    <p className="text-3xl font-bold text-white">{todoTasks.length}</p>
                                    <p className="text-[#8c947b] text-xs font-medium mt-1">To do</p>
                                </div>
                                <div className="bg-[#191c21] border border-[#2D3139] rounded-xl p-5 flex flex-col">
                                    <p className="text-3xl font-bold text-[#aff82a]">{inProgressTasks.length}</p>
                                    <p className="text-[#8c947b] text-xs font-medium mt-1">In progress</p>
                                </div>
                                <div className="bg-[#191c21] border border-[#2D3139] rounded-xl p-5 flex flex-col">
                                    <p className="text-3xl font-bold text-green-400">{doneTasks.length}</p>
                                    <p className="text-[#8c947b] text-xs font-medium mt-1">Done</p>
                                </div>
                                <div className="bg-[#191c21] border border-[#2D3139] rounded-xl p-5 flex flex-col">
                                    <p className="text-3xl font-bold text-red-400">{overdueTasks.length}</p>
                                    <p className="text-[#8c947b] text-xs font-medium mt-1">Overdue</p>
                                </div>
                            </section>
                        )}

                        {/* Work Board Section Header */}
                        <section className="space-y-4">
                            <div className="flex items-center justify-between">
                                <h2 className="text-lg font-semibold text-white">Work Board</h2>
                                <span className="text-xs text-[#8c947b] font-medium">{openCount} Open Items</span>
                            </div>

                            {/* 3 Columns Kanban Board */}
                            {loading ? (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {[...Array(3)].map((_, i) => (
                                        <div key={i} className="bg-[#191c21] border border-[#2D3139] rounded-xl p-4 space-y-3 animate-pulse">
                                            <div className="h-3 w-16 bg-[#252a33] rounded" />
                                            <div className="h-24 w-full bg-[#252a33] rounded-xl" />
                                            <div className="h-24 w-full bg-[#252a33] rounded-xl" />
                                        </div>
                                    ))}
                                </div>
                            ) : openCount === 0 && doneTasks.length === 0 ? (
                                <div className="bg-[#191c21] border border-[#2D3139] rounded-xl flex flex-col items-center justify-center p-8 text-center flex-1">
                                    <div className="text-5xl mb-4">🎉</div>
                                    <h4 className="text-lg font-semibold text-white">All caught up</h4>
                                    <p className="text-[#8c947b] text-sm max-w-xs mt-2">There are no open tasks in the organization right now.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                                    {/* TO-DO Column */}
                                    <div className="bg-[#191c21]/50 border border-[#2D3139]/30 rounded-xl flex flex-col min-h-[400px]">
                                        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2D3139]/20">
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-[#8c947b]" />
                                                <span className="font-bold text-white text-xs uppercase tracking-wider">TO-DO</span>
                                            </div>
                                            <span className="text-xs text-[#8c947b] font-bold">{todoTasks.length}</span>
                                        </div>
                                        <div className="flex flex-col gap-3 p-3 flex-1">
                                            {todoTasks.length === 0 ? (
                                                <p className="text-xs text-[#8c947b] text-center my-auto py-12">No tasks here</p>
                                            ) : todoTasks.map(task => (
                                                <TaskCard
                                                    key={task.id}
                                                    task={task}
                                                    onClick={() => setSelectedTask(task)}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    {/* IN PROGRESS Column */}
                                    <div className="bg-[#191c21]/50 border border-[#2D3139]/30 rounded-xl flex flex-col min-h-[400px]">
                                        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2D3139]/20">
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-[#aff82a]" />
                                                <span className="font-bold text-white text-xs uppercase tracking-wider">IN PROGRESS</span>
                                            </div>
                                            <span className="text-xs text-[#8c947b] font-bold">{inProgressTasks.length}</span>
                                        </div>
                                        <div className="flex flex-col gap-3 p-3 flex-1">
                                            {inProgressTasks.length === 0 ? (
                                                <p className="text-xs text-[#8c947b] text-center my-auto py-12">No tasks here</p>
                                            ) : inProgressTasks.map(task => (
                                                <TaskCard
                                                    key={task.id}
                                                    task={task}
                                                    onClick={() => setSelectedTask(task)}
                                                />
                                            ))}
                                        </div>
                                    </div>

                                    {/* DONE Column */}
                                    <div className="bg-[#191c21]/50 border border-[#2D3139]/30 rounded-xl flex flex-col min-h-[400px]">
                                        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2D3139]/20">
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-green-400" />
                                                <span className="font-bold text-white text-xs uppercase tracking-wider">DONE</span>
                                            </div>
                                            <span className="text-xs text-[#8c947b] font-bold">{doneTasks.length}</span>
                                        </div>
                                        <div className="flex flex-col gap-3 p-3 flex-1">
                                            {doneTasks.length === 0 ? (
                                                <p className="text-xs text-[#8c947b] text-center my-auto py-12">No tasks here</p>
                                            ) : doneTasks.map(task => (
                                                <TaskCard
                                                    key={task.id}
                                                    task={task}
                                                    onClick={() => setSelectedTask(task)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </section>
                    </div>
                </main>
            </div>

            {/* Task Detail Sidebar Drawer */}
            {selectedTask && (
                <div className="fixed inset-0 z-[60] flex justify-end">
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={() => setSelectedTask(null)}
                    />
                    <div className="relative w-full max-w-md bg-[#191c21] shadow-2xl h-full overflow-y-auto flex flex-col border-l border-[#2D3139]">
                        <div className="flex items-center justify-between p-6 border-b border-[#2D3139]/30 bg-[#1C1F26]">
                            <h2 className="font-bold text-white flex items-center gap-2 text-[15px]">
                                <span className="material-symbols-outlined text-[#aff82a]">task</span>
                                Task Details
                            </h2>
                            <button
                                onClick={() => setSelectedTask(null)}
                                className="text-[#8c947b] hover:text-white hover:bg-[#2D3139] w-8 h-8 rounded flex items-center justify-center transition-colors"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-6 space-y-6 flex-1">
                            <div>
                                <h1 className="text-lg text-white font-bold leading-tight mb-3">{selectedTask.title || selectedTask.name || "Untitled"}</h1>
                                <div className="flex flex-wrap gap-2">
                                    {selectedTask.priority && (
                                        <span className={`px-3 py-1 rounded border text-xs font-bold uppercase tracking-wider ${PRIORITY_STYLE[selectedTask.priority] || PRIORITY_STYLE.low}`}>
                                            {selectedTask.priority}
                                        </span>
                                    )}
                                    <span className="px-3 py-1 rounded border text-xs font-bold uppercase tracking-wider bg-[#1C1F26] border-[#2D3139]/50 text-[#8c947b]">
                                        {selectedTask.status ? selectedTask.status.replace("_", " ") : "todo"}
                                    </span>
                                </div>
                            </div>
                            {selectedTask.description && (
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#8c947b] mb-2">Description</p>
                                    <p className="text-sm text-white whitespace-pre-wrap leading-relaxed bg-[#14171d] p-4 rounded-xl border border-[#2D3139]/20">
                                        {selectedTask.description}
                                    </p>
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-[#14171d] p-4 rounded-xl border border-[#2D3139]/20">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#8c947b] mb-1 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[13px]">calendar_today</span>Deadline
                                    </p>
                                    <p className="text-sm text-white font-semibold">
                                        {selectedTask.due_date
                                            ? new Date(selectedTask.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                                            : <span className="italic opacity-60">No deadline</span>}
                                    </p>
                                </div>
                                <div className="bg-[#14171d] p-4 rounded-xl border border-[#2D3139]/20">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-[#8c947b] mb-1 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[13px]">folder</span>Project
                                    </p>
                                    <p className="text-sm text-white font-semibold truncate">
                                        {selectedTask.project_name || <span className="italic opacity-60">Unknown</span>}
                                    </p>
                                </div>
                            </div>
                            {selectedTask.project_id && (
                                <button
                                    onClick={() => navigate(`/project_page/${selectedTask.project_id}`)}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#aff82a]/10 border border-[#aff82a]/30 text-[#aff82a] text-sm font-semibold hover:bg-[#aff82a]/20 transition-colors cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                                    Open in Project
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
