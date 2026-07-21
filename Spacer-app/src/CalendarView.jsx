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
    const [priorityDropdownOpen, setPriorityDropdownOpen] = useState(false)

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

            // Fetch tasks assigned to this user that have a due date
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

            // Fetch calendar events for the organization
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
    const startDayOfWeek = startOfCurrentMonth.getDay() // 0 = Sunday
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
        <>
            <Sidebar onCollapsedChange={setSidebarCollapsed} />
            <Header />
            <main className={`${sidebarCollapsed ? "ml-[72px]" : "ml-[260px]"} flex-1 flex flex-col h-[calc(100vh-64px)] transition-all duration-300 ease-out mt-16 p-lg overflow-hidden`}>
                <div className="flex items-center justify-between mb-lg shrink-0">
                    <div>
                        <h1 className="text-headline-xl font-bold text-on-surface">Global Calendar</h1>
                        <p className="text-on-surface-variant font-body-md mt-1">View your assigned tasks and organization events across all projects.</p>
                    </div>
                </div>

                <div className="flex-1 flex flex-col min-h-0">
                    {/* Calendar Header */}
                    <div className="flex items-center justify-between pb-md shrink-0">
                        <h3 className="font-headline-lg text-on-surface font-bold capitalize">
                            {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
                        </h3>
                        <div className="flex items-center gap-2">
                            <button onClick={handlePrevMonth} className="w-10 h-10 rounded-lg bg-surface-container hover:bg-surface-variant text-on-surface flex items-center justify-center transition-colors cursor-pointer border border-outline-variant/30">
                                <span className="material-symbols-outlined">chevron_left</span>
                            </button>
                            <button onClick={handleNextMonth} className="w-10 h-10 rounded-lg bg-surface-container hover:bg-surface-variant text-on-surface flex items-center justify-center transition-colors cursor-pointer border border-outline-variant/30">
                                <span className="material-symbols-outlined">chevron_right</span>
                            </button>
                        </div>
                    </div>

                    {/* Calendar Grid */}
                    <div className="flex-1 overflow-y-auto scroll-hide min-h-0">
                        <div className="grid grid-cols-7 gap-px bg-outline-variant/20 overflow-hidden border-y border-outline-variant/30 min-h-full mt-sm">
                            {/* Day Names */}
                            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(day => (
                                <div key={day} className="bg-surface-container-highest p-3 text-center font-label-md text-on-surface-variant uppercase tracking-wider h-auto shrink-0">
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
                                        className={`min-h-[160px] p-3 transition-colors cursor-pointer ${date ? 'bg-surface-container-high hover:bg-surface-container-highest' : 'bg-surface-container-lowest/50'}`}
                                    >
                                        {date && (
                                            <>
                                                <div className={`text-right mb-3 flex items-center justify-end gap-1.5 ${isToday ? 'font-bold' : 'text-on-surface-variant'} text-body-lg`}>
                                                    {dayEvents.length > 0 && <span className="w-2 h-2 rounded-full bg-[#9c27b0]" title={`${dayEvents.length} event(s)`}></span>}
                                                    {dayTasks.length > 0 && <span className="w-2 h-2 rounded-full bg-primary-fixed-dim" title={`${dayTasks.length} task(s)`}></span>}
                                                    <span className={isToday ? 'inline-flex items-center justify-center w-8 h-8 bg-[#8bc34a] text-black font-bold rounded-full' : ''}>
                                                        {date.getDate()}
                                                    </span>
                                                </div>
                                                <div className="space-y-2">
                                                    {dayEvents.map(event => (
                                                        <div 
                                                            key={`evt-${event.id}`} 
                                                            className="px-2.5 py-1.5 text-xs font-bold rounded cursor-pointer transition-transform hover:scale-[1.02] truncate border bg-[#9c27b0]/10 text-[#9c27b0] border-[#9c27b0]/30"
                                                            title={event.title}
                                                        >
                                                            <div className="flex flex-col">
                                                                <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">event</span> {event.title}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                    {dayTasks.map(task => (
                                                        <div 
                                                            key={`tsk-${task.id}`} 
                                                            className={`px-2.5 py-1.5 text-xs font-bold rounded cursor-pointer transition-transform hover:scale-[1.02] truncate border ${
                                                                task.status === 'done' ? 'bg-[#8bc34a]/10 text-[#8bc34a] border-[#8bc34a]/30' :
                                                                task.priority === 'urgent' ? 'bg-error/10 text-error border-error/30' :
                                                                task.priority === 'high' ? 'bg-[#f59e0b]/10 text-[#f59e0b] border-[#f59e0b]/30' :
                                                                'bg-primary-fixed-dim/10 text-primary-fixed-dim border-primary-fixed-dim/30'
                                                            }`}
                                                            title={task.title}
                                                        >
                                                            <div className="flex flex-col">
                                                                <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">task</span> {task.title}</span>
                                                            </div>
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

                {selectedDateEvents && (
                    <>
                        {/* Backdrop */}
                        <div 
                            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
                            onClick={() => setSelectedDateEvents(null)}
                        ></div>
                        {/* Sidebar */}
                        <div className="fixed top-0 right-0 z-50 w-1/2 h-full bg-surface-container-high border-l border-outline-variant/30 shadow-2xl flex flex-col transform transition-transform duration-300">
                            <div className="flex items-center justify-between p-lg border-b border-outline-variant/20 shrink-0">
                                <h2 className="font-headline-md text-on-surface">
                                    Schedule for {selectedDateEvents.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                                </h2>
                                <div className="flex items-center gap-sm relative">
                                    <button 
                                        className="text-on-surface-variant hover:text-on-surface cursor-pointer w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-variant transition-colors relative" 
                                        onClick={() => setSidebarActionMenuOpen(!sidebarActionMenuOpen)}
                                    >
                                        <span className="material-symbols-outlined">add</span>
                                    </button>
                                    {sidebarActionMenuOpen && (
                                        <>
                                            <div className="fixed inset-0 z-40" onClick={() => setSidebarActionMenuOpen(false)}></div>
                                            <div className="absolute right-0 top-full mt-1 w-48 bg-surface-container-highest border border-outline-variant/30 rounded-lg shadow-xl z-[70] overflow-hidden">
                                                <button 
                                                    className="w-full text-left px-4 py-3 hover:bg-surface-variant transition-colors flex items-center gap-3 text-sm font-medium text-on-surface cursor-pointer"
                                                    onClick={() => { setSidebarActionMenuOpen(false); setCreatingInSidebar('task'); }}
                                                >
                                                    <span className="material-symbols-outlined text-[18px]">task</span> Add Task
                                                </button>
                                                <button 
                                                    className="w-full text-left px-4 py-3 hover:bg-surface-variant transition-colors flex items-center gap-3 text-sm font-medium text-on-surface cursor-pointer"
                                                    onClick={() => { setSidebarActionMenuOpen(false); setCreatingInSidebar('meeting'); }}
                                                >
                                                    <span className="material-symbols-outlined text-[18px]">event</span> Add Meeting
                                                </button>
                                            </div>
                                        </>
                                    )}
                                    <button className="text-on-surface-variant hover:text-on-surface cursor-pointer w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-variant transition-colors" onClick={() => { setSelectedDateEvents(null); setCreatingInSidebar(null); setSidebarActionMenuOpen(false); }}>
                                        <span className="material-symbols-outlined">close</span>
                                    </button>
                                </div>
                            </div>
                            <div className="p-lg overflow-y-auto flex-1 scroll-hide space-y-md">
                                {creatingInSidebar === 'task' ? (
                                    <div className="h-full flex flex-col">
                                        <button onClick={() => setCreatingInSidebar(null)} className="mb-4 text-sm font-medium text-on-surface-variant flex items-center gap-1 hover:text-on-surface transition-colors cursor-pointer w-fit">
                                            <span className="material-symbols-outlined text-[16px]">arrow_back</span> Back to schedule
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
                                        <button onClick={() => setCreatingInSidebar(null)} className="mb-4 text-sm font-medium text-on-surface-variant flex items-center gap-1 hover:text-on-surface transition-colors cursor-pointer w-fit">
                                            <span className="material-symbols-outlined text-[16px]">arrow_back</span> Back to schedule
                                        </button>
                                        <div className="flex-1 flex items-center justify-center bg-surface-container rounded-xl border border-outline-variant/20 border-dashed p-6 text-center">
                                            <p className="text-on-surface-variant italic">Meeting creation functionality coming soon...</p>
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
                                        return <p className="text-on-surface-variant text-center italic py-md">Nothing scheduled for this day.</p>;
                                    }

                                    return combined.map(item => (
                                        <div 
                                            key={(item.isEvent ? 'evt-' : 'tsk-') + item.id} 
                                            onClick={() => {
                                                if (!item.isEvent) {
                                                    setSelectedTask(item);
                                                }
                                            }}
                                            className={`bg-surface-container p-md rounded-xl border border-outline-variant/20 flex flex-col gap-xs ${!item.isEvent ? 'cursor-pointer hover:border-primary-fixed-dim/50 transition-colors hover:shadow-lg' : ''}`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded flex items-center gap-1 ${
                                                    item.isEvent ? 'bg-[#9c27b0]/20 text-[#9c27b0]' : 'bg-primary-fixed-dim/20 text-primary-fixed-dim'
                                                }`}>
                                                    <span className="material-symbols-outlined text-[12px]">{item.isEvent ? 'event' : 'task'}</span>
                                                    {item.isEvent ? 'Event' : 'Task'}
                                                </span>
                                                <span className="text-xs text-on-surface-variant font-medium">
                                                    {(item.originalDateStr.includes('T') || item.originalDateStr.includes(' ')) 
                                                        ? new Date(item.sortTime).toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
                                                        : 'All Day'}
                                                </span>
                                            </div>
                                            <h3 className="font-body-lg text-on-surface font-semibold mt-1">{item.title}</h3>
                                            {item.description && <p className="text-body-sm text-on-surface-variant line-clamp-2">{item.description}</p>}
                                        </div>
                                    ));
                                })()}
                            </div>
                        </div>
                    </>
                )}

                {/* Task Details Sidebar */}
                {selectedTask && (
                    <div className="fixed inset-0 z-[60] flex justify-end">
                        {/* Backdrop */}
                        <div 
                            className="absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
                            onClick={() => setSelectedTask(null)}
                        ></div>
                        
                        {/* Sidebar */}
                        <div className="relative w-1/2 bg-surface-container-high shadow-2xl h-full overflow-y-auto flex flex-col transform transition-transform duration-300 border-l border-outline-variant/30">
                            {/* Header */}
                            <div className="flex items-center justify-between p-lg border-b border-outline-variant/30 bg-surface-container-highest">
                                <h2 className="font-headline-md text-primary-container font-bold flex items-center gap-sm">
                                    <span className="material-symbols-outlined">task</span>
                                    Task Details
                                </h2>
                                <button 
                                    className="text-on-surface-variant hover:text-on-surface hover:bg-surface-variant w-8 h-8 rounded flex items-center justify-center transition-colors cursor-pointer"
                                    onClick={() => setSelectedTask(null)}
                                >
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>

                            {/* Content */}
                            <div className="p-lg space-y-xl flex-1">
                                <div>
                                    <h1 className="font-headline-lg text-on-surface font-bold mb-md leading-tight">{selectedTask.title}</h1>
                                    <div className="flex flex-wrap gap-sm">
                                        <span className="px-md py-1.5 bg-surface-container-highest border border-outline-variant/50 text-on-surface-variant rounded text-xs uppercase font-bold tracking-wider flex items-center gap-xs">
                                            <span className="material-symbols-outlined text-[14px]">flag</span>
                                            {selectedTask.status.replace('_', ' ')}
                                        </span>
                                        <div className="relative">
                                            <button 
                                                className={`px-md py-1.5 rounded border text-xs font-bold uppercase tracking-wider flex items-center gap-xs cursor-pointer hover:opacity-80 transition-opacity ${
                                                    selectedTask.priority === 'urgent' ? 'bg-error/10 border-error/30 text-error' :
                                                    selectedTask.priority === 'high' ? 'bg-[#f59e0b]/10 border-[#f59e0b]/30 text-[#f59e0b]' :
                                                    selectedTask.priority === 'medium' ? 'bg-tertiary/10 border-tertiary/30 text-tertiary' :
                                                    'bg-primary-fixed-dim/10 border-primary-fixed-dim/30 text-primary-fixed-dim'
                                                }`}
                                                onClick={() => setPriorityDropdownOpen(!priorityDropdownOpen)}
                                            >
                                                <span className="material-symbols-outlined text-[14px]">bolt</span>
                                                {selectedTask.priority || 'Normal'}
                                            </button>
                                            {priorityDropdownOpen && (
                                                <>
                                                    <div className="fixed inset-0 z-40" onClick={() => setPriorityDropdownOpen(false)}></div>
                                                    <div className="absolute left-0 top-full mt-1 w-32 bg-surface-container-highest border border-outline-variant/30 rounded-lg shadow-xl z-[70] overflow-hidden flex flex-col">
                                                        {['low', 'medium', 'high', 'urgent'].map(p => (
                                                            <button 
                                                                key={p}
                                                                className={`text-left px-4 py-2 hover:bg-surface-variant transition-colors text-xs font-bold uppercase cursor-pointer ${selectedTask.priority === p ? 'text-primary' : 'text-on-surface'}`}
                                                                onClick={() => {
                                                                    updateTaskPriority(selectedTask.id, p);
                                                                    setPriorityDropdownOpen(false);
                                                                }}
                                                            >
                                                                {p}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                
                                <div>
                                    <h3 className="font-label-md text-on-surface-variant uppercase tracking-wider mb-sm flex items-center gap-xs">
                                        <span className="material-symbols-outlined text-[16px]">description</span> 
                                        Description
                                    </h3>
                                    {selectedTask.description ? (
                                        <p className="font-body-md text-on-surface whitespace-pre-wrap leading-relaxed bg-surface-container-low p-md rounded-xl border border-outline-variant/20">{selectedTask.description}</p>
                                    ) : (
                                        <div className="bg-surface-container-lowest p-md rounded-xl border border-outline-variant/20 border-dashed flex flex-col items-center justify-center gap-sm text-center">
                                            <span className="material-symbols-outlined text-on-surface-variant/50 text-3xl">notes</span>
                                            <p className="font-body-sm text-on-surface-variant/70 italic">No description provided for this task.</p>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-md">
                                    <div className="bg-surface-container p-md rounded-xl border border-outline-variant/20 flex flex-col gap-xs">
                                        <h3 className="font-label-sm text-on-surface-variant uppercase tracking-wider flex items-center gap-xs">
                                            <span className="material-symbols-outlined text-[14px]">person</span> Assignee
                                        </h3>
                                        {(() => {
                                            const assignee = selectedTask.assignee_id ? orgUsers.find(u => u.id === selectedTask.assignee_id) : null;
                                            return assignee ? (
                                                <div className="flex items-center gap-sm mt-1">
                                                    <div className="w-6 h-6 rounded-full bg-surface-variant flex items-center justify-center text-[10px] font-bold text-on-surface-variant uppercase">
                                                        {assignee.name.charAt(0)}
                                                    </div>
                                                    <p className="font-body-md text-on-surface font-semibold">{assignee.name}</p>
                                                </div>
                                            ) : (
                                                <p className="font-body-md text-on-surface mt-1 italic opacity-70">Unassigned</p>
                                            );
                                        })()}
                                    </div>
                                    <div className="bg-surface-container p-md rounded-xl border border-outline-variant/20 flex flex-col gap-xs">
                                        <h3 className="font-label-sm text-on-surface-variant uppercase tracking-wider flex items-center gap-xs">
                                            <span className="material-symbols-outlined text-[14px]">calendar_today</span> Deadline
                                        </h3>
                                        <p className="font-body-md text-on-surface font-semibold mt-1">
                                            {selectedTask.due_date ? (
                                                selectedTask.due_date.includes('T') || selectedTask.due_date.includes(' ')
                                                    ? new Date(selectedTask.due_date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
                                                    : new Date(selectedTask.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                            ) : <span className="italic opacity-70">No deadline</span>}
                                        </p>
                                    </div>
                                </div>
                                
                                <div className="pt-md mt-auto flex justify-between items-center text-[11px] text-on-surface-variant border-t border-outline-variant/20">
                                    <span>ID: <span className="font-mono text-on-surface opacity-70">{String(selectedTask.id).substring(0, 8)}</span></span>
                                    <span>Created {new Date(selectedTask.created_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>
        </>
    )
}
