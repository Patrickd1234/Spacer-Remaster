import { useState, useEffect } from "react"
import { useParams } from "react-router-dom"
import { supabase } from "./supabase"
import Sidebar from "./partials/sidebar"
import Header from "./partials/header"
import CreateTaskModal from "./partials/CreateTaskModal"

function ProjectPage() {
    const { project_id } = useParams()
    const [project_name, setProjectName] = useState("Website Redesign")
    const [project_description, setProjectDescription] = useState("Corporate portal redesign featuring accessible dark mode theme, optimized rendering, and unified design tokens.")
    const [project_status, setProjectStatus] = useState("In Progress")
    const [project_due_date, setProjectDueDate] = useState("")
    const [project_tasks, setProjectTasks] = useState([])
    const [project_events, setProjectEvents] = useState([])
    const [activityLog, setActivityLog] = useState([])
    const [activeTab, setActiveTab] = useState("summary")
    const [organizationId, setOrganizationId] = useState("")
    const [selectedDateEvents, setSelectedDateEvents] = useState(null)
    const [sidebarActionMenuOpen, setSidebarActionMenuOpen] = useState(false)
    const [creatingInSidebar, setCreatingInSidebar] = useState(null)
    const [teamSpaceId, setTeamSpaceId] = useState("")
    const [isCreateTaskModalOpen, setIsCreateTaskModalOpen] = useState(false)
    const [createTaskInitialStatus, setCreateTaskInitialStatus] = useState("todo")
    const [dragOverColumn, setDragOverColumn] = useState(null)
    const [selectedTask, setSelectedTask] = useState(null)
    const [orgUsers, setOrgUsers] = useState([])
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [calendarMonth, setCalendarMonth] = useState(new Date())
    const [pendingOverdueUpdate, setPendingOverdueUpdate] = useState(null)
    const [newOverdueDate, setNewOverdueDate] = useState("")
    const [newOverdueTime, setNewOverdueTime] = useState("12:00")

    const updateTaskPriority = async (taskId, newPriority) => {
        const taskTitle = selectedTask?.title || ""
        setSelectedTask(prev => prev ? { ...prev, priority: newPriority } : null)
        setProjectTasks(prevTasks =>
            prevTasks.map(t =>
                String(t.id) === String(taskId) ? { ...t, priority: newPriority } : t
            )
        )
        const { error } = await supabase.from('tasks').update({ priority: newPriority }).eq('id', taskId)
        if (error) {
            console.error("Error updating priority in Supabase:", error)
        } else {
            const { data: userData } = await supabase.auth.getUser()
            const logEntry = {
                entity_type: "task",
                entity_id: taskId,
                actor_id: userData?.user?.id,
                action: "priority_changed",
                new_state: { project_id: project_id, title: taskTitle, priority: newPriority }
            }
            const { data: newLog } = await supabase.from("activity_log").insert(logEntry).select("*, actor:users(name, email)").single()
            if (newLog) setActivityLog(prev => [newLog, ...prev])
        }
    }

    const updateTaskStatus = async (taskId, newStatus) => {
        const task = project_tasks.find(t => String(t.id) === String(taskId))
        const isOverdue = task && task.due_date && new Date(task.due_date) < new Date()
        
        if (isOverdue && newStatus !== "overdue" && task.status !== "done") {
            setPendingOverdueUpdate({ taskId, newStatus })
            return
        }

        const taskTitle = task?.title || selectedTask?.title || ""
        if (selectedTask && String(selectedTask.id) === String(taskId)) {
            setSelectedTask(prev => prev ? { ...prev, status: newStatus } : null)
        }
        
        setProjectTasks(prevTasks =>
            prevTasks.map(t =>
                String(t.id) === String(taskId) ? { ...t, status: newStatus } : t
            )
        )
        const { error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId)
        if (error) {
            console.error("Error updating status in Supabase:", error)
        } else {
            const { data: userData } = await supabase.auth.getUser()
            const logEntry = {
                entity_type: "task",
                entity_id: taskId,
                actor_id: userData?.user?.id,
                action: "status_changed",
                new_state: { project_id: project_id, title: taskTitle, status: newStatus }
            }
            const { data: newLog } = await supabase.from("activity_log").insert(logEntry).select("*, actor:users(name, email)").single()
            if (newLog) setActivityLog(prev => [newLog, ...prev])
        }
    }

    const handleDragStart = (e, taskId) => {
        e.dataTransfer.setData("taskId", taskId)
    }

    const handleDrop = async (e, newStatus) => {
        e.preventDefault()
        const taskId = e.dataTransfer.getData("taskId")
        if (!taskId) return

        const task = project_tasks.find(t => String(t.id) === String(taskId))
        if (!task) return
        
        const isOverdue = task.due_date && new Date(task.due_date) < new Date()
        if (task.status === newStatus && !isOverdue) return

        updateTaskStatus(taskId, newStatus)
    }

    const confirmOverdueUpdate = async () => {
        if (!pendingOverdueUpdate || !newOverdueDate) return
        
        const { taskId, newStatus } = pendingOverdueUpdate
        const task = project_tasks.find(t => String(t.id) === String(taskId))
        if (!task) return
        
        const finalDateTime = new Date(`${newOverdueDate}T${newOverdueTime || "12:00"}`).toISOString()

        if (selectedTask && String(selectedTask.id) === String(taskId)) {
            setSelectedTask(prev => prev ? { ...prev, status: newStatus, due_date: finalDateTime } : null)
        }
        
        setProjectTasks(prevTasks =>
            prevTasks.map(t =>
                String(t.id) === String(taskId) ? { ...t, status: newStatus, due_date: finalDateTime } : t
            )
        )
        
        setPendingOverdueUpdate(null)
        setNewOverdueDate("")
        setNewOverdueTime("12:00")
        
        const { error } = await supabase
            .from('tasks')
            .update({ status: newStatus, due_date: finalDateTime })
            .eq('id', taskId)
            
        if (error) {
            console.error("Error updating overdue task:", error)
        } else {
            const { data: userData } = await supabase.auth.getUser()
            const logEntry = {
                entity_type: "task",
                entity_id: taskId,
                actor_id: userData?.user?.id,
                action: "status_changed",
                new_state: { project_id: project_id, title: task.title, status: newStatus, due_date: finalDateTime }
            }
            const { data: newLog } = await supabase.from("activity_log").insert(logEntry).select("*, actor:users(name, email)").single()
            if (newLog) setActivityLog(prev => [newLog, ...prev])
        }
    }

    const handleDeleteTask = async (taskId, taskTitle) => {
        if (!window.confirm("Are you sure you want to delete this task?")) return;

        setProjectTasks(prev => prev.filter(t => t.id !== taskId));

        const { error } = await supabase
            .from("tasks")
            .delete()
            .eq("id", taskId);

        if (error) {
            console.error("Error deleting task:", error);
        } else {
            const { data: userData } = await supabase.auth.getUser();
            const logEntry = {
                entity_type: "task",
                entity_id: taskId,
                actor_id: userData?.user?.id,
                action: "deleted",
                new_state: { project_id: project_id, title: taskTitle }
            };
            const { data: newLog } = await supabase.from("activity_log").insert(logEntry).select("*, actor:users(name, email)").single();
            if (newLog) setActivityLog(prev => [newLog, ...prev]);
        }
    }

    useEffect(() => {
        const fetchProject = async () => {
            if (!project_id) return
            const { data, error } = await supabase
                .from("project_spaces")
                .select("*, team_spaces(organization_id)")
                .eq("id", project_id)
            if (error) {
                console.error("Error fetching project:", error)
            } else if (data && data.length > 0) {
                if (data[0].name) setProjectName(data[0].name)
                if (data[0].description) setProjectDescription(data[0].description)
                if (data[0].status) setProjectStatus(data[0].status)
                if (data[0].due_date) setProjectDueDate(data[0].due_date)
                if (data[0].team_spaces?.organization_id) {
                    setOrganizationId(data[0].team_spaces.organization_id)
                }
                if (data[0].team_space_id) {
                    setTeamSpaceId(data[0].team_space_id)
                    fetchTeamMembers(data[0].team_space_id)
                }
            }
        }

        const fetchTeamMembers = async (tsId) => {
            if (!tsId) return
            const { data, error } = await supabase
                .from("memberships")
                .select("role, user:users(id, name, email)")
                .eq("team_space_id", tsId)
            if (error) {
                console.error("Error fetching team members:", error)
            } else {
                const members = (data || []).map(m => ({
                    id: m.user?.id,
                    name: m.user?.name,
                    email: m.user?.email,
                    role: m.role
                })).filter(m => m.id)
                setOrgUsers(members)
            }
        }

        const fetchTasks = async () => {
            if (!project_id) return
            const { data, error } = await supabase
                .from("tasks")
                .select("*")
                .eq("project_id", project_id)
                .order("created_at", { ascending: false })
            if (error) {
                console.error("Error fetching tasks:", error)
            } else {
                setProjectTasks(data || [])
            }
        }

        const fetchEvents = async () => {
            if (!project_id) return
            const { data, error } = await supabase
                .from("calendar_events")
                .select("*")
                .eq("project_id", project_id)
            if (error) {
                console.error("Error fetching events:", error)
            } else {
                setProjectEvents(data || [])
            }
        }

        const fetchActivity = async () => {
            if (!project_id) return
            const { data, error } = await supabase
                .from("activity_log")
                .select("*, actor:users(name, email)")
                .eq("new_state->>project_id", project_id)
                .order("created_at", { ascending: false })
                .limit(20)

            if (error) {
                console.error("Error fetching activity:", error)
            } else {
                setActivityLog(data || [])
            }
        }

        fetchProject()
        fetchTasks()
        fetchEvents()
        fetchActivity()
    }, [project_id])

    // Calendar Calculations
    const startOfCurrentMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1)
    const endOfCurrentMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0)
    const startDayOfWeek = startOfCurrentMonth.getDay()
    const daysInMonth = endOfCurrentMonth.getDate()

    const calendarDays = []
    for (let i = 0; i < startDayOfWeek; i++) {
        calendarDays.push(null)
    }
    for (let i = 1; i <= daysInMonth; i++) {
        calendarDays.push(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), i))
    }

    const formatYMD = (date) => {
        if (!date) return ""
        const y = date.getFullYear()
        const m = String(date.getMonth() + 1).padStart(2, '0')
        const d = String(date.getDate()).padStart(2, '0')
        return `${y}-${m}-${d}`
    }

    const handlePrevMonth = () => {
        setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1))
    }

    const handleNextMonth = () => {
        setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1))
    }

    return (
        <div className="bg-[#0F1115] min-h-screen text-white font-sans antialiased">
            <Sidebar onCollapsedChange={setSidebarCollapsed} />
            <Header />
            <main className={`${sidebarCollapsed ? "ml-[72px]" : "ml-[260px]"} flex-1 flex flex-col pt-16 p-8 transition-all duration-300 ease-out`}>
                {/* Project Header */}
                <div className="mb-8">
                    <div className="flex items-center justify-between gap-6">
                        <div>
                            <h2 className="text-3xl font-bold text-white tracking-tight">{project_name}</h2>
                            <p className="text-[#8c947b] text-sm mt-1 max-w-2xl">{project_description}</p>
                        </div>
                        <button
                            onClick={() => { setCreateTaskInitialStatus("todo"); setIsCreateTaskModalOpen(true); }}
                            className="bg-[#5b644d] hover:bg-[#6c765c] text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-all shadow-sm shrink-0 cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[18px]">add</span>
                            New Task
                        </button>
                    </div>

                    {/* Sub-Tabs Navigation */}
                    <div className="flex items-center gap-2 mt-6 border-b border-[#2D3139] pb-3">
                        {[
                            { id: "summary", label: "Summary", icon: "dashboard" },
                            { id: "tasks", label: "Tasks", icon: "view_kanban" },
                            { id: "calendar", label: "Calendar", icon: "calendar_month" },
                            { id: "files", label: "Public Files", icon: "folder" },
                            { id: "members", label: "Members", icon: "group" }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                                    activeTab === tab.id
                                        ? "bg-[#191c21] text-[#aff82a] border border-[#2D3139]"
                                        : "text-[#8c947b] hover:text-white hover:bg-[#191c21]/50"
                                }`}
                            >
                                <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Tab Contents */}
                <div>
                    {/* 1. Summary Tab */}
                    {activeTab === "summary" && (
                        <div className="space-y-6">
                            <div className="bg-[#191c21] border border-[#2D3139] p-6 rounded-xl">
                                <h3 className="text-lg font-semibold text-white mb-6">Task Overview</h3>
                                <div className="space-y-4 max-w-3xl">
                                    {[
                                        { label: 'Backlog', count: project_tasks.filter(t => t.status === 'todo').length, color: 'text-white', barColor: 'bg-[#8c947b]' },
                                        { label: 'Doing', count: project_tasks.filter(t => t.status === 'in_progress').length, color: 'text-[#aff82a]', barColor: 'bg-[#aff82a]' },
                                        { label: 'Done', count: project_tasks.filter(t => t.status === 'done').length, color: 'text-green-400', barColor: 'bg-green-400' },
                                        { label: 'Overdue', count: project_tasks.filter(t => t.status !== 'done' && t.due_date && new Date(t.due_date) < new Date()).length, color: 'text-red-400', barColor: 'bg-red-400' },
                                    ].map(stat => {
                                        const total = Math.max(1, project_tasks.length);
                                        const percent = (stat.count / total) * 100;
                                        return (
                                            <div key={stat.label} className="flex items-center gap-6">
                                                <span className={`w-24 text-right font-medium text-xs ${stat.color}`}>{stat.label}</span>
                                                <div className="flex-1 h-3 bg-[#252a33] rounded-full overflow-hidden">
                                                    <div className={`h-full ${stat.barColor} rounded-full transition-all duration-500`} style={{ width: `${percent}%` }}></div>
                                                </div>
                                                <span className="w-12 font-semibold text-white text-xs">{stat.count}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="bg-[#191c21] border border-[#2D3139] p-6 rounded-xl">
                                <h3 className="text-lg font-semibold text-white mb-4">Recent Activity</h3>
                                <div className="space-y-4 max-h-[400px] overflow-y-auto">
                                    {activityLog.length === 0 ? (
                                        <p className="text-[#8c947b] text-xs">No recent activity log found for this project.</p>
                                    ) : (
                                        activityLog.map(activity => (
                                            <div key={activity.id} className="flex gap-3 items-center text-xs text-[#8c947b]">
                                                <div className="w-6 h-6 rounded-full bg-[#252a33] border border-[#343b47] flex items-center justify-center font-bold text-[10px] text-white">
                                                    {activity.actor?.name?.charAt(0) || '?'}
                                                </div>
                                                <div className="flex-1">
                                                    <span className="text-white font-medium">{activity.actor?.name || 'User'}</span>
                                                    {' '}
                                                    {activity.action === "created" && `created task "${activity.new_state?.title}"`}
                                                    {activity.action === "deleted" && `deleted task "${activity.new_state?.title}"`}
                                                    {activity.action === "status_changed" && `moved task "${activity.new_state?.title}" to ${activity.new_state?.status}`}
                                                </div>
                                                <span className="text-[10px]">{new Date(activity.created_at).toLocaleTimeString()}</span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 2. Tasks Tab — Kanban Board */}
                    {activeTab === "tasks" && (
                        <div className="flex gap-4 overflow-x-auto pb-6" style={{ minHeight: 'calc(100vh - 280px)' }}>
                            {[
                                { key: "todo", label: "Backlog", dotColor: "bg-gray-400" },
                                { key: "in_progress", label: "Doing", dotColor: "bg-[#aff82a]" },
                                { key: "done", label: "Done", dotColor: "bg-green-400" },
                                { key: "overdue", label: "Overdue", dotColor: "bg-red-400" },
                            ].map(column => {
                                const columnTasks = project_tasks.filter(t => {
                                    if (t.status === "done") return column.key === "done";
                                    const isOverdue = t.due_date && new Date(t.due_date) < new Date();
                                    if (isOverdue) return column.key === "overdue";
                                    return column.key === t.status;
                                });
                                return (
                                    <div
                                        key={column.key}
                                        className={`flex-shrink-0 w-[300px] flex flex-col rounded-xl border border-[#2D3139] bg-[#191c21] p-4 transition-all ${
                                            dragOverColumn === column.key ? 'border-[#aff82a]' : ''
                                        }`}
                                        onDragOver={(e) => { if (column.key !== 'overdue') { e.preventDefault(); setDragOverColumn(column.key); } }}
                                        onDragLeave={() => setDragOverColumn(null)}
                                        onDrop={(e) => { if (column.key !== 'overdue') { handleDrop(e, column.key); } setDragOverColumn(null); }}
                                    >
                                        <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#2D3139]">
                                            <div className="flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${column.dotColor}`}></span>
                                                <span className="font-semibold text-white text-xs uppercase tracking-wider">{column.label}</span>
                                            </div>
                                            <span className="text-xs text-[#8c947b] font-bold">{columnTasks.length}</span>
                                        </div>

                                        <div className="flex-1 overflow-y-auto space-y-3 min-h-[200px]">
                                            {columnTasks.map(task => (
                                                <div
                                                    key={task.id}
                                                    draggable
                                                    onDragStart={(e) => handleDragStart(e, task.id)}
                                                    onClick={() => setSelectedTask(task)}
                                                    className="bg-[#1C1F26] border border-[#2D3139] rounded-lg p-3 cursor-pointer hover:border-[#424934] transition-all group"
                                                >
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="text-[10px] font-bold text-[#8c947b] uppercase">{project_name}</span>
                                                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#252a33] text-[#aff82a] uppercase font-bold">
                                                            {task.priority || 'Normal'}
                                                        </span>
                                                    </div>
                                                    <h4 className="font-semibold text-white text-sm mb-1">{task.title}</h4>
                                                    {task.description && (
                                                        <p className="text-[11px] text-[#8c947b] line-clamp-2 mb-2">{task.description}</p>
                                                    )}
                                                    <div className="flex items-center justify-between pt-2 border-t border-[#2D3139] text-[10px] text-[#8c947b]">
                                                        {task.due_date ? (
                                                            <span>{new Date(task.due_date).toLocaleDateString()}</span>
                                                        ) : <span>No date</span>}
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteTask(task.id, task.title); }}
                                                            className="hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        >
                                                            <span className="material-symbols-outlined text-[14px]">delete</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* 3. Calendar Tab — Interactive Project Calendar */}
                    {activeTab === "calendar" && (
                        <div className="bg-[#191c21] border border-[#2D3139] rounded-xl p-6 flex flex-col min-h-[500px]">
                            <div className="flex items-center justify-between pb-4 border-b border-[#2D3139] mb-4">
                                <h3 className="text-lg font-bold text-white capitalize">
                                    {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                                </h3>
                                <div className="flex items-center gap-2">
                                    <button onClick={handlePrevMonth} className="w-8 h-8 rounded-lg bg-[#181a20] hover:bg-[#2D3139] text-[#8c947b] hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-[#2D3139]">
                                        <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                                    </button>
                                    <button onClick={handleNextMonth} className="w-8 h-8 rounded-lg bg-[#181a20] hover:bg-[#2D3139] text-[#8c947b] hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-[#2D3139]">
                                        <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-7 gap-px bg-[#2D3139] rounded-lg border border-[#2D3139] overflow-hidden">
                                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                                    <div key={day} className="bg-[#181a20] p-3 text-center text-xs font-bold text-[#8c947b] uppercase tracking-wider">
                                        {day}
                                    </div>
                                ))}
                                {calendarDays.map((date, idx) => {
                                    const dateString = formatYMD(date);
                                    const dayTasks = date ? project_tasks.filter(t => t.due_date && t.due_date.substring(0, 10) === dateString) : [];
                                    const dayEvents = date ? project_events.filter(e => e.event_date && e.event_date.substring(0, 10) === dateString) : [];
                                    const isToday = dateString === formatYMD(new Date());

                                    return (
                                        <div
                                            key={idx}
                                            onClick={() => date && setSelectedDateEvents(date)}
                                            className={`min-h-[110px] p-2.5 transition-colors cursor-pointer ${date ? 'bg-[#191c21] hover:bg-[#1C1F26]' : 'bg-[#111318]'}`}
                                        >
                                            {date && (
                                                <>
                                                    <div className={`text-right mb-1.5 flex items-center justify-end gap-1 text-xs ${isToday ? 'font-bold' : 'text-[#8c947b]'}`}>
                                                        {dayEvents.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>}
                                                        {dayTasks.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-[#aff82a]"></span>}
                                                        <span className={isToday ? 'inline-flex items-center justify-center w-5 h-5 bg-[#5b644d] text-white font-bold rounded-full text-[10px]' : ''}>
                                                            {date.getDate()}
                                                        </span>
                                                    </div>
                                                    <div className="space-y-1">
                                                        {dayEvents.map(event => (
                                                            <div key={`evt-${event.id}`} className="px-2 py-0.5 text-[10px] font-medium rounded truncate bg-purple-500/10 text-purple-400 border border-purple-500/30">
                                                                {event.title}
                                                            </div>
                                                        ))}
                                                        {dayTasks.map(task => (
                                                            <div key={`tsk-${task.id}`} onClick={(e) => { e.stopPropagation(); setSelectedTask(task); }} className={`px-2 py-0.5 text-[10px] font-medium rounded truncate border ${
                                                                task.status === 'done' ? 'bg-green-500/10 text-green-400 border-green-500/30' :
                                                                'bg-[#aff82a]/10 text-[#aff82a] border-[#aff82a]/30'
                                                            }`}>
                                                                {task.title}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* 4. Public Files Tab */}
                    {activeTab === "files" && (
                        <div className="bg-[#191c21] border border-[#2D3139] rounded-xl p-6 space-y-4">
                            <div className="flex items-center justify-between pb-4 border-b border-[#2D3139]">
                                <h3 className="text-lg font-semibold text-white">Public Files & Assets</h3>
                                <button className="px-3 py-1.5 bg-[#5b644d] text-white rounded-lg text-xs font-medium hover:bg-[#6c765c]">
                                    Upload File
                                </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-[#1C1F26] border border-[#2D3139] p-4 rounded-xl flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className="material-symbols-outlined text-red-400 text-2xl">picture_as_pdf</span>
                                        <div>
                                            <p className="text-sm font-semibold text-white">Project_Specification_v2.pdf</p>
                                            <p className="text-xs text-[#8c947b]">Updated yesterday • 4.2 MB</p>
                                        </div>
                                    </div>
                                    <button className="text-[#8c947b] hover:text-white">
                                        <span className="material-symbols-outlined text-[20px]">download</span>
                                    </button>
                                </div>
                                <div className="bg-[#1C1F26] border border-[#2D3139] p-4 rounded-xl flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <span className="material-symbols-outlined text-[#aff82a] text-2xl">image</span>
                                        <div>
                                            <p className="text-sm font-semibold text-white">Brand_Design_Tokens.png</p>
                                            <p className="text-xs text-[#8c947b]">Updated 3 days ago • 1.8 MB</p>
                                        </div>
                                    </div>
                                    <button className="text-[#8c947b] hover:text-white">
                                        <span className="material-symbols-outlined text-[20px]">download</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* 5. Members Tab */}
                    {activeTab === "members" && (
                        <div className="bg-[#191c21] border border-[#2D3139] rounded-xl p-6 space-y-4">
                            <div className="flex items-center justify-between pb-4 border-b border-[#2D3139]">
                                <div>
                                    <h3 className="text-lg font-semibold text-white">Team Space Members</h3>
                                    <p className="text-xs text-[#8c947b] mt-0.5">Members belonging to this project's team space.</p>
                                </div>
                                <button className="px-3 py-1.5 bg-[#5b644d] hover:bg-[#6c765c] text-white rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer">
                                    <span className="material-symbols-outlined text-[16px]">person_add</span>
                                    Add Member
                                </button>
                            </div>
                            {orgUsers.length === 0 ? (
                                <p className="text-xs text-[#8c947b]">No members found in this team space.</p>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {orgUsers.map(user => (
                                        <div key={user.id} className="bg-[#1C1F26] border border-[#2D3139] p-4 rounded-xl flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-[#252a33] text-white flex items-center justify-center font-bold text-sm border border-[#343b47] shrink-0">
                                                {(user.name || user.email || "?").charAt(0).toUpperCase()}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-sm font-semibold text-white truncate">{user.name || "Member"}</p>
                                                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#252a33] text-[#aff82a]">
                                                        {user.role || "Member"}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-[#8c947b] truncate mt-0.5">{user.email || ""}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>

            {/* Date Schedule Side Drawer */}
            {selectedDateEvents && (
                <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-lg bg-[#191c21] border-l border-[#2D3139] shadow-2xl h-full flex flex-col text-white">
                        <div className="flex items-center justify-between p-6 border-b border-[#2D3139] bg-[#181a20] shrink-0">
                            <div>
                                <h2 className="text-lg font-bold text-white">
                                    Schedule for {selectedDateEvents.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
                                </h2>
                                <p className="text-xs text-[#8c947b] mt-0.5">Tasks and events scheduled for this day</p>
                            </div>
                            <div className="flex items-center gap-2 relative">
                                <button 
                                    className="text-[#8c947b] hover:text-white bg-[#1e2025] hover:bg-[#2D3139] w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer border border-[#2D3139]" 
                                    onClick={() => setSidebarActionMenuOpen(!sidebarActionMenuOpen)}
                                    title="Add Item"
                                >
                                    <span className="material-symbols-outlined text-[18px]">add</span>
                                </button>
                                {sidebarActionMenuOpen && (
                                    <>
                                        <div className="fixed inset-0 z-40" onClick={() => setSidebarActionMenuOpen(false)}></div>
                                        <div className="absolute right-0 top-full mt-1 w-44 bg-[#1c1f26] border border-[#2D3139] rounded-xl shadow-2xl z-50 overflow-hidden">
                                            <button 
                                                className="w-full text-left px-4 py-2.5 hover:bg-[#2D3139] transition-colors flex items-center gap-2 text-xs font-medium text-white cursor-pointer"
                                                onClick={() => { setSidebarActionMenuOpen(false); setCreatingInSidebar('task'); }}
                                            >
                                                <span className="material-symbols-outlined text-[16px] text-[#aff82a]">task</span> Add Task
                                            </button>
                                            <button 
                                                className="w-full text-left px-4 py-2.5 hover:bg-[#2D3139] transition-colors flex items-center gap-2 text-xs font-medium text-white cursor-pointer"
                                                onClick={() => { setSidebarActionMenuOpen(false); setCreatingInSidebar('meeting'); }}
                                            >
                                                <span className="material-symbols-outlined text-[16px] text-purple-400">event</span> Add Event
                                            </button>
                                        </div>
                                    </>
                                )}
                                <button className="text-[#8c947b] hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#2D3139] transition-colors cursor-pointer" onClick={() => { setSelectedDateEvents(null); setCreatingInSidebar(null); setSidebarActionMenuOpen(false); }}>
                                    <span className="material-symbols-outlined text-[20px]">close</span>
                                </button>
                            </div>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 space-y-4">
                            {creatingInSidebar === 'task' ? (
                                <div className="h-full flex flex-col">
                                    <button onClick={() => setCreatingInSidebar(null)} className="mb-4 text-xs font-medium text-[#8c947b] hover:text-white flex items-center gap-1 cursor-pointer w-fit">
                                        <span className="material-symbols-outlined text-[14px]">arrow_back</span> Back to day schedule
                                    </button>
                                    <CreateTaskModal
                                        projectId={project_id}
                                        organizationId={organizationId}
                                        teamSpaceId={teamSpaceId}
                                        initialStatus="todo"
                                        initialDate={selectedDateEvents ? `${selectedDateEvents.getFullYear()}-${String(selectedDateEvents.getMonth()+1).padStart(2,'0')}-${String(selectedDateEvents.getDate()).padStart(2,'0')}T09:00` : ""}
                                        isInline={true}
                                        onClose={() => setCreatingInSidebar(null)}
                                        onCreated={(newTask) => {
                                            setProjectTasks(prev => [newTask, ...prev])
                                            setCreatingInSidebar(null)
                                        }}
                                    />
                                </div>
                            ) : creatingInSidebar === 'meeting' ? (
                                <div className="h-full flex flex-col">
                                    <button onClick={() => setCreatingInSidebar(null)} className="mb-4 text-xs font-medium text-[#8c947b] hover:text-white flex items-center gap-1 cursor-pointer w-fit">
                                        <span className="material-symbols-outlined text-[14px]">arrow_back</span> Back to day schedule
                                    </button>
                                    <div className="flex-1 flex items-center justify-center bg-[#1C1F26] rounded-xl border border-[#2D3139] border-dashed p-6 text-center">
                                        <p className="text-[#8c947b] text-xs">Event creation added for this date.</p>
                                    </div>
                                </div>
                            ) : (() => {
                                const dateString = formatYMD(selectedDateEvents);
                                const dayTasks = project_tasks.filter(t => t.due_date && t.due_date.substring(0, 10) === dateString);
                                const dayEvents = project_events.filter(e => e.event_date && e.event_date.substring(0, 10) === dateString);
                                
                                const combined = [
                                    ...dayEvents.map(e => ({ ...e, isEvent: true, sortTime: new Date(e.event_date).getTime(), originalDateStr: e.event_date })),
                                    ...dayTasks.map(t => ({ ...t, isTask: true, sortTime: new Date(t.due_date).getTime(), originalDateStr: t.due_date }))
                                ].sort((a, b) => a.sortTime - b.sortTime);

                                if (combined.length === 0) {
                                    return (
                                        <div className="flex flex-col items-center justify-center py-12 text-center text-[#8c947b] space-y-2">
                                            <span className="material-symbols-outlined text-4xl">calendar_today</span>
                                            <p className="text-sm font-medium text-white">Nothing scheduled for this day</p>
                                            <p className="text-xs">Click the "+" button above to add a task or meeting.</p>
                                        </div>
                                    );
                                }

                                return combined.map(item => (
                                    <div 
                                        key={(item.isEvent ? 'evt-' : 'tsk-') + item.id} 
                                        onClick={() => {
                                            if (!item.isEvent) {
                                                setSelectedTask(item);
                                            }
                                        }}
                                        className={`bg-[#1C1F26] p-4 rounded-xl border border-[#2D3139] flex flex-col gap-2 ${!item.isEvent ? 'cursor-pointer hover:border-[#424934] transition-all' : ''}`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded flex items-center gap-1 ${
                                                item.isEvent ? 'bg-purple-500/20 text-purple-400' : 'bg-[#aff82a]/20 text-[#aff82a]'
                                            }`}>
                                                <span className="material-symbols-outlined text-[12px]">{item.isEvent ? 'event' : 'task'}</span>
                                                {item.isEvent ? 'Event' : 'Task'}
                                            </span>
                                            <span className="text-xs text-[#8c947b] font-medium">
                                                {(item.originalDateStr && (item.originalDateStr.includes('T') || item.originalDateStr.includes(' '))) 
                                                    ? new Date(item.sortTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                    : 'All Day'}
                                            </span>
                                        </div>
                                        <h3 className="text-sm font-bold text-white mt-1">{item.title}</h3>
                                        {item.description && <p className="text-xs text-[#8c947b] line-clamp-2">{item.description}</p>}
                                    </div>
                                ));
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* Create Task Modal */}
            {isCreateTaskModalOpen && (
                <CreateTaskModal
                    projectId={project_id}
                    organizationId={organizationId}
                    teamSpaceId={teamSpaceId}
                    initialStatus={createTaskInitialStatus}
                    onClose={() => setIsCreateTaskModalOpen(false)}
                    onCreated={(newTask) => {
                        setProjectTasks(prev => [newTask, ...prev])
                    }}
                />
            )}

            {/* Task Details Drawer */}
            {selectedTask && (
                <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
                    <div className="w-full max-w-md bg-[#191c21] border-l border-[#2D3139] p-6 flex flex-col justify-between h-full text-white">
                        <div>
                            <div className="flex items-center justify-between pb-4 border-b border-[#2D3139] mb-6">
                                <h3 className="font-bold text-lg text-white">Task Details</h3>
                                <button onClick={() => setSelectedTask(null)} className="text-[#8c947b] hover:text-white">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                            <h2 className="text-xl font-bold text-white mb-2">{selectedTask.title}</h2>
                            <p className="text-sm text-[#8c947b] mb-4">{selectedTask.description || "No description provided."}</p>
                            
                            <div className="space-y-4 text-xs">
                                <div className="flex items-center justify-between py-2 border-b border-[#2D3139]">
                                    <span className="text-[#8c947b]">Status</span>
                                    <select
                                        value={selectedTask.status || "todo"}
                                        onChange={(e) => updateTaskStatus(selectedTask.id, e.target.value)}
                                        className="bg-[#181a20] border border-[#2D3139] text-white font-bold text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#aff82a] uppercase cursor-pointer"
                                    >
                                        <option value="todo" className="bg-[#191c21]">Backlog / To Do</option>
                                        <option value="in_progress" className="bg-[#191c21]">Doing / In Progress</option>
                                        <option value="done" className="bg-[#191c21]">Done</option>
                                    </select>
                                </div>
                                <div className="flex items-center justify-between py-2 border-b border-[#2D3139]">
                                    <span className="text-[#8c947b]">Priority</span>
                                    <select
                                        value={selectedTask.priority || "medium"}
                                        onChange={(e) => updateTaskPriority(selectedTask.id, e.target.value)}
                                        className="bg-[#181a20] border border-[#2D3139] text-[#aff82a] font-bold text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#aff82a] uppercase cursor-pointer"
                                    >
                                        <option value="low" className="bg-[#191c21] text-white">Low</option>
                                        <option value="medium" className="bg-[#191c21] text-white">Medium</option>
                                        <option value="high" className="bg-[#191c21] text-amber-400">High</option>
                                        <option value="urgent" className="bg-[#191c21] text-red-400">Urgent</option>
                                    </select>
                                </div>
                                <div className="flex justify-between items-center py-2 border-b border-[#2D3139]">
                                    <span className="text-[#8c947b]">Due Date</span>
                                    <span className="font-semibold text-white">{selectedTask.due_date ? new Date(selectedTask.due_date).toLocaleDateString() : "—"}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Overdue Task Update Modal */}
            {pendingOverdueUpdate && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-[#191c21] border border-[#2D3139] rounded-2xl p-6 w-full max-w-md shadow-2xl">
                        <div className="flex items-center gap-3 text-white mb-4">
                            <span className="material-symbols-outlined text-red-400 text-3xl">warning</span>
                            <h2 className="text-xl font-bold">Reschedule Overdue Task</h2>
                        </div>
                        <p className="text-[#8c947b] text-sm mb-6">
                            You are moving a task out of the <span className="text-red-400 font-bold uppercase">Overdue</span> state. Please set a new due date to continue.
                        </p>
                        
                        <div className="mb-6 flex gap-4">
                            <div className="flex-1">
                                <label className="block text-xs font-bold text-[#8c947b] uppercase mb-2">New Due Date</label>
                                <input
                                    type="date"
                                    value={newOverdueDate}
                                    onChange={(e) => setNewOverdueDate(e.target.value)}
                                    className="w-full bg-[#111318] border border-[#2D3139] text-white rounded-lg px-4 py-3 focus:outline-none focus:border-[#aff82a] focus:ring-1 focus:ring-[#aff82a] transition-all"
                                />
                            </div>
                            <div className="w-[120px]">
                                <label className="block text-xs font-bold text-[#8c947b] uppercase mb-2">Time</label>
                                <input
                                    type="time"
                                    value={newOverdueTime}
                                    onChange={(e) => setNewOverdueTime(e.target.value)}
                                    className="w-full bg-[#111318] border border-[#2D3139] text-white rounded-lg px-4 py-3 focus:outline-none focus:border-[#aff82a] focus:ring-1 focus:ring-[#aff82a] transition-all"
                                />
                            </div>
                        </div>
                        
                        <div className="flex items-center justify-end gap-3">
                            <button
                                onClick={() => {
                                    setPendingOverdueUpdate(null)
                                    setNewOverdueDate("")
                                    setNewOverdueTime("12:00")
                                }}
                                className="px-4 py-2 rounded-lg font-bold text-sm text-[#8c947b] hover:text-white hover:bg-[#2D3139] transition-all cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmOverdueUpdate}
                                disabled={!newOverdueDate}
                                className="px-4 py-2 rounded-lg font-bold text-sm bg-[#aff82a] text-black hover:bg-[#c2f954] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            >
                                Update Task
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default ProjectPage