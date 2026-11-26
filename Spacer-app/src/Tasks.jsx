import { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { supabase, getSessionUser } from "./supabase"
import Sidebar from "./partials/SidebarRouter"
import Header from "./partials/header"
import { useRole } from "./RoleContext"
import CreateTaskModal from "./partials/CreateTaskModal"
import DepartmentTaskGroups from "./components/DepartmentTaskGroups"
import Select from "./components/Select"
import PlanetLoader from "./components/PlanetLoader"
import TaskKeyBar from "./tasks/TaskKeyBar"
import TaskComments from "./tasks/TaskComments"

const PRIORITY_STYLE = {
    urgent: "bg-red-500/15 text-red-400 border-red-500/30",
    high: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    medium: "bg-teal-500/15 text-teal-400 border-teal-500/30",
    low: "bg-[var(--primary-color)]/15 text-accent-ink border-accent-ink/30",
}

function TaskCard({ task, onClick }) {
    const isOverdue = task.status !== "done" && task.due_date && new Date(task.due_date) < new Date()

    return (
        <div
            onClick={onClick}
            className="bg-raised border border-line rounded-xl p-4 cursor-pointer hover:border-accent-ink/50 transition-all duration-200 group flex flex-col gap-1.5"
        >
            <h4 className={`font-semibold text-sm leading-snug ${task.status === "done" ? "line-through text-muted" : "text-white"}`}>
                {task.title || task.name || "Untitled"}
            </h4>

            {(task.project_name || task.description) && (
                <p className="text-[11px] text-muted truncate">
                    {task.project_name || task.description}
                </p>
            )}

            {task.due_date && (
                <div className={`flex items-center gap-1 text-[11px] mt-1 ${isOverdue ? "text-red-400" : "text-accent-ink"}`}>
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
    const { roleLoading, isSuperAdmin, activeDepartment, orgDepartmentId } = useRole()
    // Super admins see tasks grouped by department → project
    const [departments, setDepartments] = useState([])
    const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false)

    // Standup Tab states
    const [activeTab, setActiveTab] = useState("board")
    const [standups, setStandups] = useState([])
    const [standupsLoadedFor, setStandupsLoadedFor] = useState(null) // "<org id>:<department id>" of the list in `standups`
    const [yesterdayText, setYesterdayText] = useState("")
    const [todayText, setTodayText] = useState("")
    const [blockersText, setBlockersText] = useState("")
    const [standupSaving, setStandupSaving] = useState(false)
    const [standupLoadError, setStandupLoadError] = useState(false)
    const [currentUserProfile, setCurrentUserProfile] = useState(null)
    const [orgId, setOrgId] = useState(null)
    // Super admins pick which department's stand-ups to view
    const [standupDeptChoice, setStandupDeptChoice] = useState(null)


    useEffect(() => {
        const fetchTasks = async () => {
            setLoading(true)
            try {
                const authData = { user: await getSessionUser() }
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
                    .select("*, project:project_spaces(name, team_space_id)")

                if (currentOrgId) {
                    query = query.eq("organization_id", currentOrgId)
                } else {
                    query = query.eq("assignee_id", userId)
                }

                const [{ data, error }, departmentResult] = await Promise.all([
                    query.order("created_at", { ascending: false }),
                    isSuperAdmin && currentOrgId
                        ? supabase.from("team_spaces").select("id, name").eq("organization_id", currentOrgId).order("name")
                        : Promise.resolve({ data: [] }),
                ])

                if (departmentResult.error) console.error("Error fetching departments:", departmentResult.error)
                setDepartments(departmentResult.data || [])

                if (error) {
                    console.error("Error fetching tasks:", error)
                    return
                }

                // Show statuses as stored; they're only derived when subtasks are edited
                setTasks((data || []).map(t => ({
                    ...t,
                    project_name: t.project?.name || null,
                    project_team_space_id: t.project?.team_space_id ?? null,
                })))
            } catch (err) {
                console.error("Error fetching tasks:", err)
            } finally {
                setLoading(false)
            }
        }

        if (!roleLoading) {
            fetchTasks()
        }
    }, [roleLoading, isSuperAdmin])

    // Stand-ups are per department: members and admins see their active department
    // (chosen in the sidebar); super admins pick one, defaulting to the last opened
    const rememberedDeptId = departments.some(d => String(d.id) === String(orgDepartmentId)) ? orgDepartmentId : departments[0]?.id
    const standupDepartmentId = isSuperAdmin
        ? (standupDeptChoice ?? rememberedDeptId ?? null)
        : (activeDepartment?.team_space_id ?? null)
    const standupDepartmentName = isSuperAdmin
        ? departments.find(d => String(d.id) === String(standupDepartmentId))?.name
        : activeDepartment?.name
    // Which list should show; loading until that one has arrived
    const standupKey = orgId && standupDepartmentId ? `${orgId}:${standupDepartmentId}` : null
    const isStandupLoading = standupKey !== null && standupsLoadedFor !== standupKey
    const shownStandups = standupKey ? standups : []

    // Stand-ups are only ever saved to the database, so everyone in the
    // department sees them. (Before the table existed they could fall back to
    // this browser only; that fallback is gone.)
    const fetchStandups = async (currentOrgId, deptId) => {
        const { data, error } = await supabase
            .from("daily_standups")
            .select("*, user:users(name, email)")
            .eq("organization_id", currentOrgId)
            .eq("team_space_id", deptId)
            .order("standup_date", { ascending: false })
            .order("created_at", { ascending: false })
        if (error) console.error("Loading stand-ups failed:", error)
        setStandups(error ? [] : data || [])
        setStandupLoadError(Boolean(error))
        setStandupsLoadedFor(`${currentOrgId}:${deptId}`)
    }

    // Waits for the organization. It used to fall back to browser-only stand-ups
    // until the org loaded, so anything posted in that moment never reached the database.
    useEffect(() => {
        if (roleLoading || !orgId || !standupDepartmentId) return
        // Only sets state after the request returns (the rule can't see past the await)
        // eslint-disable-next-line react-hooks/set-state-in-effect
        fetchStandups(orgId, standupDepartmentId)
    }, [orgId, activeTab, standupDepartmentId, roleLoading])

    const handleAddStandup = async (e) => {
        e.preventDefault()
        const yesterdayClean = yesterdayText.trim()
        const todayClean = todayText.trim()
        const blockersClean = blockersText.trim()
        
        if (!yesterdayClean && !todayClean && !blockersClean) {
            alert("Please fill out at least one section of your daily standup.")
            return
        }
        if (!standupDepartmentId) {
            alert("Stand-ups are saved to a department. Join or select a department first.")
            return
        }

        setStandupSaving(true)

        try {
            const uid = (await getSessionUser())?.id
            const { error } = await supabase
                .from("daily_standups")
                .insert({
                    organization_id: orgId,
                    team_space_id: standupDepartmentId,
                    user_id: uid,
                    yesterday_work: yesterdayClean,
                    today_work: todayClean,
                    blockers: blockersClean
                })
            if (error) {
                console.error("Saving stand-up failed:", error)
                alert("Your stand-up wasn't saved. Please try again.")
                return
            }
            setYesterdayText("")
            setTodayText("")
            setBlockersText("")
            await fetchStandups(orgId, standupDepartmentId)
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
        <div className="bg-canvas min-h-screen text-white font-sans antialiased flex">
            <Sidebar onCollapsedChange={setSidebarCollapsed} />
            <div className="flex-1 flex flex-col min-w-0">
                <Header />
                <main className={`${sidebarCollapsed ? "md:ml-[72px]" : "md:ml-[260px]"} flex-1 flex flex-col transition-all duration-300 ease-out`}>
                    <div className="p-8 space-y-8 max-w-[1400px] w-full mx-auto">

                        {/* Page Header */}
                        <section className="flex items-start justify-between">
                            <div className="flex flex-col">
                                <div className="flex items-center gap-4">
                                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
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
                                <p className="text-muted text-sm mt-1">
                                    View all tasks across the organization.
                                </p>
                            </div>
                            <div className="flex items-center gap-2 text-muted text-xs">
                                <span className="material-symbols-outlined text-[16px]">task</span>
                                <span>/</span>
                                <span className="text-white font-medium">All Tasks</span>
                            </div>
                        </section>

                        {/* Tab Switcher */}
                        <div className="flex items-center gap-2 border-b border-line pb-1">
                            <button
                                onClick={() => setActiveTab("board")}
                                className={`px-4 py-2 text-sm font-semibold transition-all border-b-2 cursor-pointer ${
                                    activeTab === "board"
                                        ? "border-accent-ink text-white"
                                        : "border-transparent text-muted hover:text-white"
                                }`}
                            >
                                Orbit Board
                            </button>
                            <button
                                onClick={() => setActiveTab("standup")}
                                className={`px-4 py-2 text-sm font-semibold transition-all border-b-2 cursor-pointer ${
                                    activeTab === "standup"
                                        ? "border-accent-ink text-white"
                                        : "border-transparent text-muted hover:text-white"
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
                                        <div className="bg-raised border border-line rounded-xl p-5 flex flex-col">
                                            <p className="text-3xl font-bold text-white">{todoTasks.length}</p>
                                            <p className="text-muted text-xs font-medium mt-1">To do</p>
                                        </div>
                                        <div className="bg-raised border border-line rounded-xl p-5 flex flex-col">
                                            <p className="text-3xl font-bold text-accent-ink">{inProgressTasks.length}</p>
                                            <p className="text-muted text-xs font-medium mt-1">In progress</p>
                                        </div>
                                        <div className="bg-raised border border-line rounded-xl p-5 flex flex-col">
                                            <p className="text-3xl font-bold text-green-400">{doneTasks.length}</p>
                                            <p className="text-muted text-xs font-medium mt-1">Done</p>
                                        </div>
                                        <div className="bg-raised border border-line rounded-xl p-5 flex flex-col">
                                            <p className="text-3xl font-bold text-red-400">{overdueTasks.length}</p>
                                            <p className="text-muted text-xs font-medium mt-1">Overdue</p>
                                        </div>
                                    </section>
                                )}

                                {/* Orbit Board Section Header */}
                                <section className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-lg font-semibold text-white">Orbit Board</h2>
                                        <span className="text-xs text-muted font-medium">{openCount} Open Items</span>
                                    </div>

                                    {/* 3 Columns Orbit Board */}
                                    {loading ? (
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {[...Array(3)].map((_, i) => (
                                                <div key={i} className="bg-raised border border-line rounded-xl p-4 space-y-3 animate-pulse">
                                                    <div className="h-3 w-16 bg-surface2 rounded" />
                                                    <div className="h-24 w-full bg-surface2 rounded-xl" />
                                                    <div className="h-24 w-full bg-surface2 rounded-xl" />
                                                </div>
                                            ))}
                                        </div>
                                    ) : openCount === 0 && doneTasks.length === 0 ? (
                                        <div className="bg-raised border border-line rounded-xl flex flex-col items-center justify-center p-8 text-center flex-1">
                                            <div className="text-5xl mb-4">🎉</div>
                                            <h4 className="text-lg font-semibold text-white">All caught up</h4>
                                            <p className="text-muted text-sm max-w-xs mt-2">There are no open tasks in the organization right now.</p>
                                        </div>
                                    ) : isSuperAdmin ? (
                                        <DepartmentTaskGroups tasks={tasks} departments={departments} onSelectTask={setSelectedTask} />
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                                            {/* TO-DO Column */}
                                            <div className="orbit-column bg-raised/50 border border-line/30 rounded-xl flex flex-col min-h-[400px]">
                                                <div className="flex items-center justify-between px-4 py-3 border-b border-line/20">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-muted" />
                                                        <span className="font-bold text-white text-xs uppercase tracking-wider">TO-DO</span>
                                                    </div>
                                                    <span className="text-xs text-muted font-bold">{todoTasks.length}</span>
                                                </div>
                                                <div className="flex flex-col gap-3 p-3 flex-1">
                                                    {todoTasks.length === 0 ? (
                                                        <p className="text-xs text-muted text-center my-auto py-12">No tasks here</p>
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
                                            <div className="orbit-column bg-raised/50 border border-line/30 rounded-xl flex flex-col min-h-[400px]">
                                                <div className="flex items-center justify-between px-4 py-3 border-b border-line/20">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-[var(--primary-color)]" />
                                                        <span className="font-bold text-white text-xs uppercase tracking-wider">IN PROGRESS</span>
                                                    </div>
                                                    <span className="text-xs text-muted font-bold">{inProgressTasks.length}</span>
                                                </div>
                                                <div className="flex flex-col gap-3 p-3 flex-1">
                                                    {inProgressTasks.length === 0 ? (
                                                        <p className="text-xs text-muted text-center my-auto py-12">No tasks here</p>
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
                                            <div className="orbit-column bg-raised/50 border border-line/30 rounded-xl flex flex-col min-h-[400px]">
                                                <div className="flex items-center justify-between px-4 py-3 border-b border-line/20">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-green-400" />
                                                        <span className="font-bold text-white text-xs uppercase tracking-wider">DONE</span>
                                                    </div>
                                                    <span className="text-xs text-muted font-bold">{doneTasks.length}</span>
                                                </div>
                                                <div className="flex flex-col gap-3 p-3 flex-1">
                                                    {doneTasks.length === 0 ? (
                                                        <p className="text-xs text-muted text-center my-auto py-12">No tasks here</p>
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
                                        <h2 className="text-lg font-semibold text-white">
                                            Daily Standup Tracker{standupDepartmentName ? ` · ${standupDepartmentName}` : ""}
                                        </h2>
                                        <p className="text-xs text-muted mt-0.5">
                                            Log what you did yesterday, what you are working on today, and any blockers.
                                            {" "}Only {standupDepartmentName || "this department"}'s stand-ups are shown.
                                        </p>
                                    </div>
                                    {isSuperAdmin && departments.length > 0 && (
                                        <label className="flex items-center gap-2 text-xs text-muted">
                                            Department
                                            <Select
                                                value={standupDepartmentId ?? ""}
                                                onChange={(e) => setStandupDeptChoice(e.target.value)}
                                                className="bg-canvas border border-line rounded-lg px-3 py-1.5 text-white text-xs focus:outline-none focus:ring-1 focus:ring-accent-ink cursor-pointer"
                                            >
                                                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                                            </Select>
                                        </label>
                                    )}
                                    {standupLoadError && (
                                        <div role="alert" className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-xs font-semibold">
                                            <span className="material-symbols-outlined text-[14px]">error</span>
                                            <span>Couldn't load stand-ups.</span>
                                            <button type="button" onClick={() => fetchStandups(orgId, standupDepartmentId)} className="underline hover:no-underline cursor-pointer">Try again</button>
                                        </div>
                                    )}
                                </div>

                                <div className="border border-line rounded-xl overflow-hidden bg-raised/40 shadow-xl">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse min-w-[900px] text-xs">
                                            <thead>
                                                {/* Column Labels (A, B, C, D, E, F) like Excel */}
                                                <tr className="bg-field border-b border-line text-muted text-center font-mono">
                                                    <th className="w-10 border-r border-line py-1 bg-canvas"></th>
                                                    <th className="border-r border-line py-1">A</th>
                                                    <th className="border-r border-line py-1">B</th>
                                                    <th className="border-r border-line py-1">C</th>
                                                    <th className="border-r border-line py-1">D</th>
                                                    <th className="border-r border-line py-1">E</th>
                                                    <th className="py-1">F</th>
                                                </tr>
                                                <tr className="bg-raised border-b border-line text-white">
                                                    <th className="w-10 border-r border-line text-center font-mono text-muted bg-field">#</th>
                                                    <th className="px-4 py-3 border-r border-line font-semibold w-[180px]">User</th>
                                                    <th className="px-4 py-3 border-r border-line font-semibold w-[120px]">Date</th>
                                                    <th className="px-4 py-3 border-r border-line font-semibold">Yesterday's Work</th>
                                                    <th className="px-4 py-3 border-r border-line font-semibold">Today's Work</th>
                                                    <th className="px-4 py-3 border-r border-line font-semibold">Blockers</th>
                                                    <th className="px-4 py-3 font-semibold text-center w-[80px]">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {/* INLINE EXCEL ROW FOR NEW ENTRY */}
                                                <tr className="bg-surface1 border-b border-line focus-within:bg-surface1 transition-colors">
                                                    <td className="w-10 border-r border-line text-center font-mono text-accent-ink bg-field font-bold">+</td>
                                                    <td className="px-4 py-2 border-r border-line font-semibold text-white">
                                                        <div className="truncate max-w-[170px]" title={currentUserProfile?.name || currentUserProfile?.email}>
                                                            {currentUserProfile?.name || currentUserProfile?.email || "Loading..."}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2 border-r border-line text-muted font-mono">
                                                        {new Date().toLocaleDateString("en-GB")}
                                                    </td>
                                                    <td className="p-1 border-r border-line">
                                                        <input
                                                            type="text"
                                                            placeholder="What did you complete?"
                                                            className="w-full bg-transparent border-0 px-3 py-2 text-white placeholder-muted/40 focus:ring-1 focus:ring-accent-ink focus:bg-canvas rounded focus:outline-none"
                                                            value={yesterdayText}
                                                            onChange={(e) => setYesterdayText(e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="p-1 border-r border-line">
                                                        <input
                                                            type="text"
                                                            placeholder="What are you doing today?"
                                                            className="w-full bg-transparent border-0 px-3 py-2 text-white placeholder-muted/40 focus:ring-1 focus:ring-accent-ink focus:bg-canvas rounded focus:outline-none"
                                                            value={todayText}
                                                            onChange={(e) => setTodayText(e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="p-1 border-r border-line">
                                                        <input
                                                            type="text"
                                                            placeholder="Any blockers?"
                                                            className="w-full bg-transparent border-0 px-3 py-2 text-white placeholder-muted/40 focus:ring-1 focus:ring-accent-ink focus:bg-canvas rounded focus:outline-none"
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
                                                                <PlanetLoader className="text-[12px]" />
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
                                                {isStandupLoading ? (
                                                    <tr>
                                                        <td colSpan="7" className="px-4 py-8 text-center text-muted bg-raised/20">
                                                            <div className="flex items-center justify-center gap-2">
                                                                <PlanetLoader className="text-[16px]" />
                                                                Loading logs...
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ) : shownStandups.length === 0 ? (
                                                    <tr>
                                                        <td colSpan="7" className="px-4 py-8 text-center text-muted bg-raised/20">
                                                            {standupDepartmentId
                                                                ? `No stand-ups logged for ${standupDepartmentName || "this department"} yet. Add yours above!`
                                                                : "You're not in a department yet, so there's no stand-up sheet to show."}
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    shownStandups.map((row, index) => (
                                                        <tr key={row.id} className="hover:bg-surface1/30 border-b border-line/40 transition-colors">
                                                            <td className="w-10 border-r border-line text-center font-mono text-muted bg-field">{index + 1}</td>
                                                            <td className="px-4 py-3 border-r border-line font-medium text-white">
                                                                <div className="flex flex-col">
                                                                    <span className="font-bold">{row.user?.name || "Team Member"}</span>
                                                                    <span className="text-[10px] text-muted">{row.user?.email || ""}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3 border-r border-line text-muted font-mono">
                                                                {row.standup_date ? new Date(row.standup_date).toLocaleDateString("en-GB") : ""}
                                                            </td>
                                                            <td className="px-4 py-3 border-r border-line text-soft whitespace-pre-wrap">
                                                                {row.yesterday_work || <span className="text-muted/40 italic">None</span>}
                                                            </td>
                                                            <td className="px-4 py-3 border-r border-line text-soft whitespace-pre-wrap">
                                                                {row.today_work || <span className="text-muted/40 italic">None</span>}
                                                            </td>
                                                            <td className="px-4 py-3 border-r border-line text-soft whitespace-pre-wrap">
                                                                {row.blockers ? (
                                                                    <span className="text-red-400 font-medium">{row.blockers}</span>
                                                                ) : (
                                                                    <span className="text-green-400/80">No blockers</span>
                                                                )}
                                                            </td>
                                                            <td className="px-4 py-3 text-center text-muted text-[10px] font-mono">
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
                    <div className="relative w-full max-w-md bg-raised shadow-2xl h-full overflow-y-auto flex flex-col border-l border-line">
                        <div className="flex items-center justify-between p-6 border-b border-line/30 bg-surface1">
                            <h2 className="font-bold text-white flex items-center gap-2 text-[15px]">
                                <span className="material-symbols-outlined text-accent-ink">task</span>
                                Task Details
                            </h2>
                            <button
                                onClick={() => setSelectedTask(null)}
                                className="text-muted hover:text-white hover:bg-line w-8 h-8 rounded flex items-center justify-center transition-colors"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-6 space-y-6 flex-1">
                            <div>
                                <h1 className="text-lg text-white font-bold leading-tight mb-2">{selectedTask.title || selectedTask.name || "Untitled"}</h1>
                                <TaskKeyBar task={selectedTask} className="mb-3" />
                                <div className="flex flex-wrap gap-2">
                                    {selectedTask.priority && (
                                        <span className={`px-3 py-1 rounded border text-xs font-bold uppercase tracking-wider ${PRIORITY_STYLE[selectedTask.priority] || PRIORITY_STYLE.low}`}>
                                            {selectedTask.priority}
                                        </span>
                                    )}
                                    <span className="px-3 py-1 rounded border text-xs font-bold uppercase tracking-wider bg-surface1 border-line/50 text-muted">
                                        {selectedTask.status ? selectedTask.status.replace("_", " ") : "todo"}
                                    </span>
                                </div>
                            </div>
                            {selectedTask.description && (
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">Description</p>
                                    <p className="text-sm text-white whitespace-pre-wrap leading-relaxed bg-panel p-4 rounded-xl border border-line/20">
                                        {selectedTask.description}
                                    </p>
                                </div>
                            )}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-panel p-4 rounded-xl border border-line/20">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1 flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[13px]">calendar_today</span>Deadline
                                    </p>
                                    <p className="text-sm text-white font-semibold">
                                        {selectedTask.due_date
                                            ? new Date(selectedTask.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                                            : <span className="italic opacity-60">No deadline</span>}
                                    </p>
                                </div>
                                <div className="bg-panel p-4 rounded-xl border border-line/20">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-1 flex items-center gap-1">
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
                                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--primary-color)]/10 border border-accent-ink/30 text-accent-ink text-sm font-semibold hover:bg-[var(--primary-color)]/20 transition-colors cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[18px]">open_in_new</span>
                                    Open in Project
                                </button>
                            )}
                            <TaskComments key={selectedTask.id} taskId={selectedTask.id} />
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
                            .select("name, team_space_id")
                            .eq("id", newTask.project_id)
                            .maybeSingle();
                        const updatedTask = {
                            ...newTask,
                            project_name: projData?.name || null,
                            project_team_space_id: projData?.team_space_id ?? null,
                        };
                        setTasks(prev => [updatedTask, ...prev]);
                    }}
                />
            )}
        </div>
    )
}
