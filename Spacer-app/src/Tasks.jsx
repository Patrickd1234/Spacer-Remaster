<<<<<<< HEAD
import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "./supabase"
import Sidebar from "./partials/SidebarRouter"
import Header from "./partials/header"

const PRIORITY_STYLE = {
    urgent: "bg-red-500/15 text-red-400 border-red-500/30",
    high: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    medium: "bg-teal-500/15 text-teal-400 border-teal-500/30",
    low: "bg-[#aff82a]/15 text-[#aff82a] border-[#aff82a]/30",
}

function TaskCard({ task, onClick }) {
    let subtasksList = []
    if (task.sub_tasks) {
        try {
            subtasksList = JSON.parse(task.sub_tasks)
            if (!Array.isArray(subtasksList)) subtasksList = []
        } catch {}
    }
    const completedCount = subtasksList.filter(st => st.done).length
    const totalCount = subtasksList.length
    const percent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0
    const isOverdue = task.status !== "done" && task.due_date && new Date(task.due_date) < new Date()

    return (
        <div
            onClick={onClick}
            className="bg-[#191c21] border border-[#2D3139] rounded-xl p-4 cursor-pointer hover:border-[#aff82a]/40 transition-all duration-200 group flex flex-col gap-3"
        >
            {/* Priority + overdue badge */}
            <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${PRIORITY_STYLE[task.priority] || PRIORITY_STYLE.low}`}>
                    <span className="w-1.5 h-1.5 rounded-sm bg-current" />
                    {task.priority || "Normal"}
                </span>
                {isOverdue && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-red-500/10 text-red-400 border border-red-500/20">
                        <span className="material-symbols-outlined text-[11px]">error</span>Overdue
                    </span>
                )}
            </div>

            {/* Title */}
            <h4 className={`font-semibold text-sm leading-snug ${task.status === "done" ? "line-through text-[#8c947b]" : "text-white"}`}>
                {task.title || "Untitled"}
            </h4>

            {/* Description */}
            {task.description && (
                <p className="text-[11px] text-[#8c947b]/70 leading-relaxed line-clamp-2">{task.description}</p>
            )}

            {/* Subtask progress */}
            {totalCount > 0 && (
                <div>
                    <div className="flex items-center justify-between text-[10px] text-[#8c947b] mb-1">
                        <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px]">format_list_bulleted</span>
                            Sub-tasks
                        </span>
                        <span>{completedCount}/{totalCount}</span>
                    </div>
                    <div className="w-full bg-[#1e222b] rounded-full h-1 overflow-hidden">
                        <div className="bg-[#aff82a] h-full transition-all duration-300" style={{ width: `${percent}%` }} />
                    </div>
                </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between mt-auto pt-2 border-t border-[#2D3139]/20 text-[10px] text-[#8c947b]">
                <span className="truncate max-w-[120px]" title={task.project_name}>{task.project_name || "—"}</span>
                {task.due_date && (
                    <span className={`flex items-center gap-1 ${isOverdue ? "text-red-400" : "text-[#aff82a]"}`}>
                        <span className="material-symbols-outlined text-[12px]">calendar_today</span>
                        {new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                )}
            </div>
        </div>
    )
}

const COLUMNS = [
    { key: "todo", label: "To Do", dot: "bg-[#8c947b]" },
    { key: "in_progress", label: "In Progress", dot: "bg-[#aff82a]" },
    { key: "done", label: "Done", dot: "bg-green-400" },
    { key: "overdue", label: "Overdue", dot: "bg-red-400" },
]

export default function Tasks() {
    const navigate = useNavigate()
    const [tasks, setTasks] = useState([])
    const [loading, setLoading] = useState(true)
    const [selectedTask, setSelectedTask] = useState(null)
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [filter, setFilter] = useState("all") // all | todo | in_progress | done | overdue
    const [search, setSearch] = useState("")

    useEffect(() => {
        const fetchTasks = async () => {
            setLoading(true)
            try {
                const { data: authData } = await supabase.auth.getUser()
                const userId = authData?.user?.id
                if (!userId) return

                const { data, error } = await supabase
                    .from("tasks")
                    .select("*, project:project_spaces(name)")
                    .eq("assignee_id", userId)
                    .order("created_at", { ascending: false })

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
            } finally {
                setLoading(false)
            }
        }
        fetchTasks()
    }, [])

    const getColumn = (task) => {
        if (task.status === "done") return "done"
        const isOverdue = task.due_date && new Date(task.due_date) < new Date()
        if (isOverdue) return "overdue"
        return task.status || "todo"
    }

    const searchLower = search.toLowerCase()
    const filtered = tasks.filter(t => {
        if (search && !t.title?.toLowerCase().includes(searchLower) && !t.description?.toLowerCase().includes(searchLower)) return false
        if (filter === "all") return true
        return getColumn(t) === filter
    })

    const todoTasks = tasks.filter(t => getColumn(t) === "todo")
    const inProgressTasks = tasks.filter(t => getColumn(t) === "in_progress")
    const doneTasks = tasks.filter(t => getColumn(t) === "done")
    const overdueTasks = tasks.filter(t => getColumn(t) === "overdue")

    const openCount = todoTasks.length + inProgressTasks.length

    return (
        <div className="bg-[#0F1115] min-h-screen text-white font-sans antialiased flex">
=======
import Sidebar from "./partials/sidebar"
import Header from "./partials/header"
import { useState, useEffect } from "react"
import { supabase } from "./supabase"
import { useRole } from "./RoleContext"

export default function Tasks() {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [userTasks, setUserTasks] = useState([])
    const [tasksLoading, setTasksLoading] = useState(true)
    const { isSuperAdmin, roleLoading } = useRole()
    const [userId, setUserId] = useState(null)
    const [displayName, setDisplayName] = useState("User")

    const fetchUserTasks = async (uid) => {
        setTasksLoading(true)
        try {
            const { data, error } = await supabase
                .from("tasks")
                .select("*")
                .eq("assignee_id", uid)

            if (error) {
                console.warn("tasks fetch error:", error)
            } else {
                setUserTasks(data || [])
            }
        } catch (err) {
            console.error("fetchUserTasks error:", err)
        } finally {
            setTasksLoading(false)
        }
    }

    useEffect(() => {
        const init = async () => {
            try {
                const { data: authData } = await supabase.auth.getUser()
                const uid = authData?.user?.id
                if (!uid) {
                    setTasksLoading(false)
                    return
                }
                setUserId(uid)

                const { data: profile } = await supabase
                    .from("users")
                    .select("*")
                    .eq("id", uid)
                    .maybeSingle()

                const name = profile?.name || authData.user.user_metadata?.full_name || authData.user.email?.split("@")[0] || "User"
                setDisplayName(name)

                await fetchUserTasks(uid)
            } catch (err) {
                console.error("Tasks init error:", err)
                setTasksLoading(false)
            }
        }
        
        if (!roleLoading) {
            init()
        }
    }, [roleLoading])

    const todoTasks = userTasks.filter(t => t.status === "todo")
    const inProgressTasks = userTasks.filter(t => t.status === "in_progress")
    const doneTasks = userTasks.filter(t => t.status === "done")
    const openCount = todoTasks.length + inProgressTasks.length

    return (
        <div className="bg-background min-h-screen text-white font-sans antialiased flex">
>>>>>>> 70696dd56f5c0ef51b07076c09163bf8c276f9da
            <Sidebar onCollapsedChange={setSidebarCollapsed} />
            <div className="flex-1 flex flex-col min-w-0">
                <Header />
                <main className={`${sidebarCollapsed ? "ml-[72px]" : "ml-[260px]"} flex-1 flex flex-col pt-16 transition-all duration-300 ease-out`}>
<<<<<<< HEAD
                    <div className="p-8 space-y-8 max-w-[1400px] w-full mx-auto">

                        {/* ── Page Header ── */}
                        <section className="flex items-start justify-between">
                            <div>
                                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[#aff82a]">task_alt</span>
                                    My Tasks
                                </h1>
                                <p className="text-[#8c947b] text-sm mt-1">All tasks assigned to you across every project.</p>
                            </div>
                            <div className="flex items-center gap-2 text-[#8c947b] text-xs">
=======
                    <div className="p-8 space-y-8 max-w-[1400px] w-full mx-auto h-full flex flex-col">
                        
                        {/* Header */}
                        <section className="flex items-start justify-between shrink-0">
                            <div>
                                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                                    My Tasks
                                </h1>
                                <p className="text-outline text-sm mt-1">
                                    {isSuperAdmin
                                        ? "Even as a superadmin, these are your direct assignments."
                                        : "Manage your assigned work across all projects."}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 text-outline text-xs">
>>>>>>> 70696dd56f5c0ef51b07076c09163bf8c276f9da
                                <span className="material-symbols-outlined text-[16px]">task</span>
                                <span>/</span>
                                <span className="text-white font-medium">My Tasks</span>
                            </div>
                        </section>

<<<<<<< HEAD
                        {/* ── Stat Strip ── */}
                        {!loading && (
                            <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {[
                                    { label: "To Do", value: todoTasks.length, color: "text-white" },
                                    { label: "In Progress", value: inProgressTasks.length, color: "text-[#aff82a]" },
                                    { label: "Done", value: doneTasks.length, color: "text-green-400" },
                                    { label: "Overdue", value: overdueTasks.length, color: "text-red-400" },
                                ].map(s => (
                                    <div key={s.label} className="bg-[#191c21] border border-[#2D3139] rounded-xl p-5 flex flex-col">
                                        <p className={`text-3xl font-bold ${s.color}`}>{s.value}</p>
                                        <p className="text-[#8c947b] text-xs font-medium mt-1">{s.label}</p>
                                    </div>
                                ))}
                            </section>
                        )}

                        {/* ── Search + Filter ── */}
                        <section className="flex flex-wrap items-center gap-3">
                            <div className="relative flex-1 min-w-[200px] max-w-xs">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-[#8c947b] text-[16px]">search</span>
                                <input
                                    type="text"
                                    placeholder="Search tasks…"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    className="w-full bg-[#191c21] border border-[#2D3139] rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-[#8c947b] focus:outline-none focus:border-[#aff82a]/50 transition-colors"
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                {[["all", "All"], ["todo", "To Do"], ["in_progress", "In Progress"], ["done", "Done"], ["overdue", "Overdue"]].map(([val, label]) => (
                                    <button
                                        key={val}
                                        onClick={() => setFilter(val)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filter === val ? "bg-[#aff82a] text-[#1C1F26]" : "bg-[#191c21] border border-[#2D3139] text-[#8c947b] hover:text-white hover:border-[#424934]"}`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* ── Kanban Board ── */}
                        {loading ? (
                            <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                {[...Array(4)].map((_, i) => (
                                    <div key={i} className="bg-[#191c21] border border-[#2D3139] rounded-xl p-4 space-y-3 animate-pulse">
                                        <div className="h-3 w-16 bg-[#252a33] rounded" />
                                        <div className="h-24 w-full bg-[#252a33] rounded-xl" />
                                        <div className="h-24 w-full bg-[#252a33] rounded-xl" />
                                    </div>
                                ))}
                            </section>
                        ) : filtered.length === 0 ? (
                            <div className="bg-[#191c21] border border-[#2D3139] rounded-xl flex flex-col items-center justify-center p-16 text-center">
                                <span className="text-5xl mb-4">🎉</span>
                                <h3 className="text-lg font-semibold text-white">
                                    {search ? "No tasks match your search" : "You're all caught up!"}
                                </h3>
                                <p className="text-[#8c947b] text-sm max-w-xs mt-2">
                                    {search ? "Try a different keyword." : "No tasks are assigned to you right now."}
                                </p>
                            </div>
                        ) : filter === "all" ? (
                            <section className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
                                {COLUMNS.map(col => {
                                    const colTasks = filtered.filter(t => getColumn(t) === col.key)
                                    return (
                                        <div key={col.key} className="bg-[#191c21]/50 border border-[#2D3139]/30 rounded-xl flex flex-col">
                                            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#2D3139]/20">
                                                <span className={`w-2.5 h-2.5 rounded-full ${col.dot}`} />
                                                <span className="font-bold text-white text-xs uppercase tracking-wider">{col.label}</span>
                                                <span className="ml-auto text-[10px] text-[#8c947b] bg-[#1C1F26] border border-[#2D3139]/50 rounded-full px-2 py-0.5">{colTasks.length}</span>
                                            </div>
                                            <div className="flex flex-col gap-3 p-3">
                                                {colTasks.length === 0 ? (
                                                    <div className="flex flex-col items-center justify-center py-8 opacity-40">
                                                        <span className="material-symbols-outlined text-[28px] text-[#8c947b] mb-1">inbox</span>
                                                        <p className="text-[11px] text-[#8c947b]">Empty</p>
                                                    </div>
                                                ) : colTasks.map(task => (
                                                    <TaskCard
                                                        key={task.id}
                                                        task={task}
                                                        onClick={() => setSelectedTask(task)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )
                                })}
                            </section>
                        ) : (
                            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {filtered.map(task => (
                                    <TaskCard key={task.id} task={task} onClick={() => setSelectedTask(task)} />
                                ))}
                            </section>
                        )}
                    </div>
                </main>
            </div>

            {/* ── Task Detail Sidebar ── */}
            {selectedTask && (
                <div className="fixed inset-0 z-[60] flex justify-end">
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={() => setSelectedTask(null)}
                    />
                    <div className="relative w-full max-w-md bg-[#191c21] shadow-2xl h-full overflow-y-auto flex flex-col border-l border-[#2D3139]">
                        {/* Header */}
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

                        {/* Content */}
                        <div className="p-6 space-y-6 flex-1">
                            <div>
                                <h1 className="text-lg text-white font-bold leading-tight mb-3">{selectedTask.title}</h1>
                                <div className="flex flex-wrap gap-2">
                                    <span className={`px-3 py-1 rounded border text-xs font-bold uppercase tracking-wider ${PRIORITY_STYLE[selectedTask.priority] || PRIORITY_STYLE.low}`}>
                                        {selectedTask.priority || "Normal"}
                                    </span>
                                    <span className="px-3 py-1 rounded border text-xs font-bold uppercase tracking-wider bg-[#1C1F26] border-[#2D3139]/50 text-[#8c947b]">
                                        {getColumn(selectedTask).replace("_", " ")}
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

                            <button
                                onClick={() => navigate(`/project_page/${selectedTask.project_id}`)}
                                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#aff82a]/10 border border-[#aff82a]/30 text-[#aff82a] text-sm font-semibold hover:bg-[#aff82a]/20 transition-colors"
                            >
                                <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                                Open in Project
                            </button>
                        </div>
                    </div>
                </div>
            )}
=======
                        {/* Metrics */}
                        <section className="grid grid-cols-1 md:grid-cols-4 gap-4 shrink-0">
                            <div className="bg-surface-container border border-outline-variant p-5 rounded-xl flex flex-col">
                                <p className="text-3xl font-bold text-white">{tasksLoading ? "—" : todoTasks.length}</p>
                                <p className="text-outline text-xs font-medium mt-1">To do</p>
                            </div>
                            <div className="bg-surface-container border border-outline-variant p-5 rounded-xl flex flex-col">
                                <p className="text-3xl font-bold text-primary-fixed">{tasksLoading ? "—" : inProgressTasks.length}</p>
                                <p className="text-outline text-xs font-medium mt-1">In progress</p>
                            </div>
                            <div className="bg-surface-container border border-outline-variant p-5 rounded-xl flex flex-col">
                                <p className="text-3xl font-bold text-green-400">{tasksLoading ? "—" : doneTasks.length}</p>
                                <p className="text-outline text-xs font-medium mt-1">Done</p>
                            </div>
                            <div className="bg-surface-container border border-outline-variant p-5 rounded-xl flex flex-col">
                                <p className="text-3xl font-bold text-red-400">{tasksLoading ? "—" : userTasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== "done").length}</p>
                                <p className="text-outline text-xs font-medium mt-1">Overdue</p>
                            </div>
                        </section>

                        {/* Kanban Board */}
                        <div className="flex-1 flex flex-col min-h-0">
                            <div className="flex items-center justify-between mb-4 shrink-0">
                                <h3 className="text-lg font-semibold text-white">Work Board</h3>
                                <span className="text-xs text-outline">
                                    {tasksLoading ? "Loading…" : `${openCount} open item${openCount !== 1 ? "s" : ""}`}
                                </span>
                            </div>

                            {tasksLoading ? (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 min-h-0">
                                    {[...Array(3)].map((_, i) => (
                                        <div key={i} className="bg-surface-container border border-outline-variant rounded-xl p-4 space-y-2 animate-pulse h-full">
                                            <div className="h-3 w-16 bg-surface-container-highest rounded mb-4" />
                                            <div className="h-16 w-full bg-surface-container-highest rounded-lg" />
                                            <div className="h-16 w-full bg-surface-container-highest rounded-lg" />
                                        </div>
                                    ))}
                                </div>
                            ) : openCount === 0 && doneTasks.length === 0 ? (
                                <div className="bg-surface-container border border-outline-variant rounded-xl flex flex-col items-center justify-center p-8 text-center flex-1">
                                    <div className="text-5xl mb-4">🎉</div>
                                    <h4 className="text-lg font-semibold text-white">You're all caught up</h4>
                                    <p className="text-outline text-sm max-w-xs mt-2">Nothing assigned to you is open right now.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 min-h-0 pb-8">
                                    {/* To-Do column */}
                                    <div className="bg-surface-container border border-outline-variant rounded-xl flex flex-col h-full overflow-hidden">
                                        <div className="p-4 border-b border-outline-variant flex items-center justify-between shrink-0">
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-outline" />
                                                <span className="font-semibold text-white text-sm uppercase tracking-wider">To‑Do</span>
                                            </div>
                                            <span className="text-sm text-outline font-bold">{todoTasks.length}</span>
                                        </div>
                                        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                                            {todoTasks.length === 0 ? (
                                                <p className="text-sm text-outline text-center py-6">No tasks here</p>
                                            ) : todoTasks.map(task => (
                                                <div key={task.id} className="bg-surface-container border border-outline-variant rounded-xl p-4 hover:border-outline transition-all cursor-default shadow-sm group">
                                                    <p className="text-base font-semibold text-white truncate">{task.title || task.name || "Untitled"}</p>
                                                    {task.description && <p className="text-xs text-outline mt-1 line-clamp-2">{task.description}</p>}
                                                    {task.due_date && (
                                                        <p className="text-xs mt-3 flex items-center gap-1.5 font-medium" style={{ color: new Date(task.due_date) < new Date() ? "#ef4444" : "#aff82a" }}>
                                                            <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                                                            {new Date(task.due_date).toLocaleDateString()}
                                                        </p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* In Progress column */}
                                    <div className="bg-surface-container border border-outline-variant rounded-xl flex flex-col h-full overflow-hidden">
                                        <div className="p-4 border-b border-outline-variant flex items-center justify-between shrink-0">
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-primary-fixed" />
                                                <span className="font-semibold text-white text-sm uppercase tracking-wider">In Progress</span>
                                            </div>
                                            <span className="text-sm text-outline font-bold">{inProgressTasks.length}</span>
                                        </div>
                                        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                                            {inProgressTasks.length === 0 ? (
                                                <p className="text-sm text-outline text-center py-6">No tasks here</p>
                                            ) : inProgressTasks.map(task => (
                                                <div key={task.id} className="bg-surface-container border border-outline-variant rounded-xl p-4 hover:border-outline transition-all cursor-default shadow-sm">
                                                    <p className="text-base font-semibold text-white truncate">{task.title || task.name || "Untitled"}</p>
                                                    {task.description && <p className="text-xs text-outline mt-1 line-clamp-2">{task.description}</p>}
                                                    {task.due_date && (
                                                        <p className="text-xs mt-3 flex items-center gap-1.5 font-medium" style={{ color: new Date(task.due_date) < new Date() ? "#ef4444" : "#aff82a" }}>
                                                            <span className="material-symbols-outlined text-[14px]">calendar_today</span>
                                                            {new Date(task.due_date).toLocaleDateString()}
                                                        </p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Done column */}
                                    <div className="bg-surface-container border border-outline-variant rounded-xl flex flex-col h-full overflow-hidden">
                                        <div className="p-4 border-b border-outline-variant flex items-center justify-between shrink-0">
                                            <div className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full bg-green-400" />
                                                <span className="font-semibold text-white text-sm uppercase tracking-wider">Done</span>
                                            </div>
                                            <span className="text-sm text-outline font-bold">{doneTasks.length}</span>
                                        </div>
                                        <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
                                            {doneTasks.length === 0 ? (
                                                <p className="text-sm text-outline text-center py-6">No tasks here</p>
                                            ) : doneTasks.map(task => (
                                                <div key={task.id} className="bg-surface-container border border-outline-variant rounded-xl p-4 opacity-70 hover:opacity-100 transition-all cursor-default shadow-sm">
                                                    <p className="text-base font-semibold text-white truncate line-through text-outline">{task.title || task.name || "Untitled"}</p>
                                                    {task.description && <p className="text-xs text-outline mt-1 line-clamp-2">{task.description}</p>}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                    </div>
                </main>
            </div>
            
            <style jsx>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background-color: #2D3139;
                    border-radius: 20px;
                }
                .custom-scrollbar:hover::-webkit-scrollbar-thumb {
                    background-color: #424934;
                }
            `}</style>
>>>>>>> 70696dd56f5c0ef51b07076c09163bf8c276f9da
        </div>
    )
}
