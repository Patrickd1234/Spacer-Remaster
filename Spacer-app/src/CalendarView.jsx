import { useState, useEffect } from "react"
import Sidebar from "./partials/sidebar"
import Header from "./partials/header"
import CreateTaskModal from "./partials/CreateTaskModal"
import { supabase } from "./supabase"

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

    const updateTaskPriority = async (taskId, newPriority) => {
        setSelectedTask(prev => prev ? { ...prev, priority: newPriority } : null)
        setTasks(prevTasks =>
            prevTasks.map(t =>
                String(t.id) === String(taskId) ? { ...t, priority: newPriority } : t
            )
        )
        const { error } = await supabase.from('tasks').update({ priority: newPriority }).eq('id', taskId)
        if (error) console.error("Error updating priority", error)
    }

    const updateTaskStatus = async (taskId, newStatus) => {
        setSelectedTask(prev => prev ? { ...prev, status: newStatus } : null)
        setTasks(prevTasks =>
            prevTasks.map(t =>
                String(t.id) === String(taskId) ? { ...t, status: newStatus } : t
            )
        )
        const { error } = await supabase.from('tasks').update({ status: newStatus }).eq('id', taskId)
        if (error) console.error("Error updating status", error)
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
