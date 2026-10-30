import { useState, useEffect, useMemo } from "react"
import { supabase, getSessionUser } from "./supabase"
import { statusFromSubtasks } from "./taskStatus"
import { useRole } from "./RoleContext"
import { createEvent } from "./general/generalData"
import {
    dayKey, startOfDay, weekDays, eventsByDay, upcomingEvents, shiftCursor, agendaItems,
} from "./general/generalFormat"
import { GeneralShell, PageHeading, PrimaryButton, DateBadge } from "./general/GeneralParts"
import { MonthView, WeekView, AgendaView, MiniMonth, EventChip, EventListItem, EventDetail, EventForm, CalendarToolbar } from "./general/CalendarParts"
import { Panel } from "./components/DashboardParts"
import { DayScheduleDrawer, TaskDetailsDrawer } from "./components/CalendarTaskDrawers"

const UPCOMING_DAYS = 30
const UPCOMING_LIMIT = 6

// A task due on a day, shaped like an all-day calendar item so the shared views can place it
const taskItem = (task) => ({
    id: `task-${task.id}`,
    kind: "task",
    title: task.title,
    description: task.description,
    event_date: task.due_date.slice(0, 10),
    starts_at: null,
    task,
})

function TaskChip({ task, onOpen }) {
    const isDone = task.status === "done"
    return (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpen(task) }}
            title={`Task: ${task.title}`}
            className={`w-full text-left px-1.5 py-1 rounded-md border text-[11px] leading-tight truncate cursor-pointer flex items-center gap-1 ${isDone ? "bg-green-500/10 text-green-400 border-green-500/30 line-through" : "bg-[#aff82a]/10 text-[#aff82a] border-[#aff82a]/30"}`}
        >
            <span className="material-symbols-outlined text-[12px] shrink-0">{isDone ? "task_alt" : "radio_button_unchecked"}</span>
            <span className="truncate">{task.title}</span>
        </button>
    )
}

function TaskRow({ item, onOpen }) {
    return (
        <button type="button" onClick={() => onOpen(item.task)} className="w-full text-left flex items-center gap-3 p-2 rounded-lg hover:bg-[#191c21] cursor-pointer">
            <DateBadge event={item} />
            <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium truncate ${item.task.status === "done" ? "text-[#8c947b] line-through" : "text-white"}`}>{item.title}</p>
                <p className="text-[11px] text-[#8c947b]">Task due</p>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium bg-[#aff82a]/10 text-[#aff82a] border-[#aff82a]/30">Task</span>
        </button>
    )
}

function Legend() {
    return (
        <Panel title="Legend">
            <p className="flex items-center gap-2 text-xs text-[#c4c9b8]"><span className="w-3 h-3 rounded-sm bg-[#aff82a]/30 border border-[#aff82a]/50" />Your tasks (by due date)</p>
            <p className="flex items-center gap-2 text-xs text-[#c4c9b8]"><span className="w-3 h-3 rounded-sm bg-blue-500/30 border border-blue-500/50" />Company events (coloured by category)</p>
        </Panel>
    )
}

// Only the columns that existed before the General Space migration, so this
// page keeps working whether or not that migration has been applied
async function fetchCalendarProfile() {
    const user = await getSessionUser()
    if (!user?.id) return null
    const { data, error } = await supabase.from("users").select("id, organization_id").eq("id", user.id).maybeSingle()
    if (error) console.error("Error fetching user", error)
    return data
}

// Personal calendar: the tasks assigned to you, plus your organization's events
export default function CalendarView() {
    const { isSuperAdmin: canManage } = useRole()
    const [profile, setProfile] = useState(null)
    const [view, setView] = useState("month")
    const [cursor, setCursor] = useState(() => startOfDay(new Date()))
    const [miniCursor, setMiniCursor] = useState(() => startOfDay(new Date()))
    const [tasks, setTasks] = useState([])
    const [events, setEvents] = useState([])
    const [selectedDate, setSelectedDate] = useState(null)
    const [selectedTask, setSelectedTask] = useState(null)
    const [openEvent, setOpenEvent] = useState(null)
    const [newEventDate, setNewEventDate] = useState(null)
    const todayKey = dayKey(new Date())

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
        let active = true
        fetchCalendarProfile().then((data) => { if (active) setProfile(data) })
        return () => { active = false }
    }, [])

    useEffect(() => {
        if (!profile?.id) return
        let active = true
        const fetchData = async () => {
            const { data: userTasks, error: tasksError } = await supabase
                .from("tasks")
                .select("*")
                .eq("assignee_id", profile.id)
                .not("due_date", "is", null)
            if (tasksError) console.error("Error fetching tasks", tasksError)
            // Show statuses as stored; they're only derived when subtasks are edited
            else if (active) setTasks(userTasks || [])

            if (!profile.organization_id) return
            const { data: orgEvents, error: eventsError } = await supabase
                .from("calendar_events")
                .select("*")
                .eq("organization_id", profile.organization_id)
            if (eventsError) console.error("Error fetching events", eventsError)
            else if (active) setEvents(orgEvents || [])
        }
        fetchData()
        return () => { active = false }
    }, [profile?.id, profile?.organization_id])

    const items = useMemo(() => [...events, ...tasks.map(taskItem)], [events, tasks])
    const byDay = useMemo(() => eventsByDay(items), [items])
    const upcoming = useMemo(
        () => upcomingEvents(items.filter((i) => i.kind !== "task" || i.task.status !== "done"), new Date(), UPCOMING_DAYS, UPCOMING_LIMIT),
        [items],
    )

    const goTo = (day) => {
        setCursor(startOfDay(day))
        setMiniCursor(startOfDay(day))
    }

    const renderChip = (item) => item.kind === "task"
        ? <TaskChip key={item.id} task={item.task} onOpen={setSelectedTask} />
        : <EventChip key={item.id} event={item} onOpen={setOpenEvent} />
    const renderRow = (item) => item.kind === "task"
        ? <TaskRow key={item.id} item={item} onOpen={setSelectedTask} />
        : <EventListItem key={item.id} event={item} onOpen={setOpenEvent} />

    const handleCreateEvent = async (form) => {
        const { data, error } = await createEvent(profile, form)
        if (error) return error
        setEvents((prev) => [...prev, data])
        setNewEventDate(null)
        return null
    }

    return (
        <GeneralShell page="Calendar" section={null} icon="calendar_today">
            <PageHeading
                title="Global Calendar"
                subtitle="View assigned tasks and scheduled company events."
                actions={<PrimaryButton icon="add" onClick={() => setSelectedDate(cursor)}>Add to {cursor.toLocaleDateString([], { day: "numeric", month: "short" })}</PrimaryButton>}
            />

            <div className="grid grid-cols-12 gap-4 items-start">
                <section className="col-span-12 xl:col-span-9 space-y-3">
                    <CalendarToolbar view={view} cursor={cursor} onViewChange={setView} onToday={() => goTo(new Date())} onShift={(n) => setCursor((c) => shiftCursor(view, c, n))} />
                    {view === "month" && <MonthView cursor={cursor} byDay={byDay} todayKey={todayKey} onPickDay={setSelectedDate} renderItem={renderChip} />}
                    {view === "week" && <WeekView days={weekDays(cursor)} byDay={byDay} todayKey={todayKey} renderItem={renderChip} />}
                    {view === "agenda" && <AgendaView events={agendaItems(items, cursor)} renderItem={renderRow} />}
                </section>

                <aside className="col-span-12 xl:col-span-3 space-y-4">
                    <section className="bg-[#14161b] border border-[#2D3139] rounded-xl p-4">
                        <MiniMonth
                            cursor={miniCursor}
                            todayKey={todayKey}
                            onPick={goTo}
                            onShift={(n) => setMiniCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1))}
                        />
                    </section>
                    <Panel title="Coming Up">
                        {upcoming.length === 0
                            ? <p className="text-xs text-[#8c947b]">Nothing in the next {UPCOMING_DAYS} days.</p>
                            : upcoming.map(renderRow)}
                    </Panel>
                    <Legend />
                </aside>
            </div>

            {selectedDate && (
                <DayScheduleDrawer
                    date={selectedDate}
                    items={byDay.get(dayKey(selectedDate)) || []}
                    organizationId={profile?.organization_id}
                    canAddEvent={canManage && Boolean(profile)}
                    onAddEvent={() => setNewEventDate(selectedDate)}
                    onTaskCreated={(task) => setTasks((prev) => [task, ...prev])}
                    onOpenTask={setSelectedTask}
                    onOpenEvent={setOpenEvent}
                    onClose={() => setSelectedDate(null)}
                />
            )}
            {selectedTask && (
                <TaskDetailsDrawer
                    task={selectedTask}
                    onClose={() => setSelectedTask(null)}
                    onSubtasksChange={updateTaskSubtasks}
                    onStatusChange={updateTaskStatus}
                    onPriorityChange={updateTaskPriority}
                />
            )}
            {openEvent && <EventDetail event={openEvent} canEdit={false} onClose={() => setOpenEvent(null)} />}
            {newEventDate && <EventForm event={null} defaultDate={newEventDate} onSubmit={handleCreateEvent} onClose={() => setNewEventDate(null)} />}
        </GeneralShell>
    )
}
