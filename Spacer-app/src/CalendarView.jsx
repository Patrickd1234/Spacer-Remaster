import { useState, useEffect } from "react"
import Sidebar from "./partials/sidebar"
import Header from "./partials/header"
import { supabase } from "./supabase"

export default function CalendarView() {
    const [userData, setUserData] = useState(null)
    const [calendarMonth, setCalendarMonth] = useState(new Date())
    const [tasks, setTasks] = useState([])
    const [events, setEvents] = useState([])
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

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
                                    <div key={idx} className={`min-h-[160px] p-3 transition-colors ${date ? 'bg-surface-container-high hover:bg-surface-container-highest' : 'bg-surface-container-lowest/50'}`}>
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
            </main>
        </>
    )
}
