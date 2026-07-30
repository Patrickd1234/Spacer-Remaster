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

    const fetchUserTasks = async (uid, superAdmin, orgId) => {
        setTasksLoading(true)
        try {
            let query = supabase.from("tasks").select("*")
            
            if (orgId) {
                query = query.eq("organization_id", orgId)
            } else {
                query = query.eq("assignee_id", uid)
            }

            const { data, error } = await query

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

                await fetchUserTasks(uid, isSuperAdmin, profile?.organization_id)
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
            <Sidebar onCollapsedChange={setSidebarCollapsed} />
            <div className="flex-1 flex flex-col min-w-0">
                <Header />
                <main className={`${sidebarCollapsed ? "ml-[72px]" : "ml-[260px]"} flex-1 flex flex-col pt-16 transition-all duration-300 ease-out`}>
                    <div className="p-8 space-y-8 max-w-[1400px] w-full mx-auto h-full flex flex-col">
                        
                        {/* Header */}
                        <section className="flex items-start justify-between shrink-0">
                            <div>
                                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                                    All Tasks
                                </h1>
                                <p className="text-outline text-sm mt-1">
                                    View all tasks across the organization.
                                </p>
                            </div>
                            <div className="flex items-center gap-2 text-outline text-xs">
                                <span className="material-symbols-outlined text-[16px]">task</span>
                                <span>/</span>
                                <span className="text-white font-medium">All Tasks</span>
                            </div>
                        </section>

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
                                    <h4 className="text-lg font-semibold text-white">All caught up</h4>
                                    <p className="text-outline text-sm max-w-xs mt-2">There are no open tasks in the organization right now.</p>
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
        </div>
    )
}
