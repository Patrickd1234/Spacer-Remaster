import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "./supabase"
import Sidebar from "./partials/SidebarRouter"
import Header from "./partials/header"
import { useRole } from "./RoleContext"
import CreateTaskModal from "./partials/CreateTaskModal"

const PRIORITY_STYLE = {
    urgent: "bg-error/15 text-error border-error/30",
    high: "bg-warning/15 text-warning border-warning/30",
    medium: "bg-info/15 text-info border-info/30",
    low: "bg-[var(--primary-color)]/15 text-[var(--primary-color)] border-[var(--primary-color)]/30",
}

function TaskCard({ task, onClick }) {
    const isOverdue = task.status !== "done" && task.due_date && new Date(task.due_date) < new Date()

    return (
        <div
            onClick={onClick}
            className="bg-surface-container border border-outline-variant rounded-xl p-4 cursor-pointer hover:border-[var(--primary-color)]/50 transition-all duration-200 group flex flex-col gap-1.5"
        >
            <h4 className={`font-semibold text-sm leading-snug ${task.status === "done" ? "line-through text-on-surface-variant" : "text-on-surface"}`}>
                {task.title || task.name || "Untitled"}
            </h4>

            {(task.project_name || task.description) && (
                <p className="text-[11px] text-on-surface-variant truncate">
                    {task.project_name || task.description}
                </p>
            )}

            {task.due_date && (
                <div className={`flex items-center gap-1 text-[11px] mt-1 ${isOverdue ? "text-error" : "text-[var(--primary-color)]"}`}>
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
    const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false)

    // Standup Tab states
    const [activeTab, setActiveTab] = useState("board")
    const [standups, setStandups] = useState([])
    const [standupLoading, setStandupLoading] = useState(true)
    const [yesterdayText, setYesterdayText] = useState("")
    const [todayText, setTodayText] = useState("")
    const [blockersText, setBlockersText] = useState("")
    const [standupSaving, setStandupSaving] = useState(false)
    const [isLocalFallback, setIsLocalFallback] = useState(false)
    const [currentUserProfile, setCurrentUserProfile] = useState(null)
    const [orgId, setOrgId] = useState(null)


    useEffect(() => {
        const fetchTasks = async () => {
            setLoading(true)
            try {
                const { data: authData } = await supabase.auth.getUser()
                const userId = authData?.user?.id
                if (!userId) return

                const { data: profile } = await supabase
                    .from("users")
                    .select("id, name, email, organization_id")
                    .eq("id", userId)
                    .maybeSingle()

                if (profile) {
                    setCurrentUserProfile(profile)
                    setOrgId(profile.organization_id)
                }

                const currentOrgId = profile?.organization_id

                let query = supabase
                    .from("tasks")
                    .select("*, project:project_spaces(name)")

                if (currentOrgId) {
                    query = query.eq("organization_id", currentOrgId)
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

    const fetchStandups = async (currentOrgId) => {
        setStandupLoading(true)
        try {
            const { data, error } = await supabase
                .from("daily_standups")
                .select("*, user:users(name, email)")
                .eq("organization_id", currentOrgId)
                .order("standup_date", { ascending: false })
                .order("created_at", { ascending: false })

            if (error) {
                console.warn("daily_standups table fetch error, falling back to localStorage:", error)
                setIsLocalFallback(true)
                const local = localStorage.getItem("spacers_daily_standups")
                setStandups(local ? JSON.parse(local) : [])
            } else {
                setStandups(data || [])
                setIsLocalFallback(false)
            }
        } catch (err) {
            console.error("Error fetching standups:", err)
            setIsLocalFallback(true)
            const local = localStorage.getItem("spacers_daily_standups")
            setStandups(local ? JSON.parse(local) : [])
        } finally {
            setStandupLoading(false)
        }
    }

    useEffect(() => {
        if (orgId) {
            fetchStandups(orgId)
        } else {
            setIsLocalFallback(true)
            const local = localStorage.getItem("spacers_daily_standups")
            setStandups(local ? JSON.parse(local) : [])
            setStandupLoading(false)
        }
    }, [orgId, activeTab])

    const handleAddStandup = async (e) => {
        e.preventDefault()
        const yesterdayClean = yesterdayText.trim()
        const todayClean = todayText.trim()
        const blockersClean = blockersText.trim()
        
        if (!yesterdayClean && !todayClean && !blockersClean) {
            alert("Please fill out at least one section of your daily standup.")
            return
        }

        setStandupSaving(true)

        try {
            const { data: authData } = await supabase.auth.getUser()
            const uid = authData?.user?.id
            
            if (isLocalFallback) {
                const newRow = {
                    id: `std_${Date.now()}`,
                    organization_id: orgId || "local",
                    user_id: uid || "local_user",
                    standup_date: new Date().toISOString().split("T")[0],
                    yesterday_work: yesterdayClean,
                    today_work: todayClean,
                    blockers: blockersClean,
                    created_at: new Date().toISOString(),
                    user: {
                        name: currentUserProfile?.name || authData?.user?.email || "Local User",
                        email: currentUserProfile?.email || authData?.user?.email || "local@spacers.com"
                    }
                }
                const updated = [newRow, ...standups]
                localStorage.setItem("spacers_daily_standups", JSON.stringify(updated))
                setStandups(updated)
                setYesterdayText("")
                setTodayText("")
                setBlockersText("")
            } else {
                const { error } = await supabase
                    .from("daily_standups")
                    .insert({
                        organization_id: orgId,
                        user_id: uid,
                        yesterday_work: yesterdayClean,
                        today_work: todayClean,
                        blockers: blockersClean
                    })

                if (error) {
                    alert("Error saving standup: " + error.message)
                } else {
                    setYesterdayText("")
                    setTodayText("")
                    setBlockersText("")
                    await fetchStandups(orgId)
                }
            }
        } catch (err) {
            console.error("Error saving standup:", err)
        } finally {
            setStandupSaving(false)
        }
    }

    const todoTasks = tasks.filter(t => t.status === "todo")
    const inProgressTasks = tasks.filter(t => t.status === "in_progress")
    const doneTasks = tasks.filter(t => t.status === "done")
    const overdueTasks = tasks.filter(t => t.status !== "done" && t.due_date && new Date(t.due_date) < new Date())
    const openCount = todoTasks.length + inProgressTasks.length

    return (
        <div className="bg-background min-h-screen text-on-surface font-sans antialiased flex">
            <Sidebar onCollapsedChange={setSidebarCollapsed} />
            <div className="flex-1 flex flex-col min-w-0">
                <Header />
                <main className={`${sidebarCollapsed ? "ml-[72px]" : "ml-[260px]"} flex-1 flex flex-col pt-16 transition-all duration-300 ease-out`}>
                    <div className="p-8 space-y-8 max-w-[1400px] w-full mx-auto">

                        {/* Page Header */}
                        <section className="flex items-start justify-between">
                            <div className="flex flex-col">
                                <div className="flex items-center gap-4">
                                    <h1 className="text-2xl font-bold text-on-surface flex items-center gap-2">
                                        All Tasks
                                    </h1>
                                    <button
                                        onClick={() => setIsCreateTaskModalOpen(true)}
                                        className="px-3 py-1.5 btn-primary-accent rounded-lg text-xs font-semibold hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer flex items-center gap-1"
                                    >
                                        <span className="material-symbols-outlined text-[14px]">add</span>
                                        <span>Add Task</span>
                                    </button>
                                </div>
                                <p className="text-on-surface-variant text-sm mt-1">
                                    View all tasks across the organization.
                                </p>
                            </div>
                            <div className="flex items-center gap-2 text-on-surface-variant text-xs">
                                <span className="material-symbols-outlined text-[16px]">task</span>
                                <span>/</span>
                                <span className="text-on-surface font-medium">All Tasks</span>
                            </div>
                        </section>

                        {/* Tab Switcher */}
                        <div className="flex items-center gap-2 border-b border-outline-variant pb-1">
                            <button
                                onClick={() => setActiveTab("board")}
                                className={`px-4 py-2 text-sm font-semibold transition-all border-b-2 cursor-pointer ${
                                    activeTab === "board"
                                        ? "border-[var(--primary-color)] text-on-surface"
                                        : "border-transparent text-on-surface-variant hover:text-on-surface"
                                }`}
                            >
                                Kanban Board
                            </button>
                            <button
                                onClick={() => setActiveTab("standup")}
                                className={`px-4 py-2 text-sm font-semibold transition-all border-b-2 cursor-pointer ${
                                    activeTab === "standup"
                                        ? "border-[var(--primary-color)] text-on-surface"
                                        : "border-transparent text-on-surface-variant hover:text-on-surface"
                                }`}
                            >
                                Daily Standup Sheet
                            </button>
                        </div>

                        {activeTab === "board" && (
                            <>
                                {/* Metric Strip */}
                                {!loading && (
                                    <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div className="bg-surface-container border border-outline-variant rounded-xl p-5 flex flex-col">
                                            <p className="text-3xl font-bold text-on-surface">{todoTasks.length}</p>
                                            <p className="text-on-surface-variant text-xs font-medium mt-1">To do</p>
                                        </div>
                                        <div className="bg-surface-container border border-outline-variant rounded-xl p-5 flex flex-col">
                                            <p className="text-3xl font-bold text-[var(--primary-color)]">{inProgressTasks.length}</p>
                                            <p className="text-on-surface-variant text-xs font-medium mt-1">In progress</p>
                                        </div>
                                        <div className="bg-surface-container border border-outline-variant rounded-xl p-5 flex flex-col">
                                            <p className="text-3xl font-bold text-success">{doneTasks.length}</p>
                                            <p className="text-on-surface-variant text-xs font-medium mt-1">Done</p>
                                        </div>
                                        <div className="bg-surface-container border border-outline-variant rounded-xl p-5 flex flex-col">
                                            <p className="text-3xl font-bold text-error">{overdueTasks.length}</p>
                                            <p className="text-on-surface-variant text-xs font-medium mt-1">Overdue</p>
                                        </div>
                                    </section>
                                )}

                                {/* Work Board Section Header */}
                                <section className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-lg font-semibold text-on-surface">Work Board</h2>
                                        <span className="text-xs text-on-surface-variant font-medium">{openCount} Open Items</span>
                                    </div>

                                    {/* 3 Columns Kanban Board */}
                                    {loading ? (
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {[...Array(3)].map((_, i) => (
                                                <div key={i} className="bg-surface-container border border-outline-variant rounded-xl p-4 space-y-3 animate-pulse">
                                                    <div className="h-3 w-16 bg-surface-container-high rounded" />
                                                    <div className="h-24 w-full bg-surface-container-high rounded-xl" />
                                                    <div className="h-24 w-full bg-surface-container-high rounded-xl" />
                                                </div>
                                            ))}
                                        </div>
                                    ) : openCount === 0 && doneTasks.length === 0 ? (
                                        <div className="bg-surface-container border border-outline-variant rounded-xl flex flex-col items-center justify-center p-8 text-center flex-1">
                                            <div className="text-5xl mb-4">🎉</div>
                                            <h4 className="text-lg font-semibold text-on-surface">All caught up</h4>
                                            <p className="text-on-surface-variant text-sm max-w-xs mt-2">There are no open tasks in the organization right now.</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                                            {/* TO-DO Column */}
                                            <div className="bg-surface-container/50 border border-outline-variant/30 rounded-xl flex flex-col min-h-[400px]">
                                                <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/20">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-[#8c947b]" />
                                                        <span className="font-bold text-on-surface text-xs uppercase tracking-wider">TO-DO</span>
                                                    </div>
                                                    <span className="text-xs text-on-surface-variant font-bold">{todoTasks.length}</span>
                                                </div>
                                                <div className="flex flex-col gap-3 p-3 flex-1">
                                                    {todoTasks.length === 0 ? (
                                                        <p className="text-xs text-on-surface-variant text-center my-auto py-12">No tasks here</p>
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
                                            <div className="bg-surface-container/50 border border-outline-variant/30 rounded-xl flex flex-col min-h-[400px]">
                                                <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/20">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-[var(--primary-color)]" />
                                                        <span className="font-bold text-on-surface text-xs uppercase tracking-wider">IN PROGRESS</span>
                                                    </div>
                                                    <span className="text-xs text-on-surface-variant font-bold">{inProgressTasks.length}</span>
                                                </div>
                                                <div className="flex flex-col gap-3 p-3 flex-1">
                                                    {inProgressTasks.length === 0 ? (
                                                        <p className="text-xs text-on-surface-variant text-center my-auto py-12">No tasks here</p>
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
                                            <div className="bg-surface-container/50 border border-outline-variant/30 rounded-xl flex flex-col min-h-[400px]">
                                                <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant/20">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-success" />
                                                        <span className="font-bold text-on-surface text-xs uppercase tracking-wider">DONE</span>
                                                    </div>
                                                    <span className="text-xs text-on-surface-variant font-bold">{doneTasks.length}</span>
                                                </div>
                                                <div className="flex flex-col gap-3 p-3 flex-1">
                                                    {doneTasks.length === 0 ? (
                                                        <p className="text-xs text-on-surface-variant text-center my-auto py-12">No tasks here</p>
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
                            </>
                        )}

                        {activeTab === "standup" && (
                            <section className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h2 className="text-lg font-semibold text-on-surface">Daily Standup Tracker</h2>
                                        <p className="text-xs text-on-surface-variant mt-0.5">
                                            Log what you did yesterday, what you are working on today, and any blockers.
                                        </p>
                                    </div>
                                    {isLocalFallback && (
                                        <div className="flex items-center gap-1.5 px-3 py-1 bg-warning/10 text-warning border border-warning/20 rounded-lg text-xs font-semibold">
                                            <span className="material-symbols-outlined text-[14px]">warning</span>
                                            <span>Local storage mode</span>
                                        </div>
                                    )}
                                </div>

                                <div className="border border-outline-variant rounded-xl overflow-hidden bg-surface-container/40 shadow-xl">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse min-w-[900px] text-xs">
                                            <thead>
                                                {/* Column Labels (A, B, C, D, E, F) like Excel */}
                                                <tr className="bg-surface-container-low border-b border-outline-variant text-on-surface-variant text-center font-mono">
                                                    <th className="w-10 border-r border-outline-variant py-1 bg-background"></th>
                                                    <th className="border-r border-outline-variant py-1">A</th>
                                                    <th className="border-r border-outline-variant py-1">B</th>
                                                    <th className="border-r border-outline-variant py-1">C</th>
                                                    <th className="border-r border-outline-variant py-1">D</th>
                                                    <th className="border-r border-outline-variant py-1">E</th>
                                                    <th className="py-1">F</th>
                                                </tr>
                                                <tr className="bg-surface-container border-b border-outline-variant text-on-surface">
                                                    <th className="w-10 border-r border-outline-variant text-center font-mono text-on-surface-variant bg-surface-container-low">#</th>
                                                    <th className="px-4 py-3 border-r border-outline-variant font-semibold w-[180px]">User</th>
                                                    <th className="px-4 py-3 border-r border-outline-variant font-semibold w-[120px]">Date</th>
                                                    <th className="px-4 py-3 border-r border-outline-variant font-semibold">Yesterday's Work</th>
                                                    <th className="px-4 py-3 border-r border-outline-variant font-semibold">Today's Work</th>
                                                    <th className="px-4 py-3 border-r border-outline-variant font-semibold">Blockers</th>
                                                    <th className="px-4 py-3 font-semibold text-center w-[80px]">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {/* INLINE EXCEL ROW FOR NEW ENTRY */}
                                                <tr className="bg-surface-container border-b border-outline-variant focus-within:bg-surface-container-high transition-colors">
                                                    <td className="w-10 border-r border-outline-variant text-center font-mono text-[var(--primary-color)] bg-surface-container-low font-bold">+</td>
                                                    <td className="px-4 py-2 border-r border-outline-variant font-semibold text-on-surface">
                                                        <div className="truncate max-w-[170px]" title={currentUserProfile?.name || currentUserProfile?.email}>
                                                            {currentUserProfile?.name || currentUserProfile?.email || "Loading..."}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2 border-r border-outline-variant text-on-surface-variant font-mono">
                                                        {new Date().toLocaleDateString("en-GB")}
                                                    </td>
                                                    <td className="p-1 border-r border-outline-variant">
                                                        <input
                                                            type="text"
                                                            placeholder="What did you complete?"
                                                            className="w-full bg-transparent border-0 px-3 py-2 text-on-surface placeholder:text-on-surface-variant/40 focus:ring-1 focus:ring-[var(--primary-color)] focus:bg-background rounded focus:outline-none"
                                                            value={yesterdayText}
                                                            onChange={(e) => setYesterdayText(e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="p-1 border-r border-outline-variant">
                                                        <input
                                                            type="text"
                                                            placeholder="What are you doing today?"
                                                            className="w-full bg-transparent border-0 px-3 py-2 text-on-surface placeholder:text-on-surface-variant/40 focus:ring-1 focus:ring-[var(--primary-color)] focus:bg-background rounded focus:outline-none"
                                                            value={todayText}
                                                            onChange={(e) => setTodayText(e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="p-1 border-r border-outline-variant">
                                                        <input
                                                            type="text"
                                                            placeholder="Any blockers?"
                                                            className="w-full bg-transparent border-0 px-3 py-2 text-on-surface placeholder:text-on-surface-variant/40 focus:ring-1 focus:ring-[var(--primary-color)] focus:bg-background rounded focus:outline-none"
                                                            value={blockersText}
                                                            onChange={(e) => setBlockersText(e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="p-2 text-center">
                                                        <button
                                                            onClick={handleAddStandup}
                                                            disabled={standupSaving}
                                                            className="px-3 py-1.5 btn-primary-accent rounded-lg font-bold text-[10px] uppercase transition-all disabled:opacity-50 cursor-pointer w-full flex items-center justify-center gap-1"
                                                        >
                                                            {standupSaving ? (
                                                                <span className="material-symbols-outlined text-[12px] animate-spin">progress_activity</span>
                                                            ) : (
                                                                <>
                                                                    <span className="material-symbols-outlined text-[12px] font-bold">check</span>
                                                                    Save
                                                                </>
                                                            )}
                                                        </button>
                                                    </td>
                                                </tr>

                                                {/* DATA ROWS */}
                                                {standupLoading ? (
                                                    <tr>
                                                        <td colSpan="7" className="px-4 py-8 text-center text-on-surface-variant bg-surface-container/20">
                                                            <div className="flex items-center justify-center gap-2">
                                                                <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                                                                Loading logs...
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ) : standups.length === 0 ? (
                                                    <tr>
                                                        <td colSpan="7" className="px-4 py-8 text-center text-on-surface-variant bg-surface-container/20">
                                                            No daily standups logged yet. Add your standup above!
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    standups.map((row, index) => (
                                                        <tr key={row.id} className="hover:bg-surface-container/30 border-b border-outline-variant/40 transition-colors">
                                                            <td className="w-10 border-r border-outline-variant text-center font-mono text-on-surface-variant bg-surface-container-low">{index + 1}</td>
                                                            <td className="px-4 py-3 border-r border-outline-variant font-medium text-on-surface">
                                                                <div className="flex flex-col">
                                                                    <span className="font-bold">{row.user?.name || "Team Member"}</span>
                                                                    <span className="text-[10px] text-on-surface-variant">{row.user?.email || ""}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3 border-r border-outline-variant text-on-surface-variant font-mono">
                                                                {row.standup_date ? new Date(row.standup_date).toLocaleDateString("en-GB") : ""}
                                                            </td>
                                                            <td className="px-4 py-3 border-r border-outline-variant text-[#E0E2DB] whitespace-pre-wrap">
                                                                {row.yesterday_work || <span className="text-on-surface-variant/40 italic">None</span>}
                                                            </td>
                                                            <td className="px-4 py-3 border-r border-outline-variant text-[#E0E2DB] whitespace-pre-wrap">
                                                                {row.today_work || <span className="text-on-surface-variant/40 italic">None</span>}
                                                            </td>
                                                            <td className="px-4 py-3 border-r border-outline-variant text-[#E0E2DB] whitespace-pre-wrap">
                                                                {row.blockers ? (
                                                                    <span className="text-error font-medium">{row.blockers}</span>
                                                                ) : (
                                                                    <span className="text-success/80">No blockers</span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3 text-center text-on-surface-variant text-[10px] font-mono">
                                                                LOGGED
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </section>
                        )}
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
                    <div className="relative w-full max-w-md bg-surface-container shadow-2xl h-full overflow-y-auto flex flex-col border-l border-outline-variant">
                        <div className="flex items-center justify-between p-6 border-b border-outline-variant/30 bg-surface-container">
                            <h2 className="font-bold text-on-surface flex items-center gap-2 text-[15px]">
                                <span className="material-symbols-outlined text-[var(--primary-color)]">task</span>
                                Task Details
                            </h2>
                            <button
                                onClick={() => setSelectedTask(null)}
                                className="text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest w-8 h-8 rounded flex items-center justify-center transition-colors"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-6 space-y-6 flex-1">
                            <div>
                                <h1 className="text-lg text-on-surface font-bold leading-tight mb-3">{selectedTask.title || selectedTask.name || "Untitled"}</h1>
                                <div className="flex flex-wrap gap-2">
                                    {selectedTask.priority && (
                                        <span className={`px-3 py-1 rounded border text-xs font-bold uppercase tracking-wider ${PRIORITY_STYLE[selectedTask.priority] || PRIORITY_STYLE.low}`}>
                                            {selectedTask.priority}
                                        </span>
                                    )}
                                    <span className="px-3 py-1 rounded border text-xs font-bold uppercase tracking-wider bg-surface-container border-outline-variant/50 text-on-surface-variant">
                                        {selectedTask.status ? selectedTask.status.replace("_", " ") : "todo"}
                                    </span>
                                </div>
                            </div>
                            {selectedTask.description && (
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2">Description</p>
                                    <p className="text-sm text-on-surface whitespace-pre-wrap leading-relaxed bg-surface-container-low p-4 rounded-xl border border-outline-variant/20">
                                        {selectedTask.description}
                                    </p>
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/20">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[13px]">calendar_today</span>Deadline
                                    </p>
                                    <p className="text-sm text-on-surface font-semibold">
                                        {selectedTask.due_date
                                            ? new Date(selectedTask.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                                            : <span className="italic opacity-60">No deadline</span>}
                                    </p>
                                </div>
                                <div className="bg-surface-container-low p-4 rounded-xl border border-outline-variant/20">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-1 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[13px]">folder</span>Project
                                    </p>
                                    <p className="text-sm text-on-surface font-semibold truncate">
                                        {selectedTask.project_name || <span className="italic opacity-60">Unknown</span>}
                                    </p>
                                </div>
                            </div>
                            {selectedTask.project_id && (
                                <button
                                    onClick={() => navigate(`/project_page/${selectedTask.project_id}`)}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--primary-color)]/10 border border-[var(--primary-color)]/30 text-[var(--primary-color)] text-sm font-semibold hover:bg-[var(--primary-color)]/20 transition-colors cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                                    Open in Project
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {isCreateTaskModalOpen && (
                <CreateTaskModal
                    organizationId={orgId}
                    onClose={() => setIsCreateTaskModalOpen(false)}
                    onCreated={async (newTask) => {
                        const { data: projData } = await supabase
                            .from("project_spaces")
                            .select("name")
                            .eq("id", newTask.project_id)
                            .maybeSingle();
                        const updatedTask = {
                            ...newTask,
                            project_name: projData?.name || null
                        };
                        setTasks(prev => [updatedTask, ...prev]);
                    }}
                />
            )}

            {/* Floating Action Button */}
            <button
                type="button"
                onClick={() => setIsCreateTaskModalOpen(true)}
                className="fixed bottom-[96px] right-lg w-14 h-14 bg-primary-fixed-dim text-on-primary rounded-full shadow-[0_8px_32px_rgba(182,255,51,0.3)] flex items-center justify-center hover:scale-105 transition-transform active:scale-95 group z-30 cursor-pointer"
            >
                <span className="material-symbols-outlined text-[28px] font-bold">add</span>
                <span className="absolute right-full mr-md px-md py-sm bg-surface-container text-on-surface font-label-md text-label-md rounded shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap border border-outline-variant">
                    Add Task
                </span>
            </button>
        </div>
    )
}
