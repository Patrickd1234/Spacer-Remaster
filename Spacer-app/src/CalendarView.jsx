import { useState, useEffect } from "react"
import Sidebar from "./partials/SidebarRouter"
import Header from "./partials/header"
import CreateTaskModal from "./partials/CreateTaskModal"
import { supabase, getSessionUser } from "./supabase"
import { statusFromSubtasks } from "./taskStatus"

export default function CalendarView() {
    const [userData, setUserData] = useState(null)
    const [calendarMonth, setCalendarMonth] = useState(new Date())
    const [tasks, setTasks] = useState([])
    const [events, setEvents] = useState([])
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [selectedDateEvents, setSelectedDateEvents] = useState(null)
    const [selectedTask, setSelectedTask] = useState(null)
    const [orgUsers, setOrgUsers] = useState([])
    const [sidebarActionMenuOpen, setSidebarActionMenuOpen] = useState(false)
    const [creatingInSidebar, setCreatingInSidebar] = useState(null)
    const [newSubtaskTitle, setNewSubtaskTitle] = useState("")

    const updateTaskSubtasks = async (taskId, newSubtasks) => {
        const task = tasks.find(t => String(t.id) === String(taskId))
        if (!task) return

        // Subtasks drive the status; with none left the task keeps its current status
        const newStatus = statusFromSubtasks(newSubtasks) ?? task.status
        const statusChanged = newStatus !== task.status

        const serialized = JSON.stringify(newSubtasks)

        setSelectedTask(prev => prev && String(prev.id) === String(taskId) ? { ...prev, sub_tasks: serialized, status: newStatus } : prev)
        setTasks(prevTasks =>
            prevTasks.map(t =>
                String(t.id) === String(taskId) ? { ...t, sub_tasks: serialized, status: newStatus } : t
            )
        )

        const updatePayload = { sub_tasks: serialized }
        if (statusChanged) {
            updatePayload.status = newStatus
        }

        const { error } = await supabase.from('tasks').update(updatePayload).eq('id', taskId)
        if (error) {
            console.error("Error updating subtasks", error)
        } else if (statusChanged) {
            // Log the status change like the project page does, so it reaches
            // notifications and activity feeds
            const userData = { user: await getSessionUser() }
            const { error: logError } = await supabase.from("activity_log").insert({
                entity_type: "task",
                entity_id: taskId,
                actor_id: userData?.user?.id,
                action: "status_changed",
                new_state: { project_id: task.project_id, title: task.title, status: newStatus }
            })
            if (logError) console.error("Error logging status change", logError)
        }
    }

    const updateTaskPriority = async (taskId, newPriority) => {
        const task = tasks.find(t => String(t.id) === String(taskId))
        setSelectedTask(prev => prev ? { ...prev, priority: newPriority } : null)
        setTasks(prevTasks =>
            prevTasks.map(t =>
                String(t.id) === String(taskId) ? { ...t, priority: newPriority } : t
            )
        )
        const { error } = await supabase.from('tasks').update({ priority: newPriority }).eq('id', taskId)
        if (error) {
            console.error("Error updating priority", error)
        } else if (task) {
            const userData = { user: await getSessionUser() }
            const logEntry = {
                entity_type: "task",
                entity_id: taskId,
                actor_id: userData?.user?.id,
                action: "priority_changed",
                new_state: { project_id: task.project_id, title: task.title, priority: newPriority }
            }
            await supabase.from("activity_log").insert(logEntry)
        }
    }

    const updateTaskStatus = async (taskId, newStatus) => {
        const task = tasks.find(t => String(t.id) === String(taskId))
        if (!task) return

        // Any task can be set to any status; ticking subtasks still updates it automatically
        if (task.status === newStatus) return

        setSelectedTask(prev => prev ? { ...prev, status: newStatus } : null)
        setTasks(prevTasks =>
            prevTasks.map(t =>
                String(t.id) === String(taskId) ? { ...t, status: newStatus } : t
            )
        )
        const { error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId)
        if (error) {
            console.error("Error updating status", error)
        } else {
            const userData = { user: await getSessionUser() }
            const logEntry = {
                entity_type: "task",
                entity_id: taskId,
                actor_id: userData?.user?.id,
                action: "status_changed",
                new_state: { project_id: task.project_id, title: task.title, status: newStatus }
            }
            await supabase.from("activity_log").insert(logEntry)
        }
    }

    useEffect(() => {
        const fetchUserAndData = async () => {
            const email = localStorage.getItem("userEmail")
            if (!email) return

            const { data: user, error: userError } = await supabase
                .from("users")
                .select("*")
                .eq("email", email)
                .maybeSingle()
            
            if (userError || !user) {
                console.error("Error fetching user", userError)
                return
            }
            setUserData(user)

            const { data: userTasks, error: tasksError } = await supabase
                .from("tasks")
                .select("*")
                .eq("assignee_id", user.id)
                .not("due_date", "is", null)
            
            if (tasksError) {
                console.error("Error fetching tasks", tasksError)
            } else {
                // Show statuses as stored; they're only derived when subtasks are edited
                setTasks(userTasks || [])
            }

            if (user.organization_id) {
                const { data: orgEvents, error: eventsError } = await supabase
                    .from("calendar_events")
                    .select("*")
                    .eq("organization_id", user.organization_id)
                
                if (eventsError) {
                    console.error("Error fetching events", eventsError)
                } else {
                    setEvents(orgEvents || [])
                }

                const { data: users, error: usersError } = await supabase
                    .from("users")
                    .select("*")
                    .eq("organization_id", user.organization_id)
                if (!usersError) setOrgUsers(users || [])
            }
        }
        
        fetchUserAndData()
    }, [])

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
            <main className={`${sidebarCollapsed ? "ml-[72px]" : "ml-[260px]"} flex-1 flex flex-col pt-16 transition-all duration-300 ease-out p-8 h-[calc(100vh-64px)] overflow-hidden`}>
                <div className="flex items-center justify-between mb-6 shrink-0">
                    <div>
                        <h1 className="text-2xl font-bold text-white">Global Calendar</h1>
                        <p className="text-[#8c947b] text-sm mt-1">View assigned tasks and scheduled company events.</p>
                    </div>
                </div>

                <div className="flex-1 flex flex-col min-h-0 bg-[#191c21] border border-[#2D3139] rounded-xl p-6">
                    {/* Calendar Header */}
                    <div className="flex items-center justify-between pb-4 border-b border-[#2D3139] shrink-0">
                        <h3 className="text-lg font-bold text-white capitalize">
                            {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                        </h3>
                        <div className="flex items-center gap-2">
                            <button onClick={handlePrevMonth} className="w-8 h-8 rounded-lg bg-[#1e2025] hover:bg-[#2D3139] text-[#8c947b] hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-[#2D3139]">
                                <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                            </button>
                            <button onClick={handleNextMonth} className="w-8 h-8 rounded-lg bg-[#1e2025] hover:bg-[#2D3139] text-[#8c947b] hover:text-white flex items-center justify-center transition-colors cursor-pointer border border-[#2D3139]">
                                <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                            </button>
                        </div>
                    </div>

                    {/* Calendar Grid */}
                    <div className="flex-1 overflow-y-auto min-h-0 mt-4">
                        <div className="grid grid-cols-7 gap-px bg-[#2D3139] overflow-hidden rounded-lg border border-[#2D3139]">
                            {/* Day Names */}
                            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                                <div key={day} className="bg-[#181a20] p-3 text-center text-xs font-bold text-[#8c947b] uppercase tracking-wider">
                                    {day}
                                </div>
                            ))}
                            {/* Day Cells */}
                            {calendarDays.map((date, idx) => {
                                const dateString = formatYMD(date);
                                const dayTasks = date ? tasks.filter(t => t.due_date && t.due_date.substring(0, 10) === dateString) : [];
                                const dayEvents = date ? events.filter(e => e.event_date && e.event_date.substring(0, 10) === dateString) : [];
                                const isToday = dateString === formatYMD(new Date());
                                
                                return (
                                    <div 
                                        key={idx} 
                                        onClick={() => date && setSelectedDateEvents(date)}
                                        className={`min-h-[120px] p-3 transition-colors cursor-pointer ${date ? 'bg-[#191c21] hover:bg-[#1C1F26]' : 'bg-[#111318]'}`}
                                    >
                                        {date && (
                                            <>
                                                <div className={`text-right mb-2 flex items-center justify-end gap-1 text-xs ${isToday ? 'font-bold' : 'text-[#8c947b]'}`}>
                                                    {dayEvents.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-purple-400"></span>}
                                                    {dayTasks.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-[#aff82a]"></span>}
                                                    <span className={isToday ? 'inline-flex items-center justify-center w-6 h-6 bg-[#5b644d] text-white font-bold rounded-full text-[11px]' : ''}>
                                                        {date.getDate()}
                                                    </span>
                                                </div>
                                                <div className="space-y-1">
                                                    {dayEvents.map(event => (
                                                        <div 
                                                            key={`evt-${event.id}`} 
                                                            className="px-2 py-1 text-[10px] font-medium rounded truncate bg-purple-500/10 text-purple-400 border border-purple-500/30"
                                                        >
                                                            {event.title}
                                                        </div>
                                                    ))}
                                                    {dayTasks.map(task => (
                                                        <div 
                                                            key={`tsk-${task.id}`} 
                                                            className={`px-2 py-1 text-[10px] font-medium rounded truncate border ${
                                                                task.status === 'done' ? 'bg-green-500/10 text-green-400 border-green-500/30' :
                                                                'bg-[#aff82a]/10 text-[#aff82a] border-[#aff82a]/30'
                                                            }`}
                                                        >
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
                </div>

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
                                            organizationId={userData?.organization_id}
                                            initialStatus="todo"
                                            initialDate={selectedDateEvents ? `${selectedDateEvents.getFullYear()}-${String(selectedDateEvents.getMonth()+1).padStart(2,'0')}-${String(selectedDateEvents.getDate()).padStart(2,'0')}T09:00` : ""}
                                            isInline={true}
                                            onClose={() => setCreatingInSidebar(null)}
                                            onCreated={(newTask) => {
                                                setTasks(prev => [newTask, ...prev])
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
                                    const dayTasks = tasks.filter(t => t.due_date && t.due_date.substring(0, 10) === dateString);
                                    const dayEvents = events.filter(e => e.event_date && e.event_date.substring(0, 10) === dateString);
                                    
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
                                            {item.isTask && (() => {
                                                let subtasksList = [];
                                                if (item.sub_tasks) {
                                                    if (Array.isArray(item.sub_tasks)) {
                                                        subtasksList = item.sub_tasks;
                                                    } else if (typeof item.sub_tasks === "string") {
                                                        const trimmed = item.sub_tasks.trim();
                                                        if (trimmed && trimmed !== "null" && trimmed !== "undefined") {
                                                            try {
                                                                const parsed = JSON.parse(trimmed);
                                                                if (Array.isArray(parsed)) {
                                                                    subtasksList = parsed;
                                                                } else {
                                                                    console.warn("Malformed sub_tasks (expected array) for task", item.id, parsed);
                                                                    subtasksList = [];
                                                                }
                                                            } catch (e) {
                                                                console.warn("Malformed sub_tasks for task", item.id, e);
                                                                subtasksList = [];
                                                            }
                                                        }
                                                    }
                                                }
                                                if (subtasksList.length === 0) return null;

                                                const completedCount = subtasksList.filter(st => st.done).length;
                                                const totalCount = subtasksList.length;
                                                const percent = (completedCount / totalCount) * 100;

                                                return (
                                                    <div className="mt-2">
                                                        <div className="flex items-center justify-between text-[10px] text-[#8c947b] mb-1 font-medium">
                                                            <span className="flex items-center gap-1">
                                                                <span className="material-symbols-outlined text-[12px]">format_list_bulleted</span>
                                                                Sub-tasks
                                                            </span>
                                                            <span>{completedCount}/{totalCount}</span>
                                                        </div>
                                                        <div className="w-full bg-[#16181e] rounded-full h-1 overflow-hidden">
                                                            <div 
                                                                className="bg-[#aff82a] h-full transition-all duration-300"
                                                                style={{ width: `${percent}%` }}
                                                            ></div>
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    ));
                                })()}
                            </div>
                        </div>
                    </div>
                )}

                {/* Task details drawer */}
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

                                <div className="mb-6 space-y-3">
                                    <h4 className="text-xs font-semibold text-[#8c947b] uppercase tracking-wider flex items-center gap-1">
                                        <span className="material-symbols-outlined text-[14px]">format_list_bulleted</span>
                                        Sub-tasks
                                    </h4>
                                    
                                    <div className="bg-[#181a20] p-4 rounded-xl border border-[#2D3139] space-y-2">
                                        {(() => {
                                            let subtasksList = [];
                                            if (selectedTask.sub_tasks) {
                                                if (Array.isArray(selectedTask.sub_tasks)) {
                                                    subtasksList = selectedTask.sub_tasks;
                                                } else if (typeof selectedTask.sub_tasks === "string") {
                                                    const trimmed = selectedTask.sub_tasks.trim();
                                                    if (trimmed && trimmed !== "null" && trimmed !== "undefined") {
                                                        try {
                                                            const parsed = JSON.parse(trimmed);
                                                            if (Array.isArray(parsed)) {
                                                                subtasksList = parsed;
                                                            } else {
                                                                console.warn("Malformed sub_tasks (expected array) for task", selectedTask.id, parsed);
                                                                subtasksList = [];
                                                            }
                                                        } catch (e) {
                                                            console.warn("Malformed sub_tasks for task", selectedTask.id, e);
                                                            subtasksList = [];
                                                        }
                                                    }
                                                }
                                            }

                                            const handleToggleSubtask = (stId) => {
                                                const updated = subtasksList.map(st => 
                                                    st.id === stId ? { ...st, done: !st.done } : st
                                                );
                                                updateTaskSubtasks(selectedTask.id, updated);
                                            };

                                            const handleDeleteSubtask = (stId) => {
                                                const updated = subtasksList.filter(st => st.id !== stId);
                                                updateTaskSubtasks(selectedTask.id, updated);
                                            };

                                            const handleAddSubtask = (e) => {
                                                e.preventDefault();
                                                if (!newSubtaskTitle.trim()) return;
                                                const newSub = {
                                                    id: Math.random().toString(36).substring(2, 9),
                                                    title: newSubtaskTitle.trim(),
                                                    done: false
                                                };
                                                updateTaskSubtasks(selectedTask.id, [...subtasksList, newSub]);
                                                setNewSubtaskTitle("");
                                            };

                                            return (
                                                <>
                                                    {subtasksList.length === 0 ? (
                                                        <p className="text-[11px] text-[#8c947b] italic">No sub-tasks added yet.</p>
                                                    ) : (
                                                        <div className="space-y-1">
                                                            {subtasksList.map(st => (
                                                                <div key={st.id} className="flex items-center justify-between group py-0.5">
                                                                    <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-white flex-1">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleToggleSubtask(st.id)}
                                                                            className={`check-btn ${!st.done ? '!bg-[#111318] !shadow-none !border !border-[#2D3139] hover:!bg-[#2D3139]' : ''} !p-0 !w-3.5 !h-3.5 !rounded flex items-center justify-center shrink-0`}
                                                                            title={st.done ? "Mark as incomplete" : "Mark as done"}
                                                                        >
                                                                            <svg className={`check-icon transition-opacity ${!st.done ? 'opacity-0' : 'opacity-100'} !w-2.5 !h-2.5`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                                                            </svg>
                                                                        </button>
                                                                        <span className={st.done ? 'line-through text-[#8c947b]' : ''}>
                                                                            {st.title}
                                                                        </span>
                                                                    </label>
                                                                    <button
                                                                        onClick={() => handleDeleteSubtask(st.id)}
                                                                        className="opacity-0 group-hover:opacity-100 text-[#8c947b] hover:text-red-400 w-5 h-5 rounded flex items-center justify-center transition-all cursor-pointer"
                                                                    >
                                                                        <span className="material-symbols-outlined text-[14px]">delete</span>
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    
                                                    <form onSubmit={handleAddSubtask} className="flex gap-2 pt-2 border-t border-[#2D3139] mt-2">
                                                        <input
                                                            type="text"
                                                            placeholder="Add sub-task..."
                                                            value={newSubtaskTitle}
                                                            onChange={(e) => setNewSubtaskTitle(e.target.value)}
                                                            className="flex-1 bg-[#111318] border border-[#2D3139] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#aff82a] transition-all placeholder-[#8c947b]"
                                                        />
                                                        <button
                                                            type="submit"
                                                            className="px-3 bg-[#5b644d] text-white rounded-lg text-[11px] font-semibold hover:bg-[#6c765c] transition-all cursor-pointer flex items-center justify-center gap-1"
                                                        >
                                                            <span className="material-symbols-outlined text-[14px]">add</span>
                                                            Add
                                                        </button>
                                                    </form>
                                                </>
                                            );
                                        })()}
                                    </div>
                                </div>

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
            </main>
        </div>
    )
}
