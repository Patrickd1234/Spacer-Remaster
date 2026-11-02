import { useMemo, useState } from "react"
import { dayKey, startOfDay, weekDays, eventsByDay, upcomingEvents, shiftCursor, agendaItems, taskItem } from "../general/generalFormat"
import { MonthView, WeekView, AgendaView, MiniMonth, CalendarToolbar } from "../general/CalendarParts"
import { Panel } from "./DashboardParts"
import { TaskChip, TaskRow } from "./CalendarTaskItems"

const UPCOMING_DAYS = 30
const UPCOMING_LIMIT = 6

function Legend() {
    return (
        <Panel title="Legend">
            <p className="flex items-center gap-2 text-xs text-soft"><span className="w-3 h-3 rounded-sm bg-accent/30 border border-accent-ink/50" />Open tasks (by due date)</p>
            <p className="flex items-center gap-2 text-xs text-soft"><span className="w-3 h-3 rounded-sm bg-green-500/30 border border-green-500/50" />Done</p>
        </Panel>
    )
}

// A project's Calendar tab: its tasks by due date, in the same Month / Week /
// Agenda views as the personal and Company calendars. Clicking a day or a task
// hands it back to the project page, which owns those drawers.
export default function ProjectCalendar({ tasks, onPickDay, onOpenTask }) {
    const [view, setView] = useState("month")
    const [cursor, setCursor] = useState(() => startOfDay(new Date()))
    const [miniCursor, setMiniCursor] = useState(() => startOfDay(new Date()))
    const todayKey = dayKey(new Date())

    const items = useMemo(() => tasks.filter((t) => t.due_date).map(taskItem), [tasks])
    const byDay = useMemo(() => eventsByDay(items), [items])
    const upcoming = useMemo(
        () => upcomingEvents(items.filter((i) => i.task.status !== "done"), new Date(), UPCOMING_DAYS, UPCOMING_LIMIT),
        [items],
    )

    const goTo = (day) => {
        setCursor(startOfDay(day))
        setMiniCursor(startOfDay(day))
    }

    const renderChip = (item) => <TaskChip key={item.id} task={item.task} onOpen={onOpenTask} />
    const renderRow = (item) => <TaskRow key={item.id} item={item} onOpen={onOpenTask} />

    return (
        <div className="grid grid-cols-12 gap-4 items-start" id="section-calendar">
            <section className="col-span-12 xl:col-span-9 space-y-3">
                <CalendarToolbar view={view} cursor={cursor} onViewChange={setView} onToday={() => goTo(new Date())} onShift={(n) => setCursor((c) => shiftCursor(view, c, n))} />
                {view === "month" && <MonthView cursor={cursor} byDay={byDay} todayKey={todayKey} onPickDay={onPickDay} renderItem={renderChip} />}
                {view === "week" && <WeekView days={weekDays(cursor)} byDay={byDay} todayKey={todayKey} renderItem={renderChip} />}
                {view === "agenda" && <AgendaView events={agendaItems(items, cursor)} renderItem={renderRow} />}
            </section>

            <aside className="col-span-12 xl:col-span-3 space-y-4">
                <section className="bg-panel border border-line rounded-xl p-4">
                    <MiniMonth
                        cursor={miniCursor}
                        todayKey={todayKey}
                        onPick={goTo}
                        onShift={(n) => setMiniCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1))}
                    />
                </section>
                <Panel title="Coming Up">
                    {upcoming.length === 0
                        ? <p className="text-xs text-muted">No open tasks due in the next {UPCOMING_DAYS} days.</p>
                        : upcoming.map(renderRow)}
                </Panel>
                <Legend />
            </aside>
        </div>
    )
}
