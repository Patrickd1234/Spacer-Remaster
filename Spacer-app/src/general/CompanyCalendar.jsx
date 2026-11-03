import { useCallback, useEffect, useMemo, useState } from "react"
import { dayKey, startOfDay, addDays, weekDays, eventsByDay, upcomingEvents, eventStart, visibleRange, shiftCursor, agendaItems } from "./generalFormat"
import { fetchEvents, createEvent, updateEvent, deleteEvent } from "./generalData"
import { useMyProfile } from "./useMyProfile"
import { GeneralShell, PageHeading, PrimaryButton, SecondaryButton, ErrorNote } from "./GeneralParts"
import { Panel } from "../components/DashboardParts"
import { MonthView, WeekView, AgendaView, MiniMonth, EventListItem, EventDetail, EventForm, CalendarToolbar } from "./CalendarParts"

const UPCOMING_DAYS = 30
const UPCOMING_LIMIT = 5

// Screen 3: organization events. Org admins add events; admins and the
// person who added an event can edit or delete it.
export default function CompanyCalendar() {
    const { profile, canManage } = useMyProfile()
    const [view, setView] = useState("month")
    const [cursor, setCursor] = useState(() => startOfDay(new Date()))
    const [miniCursor, setMiniCursor] = useState(() => startOfDay(new Date()))
    const [events, setEvents] = useState([])
    const [status, setStatus] = useState("loading")
    const [openEvent, setOpenEvent] = useState(null)
    const [editing, setEditing] = useState(null) // null | { event, date }
    const [actionError, setActionError] = useState("")
    const today = startOfDay(new Date())
    const todayKey = dayKey(today)

    // One fetch covers the visible range plus the Upcoming list
    const [from, to] = useMemo(() => {
        const [start, end] = visibleRange(view, cursor)
        const upcomingEnd = addDays(today, UPCOMING_DAYS)
        return [start < today ? start : today, end > upcomingEnd ? end : upcomingEnd]
        // eslint-disable-next-line react-hooks/exhaustive-deps -- `today` only changes at midnight
    }, [view, cursor, todayKey])

    const load = useCallback(async () => {
        const { data, error } = await fetchEvents(from, to)
        setEvents(data)
        setStatus(error ? "error" : "ready")
    }, [from, to])

    useEffect(() => {
        let active = true
        fetchEvents(from, to).then(({ data, error }) => {
            if (!active) return
            setEvents(data)
            setStatus(error ? "error" : "ready")
        })
        return () => { active = false }
    }, [from, to])

    const byDay = useMemo(() => eventsByDay(events), [events])
    const upcoming = useMemo(() => upcomingEvents(events, new Date(), UPCOMING_DAYS, UPCOMING_LIMIT), [events])
    const agendaEvents = useMemo(() => agendaItems(events, cursor), [events, cursor])
    const canEdit = (event) => canManage || event.created_by === profile?.id

    const goTo = (day) => {
        setCursor(startOfDay(day))
        setMiniCursor(startOfDay(day))
    }

    const handleSave = async (form) => {
        const { error } = editing.event ? await updateEvent(editing.event.id, form) : await createEvent(profile, form)
        if (error) return error
        setEditing(null)
        setOpenEvent(null)
        await load()
        return null
    }

    const handleDelete = async (event) => {
        if (!window.confirm(`Delete "${event.title}"?`)) return
        setActionError("")
        const { error } = await deleteEvent(event.id)
        if (error) {
            setActionError("Couldn't delete the event.")
            return
        }
        setOpenEvent(null)
        await load()
    }

    return (
        <GeneralShell page="Company Calendar">
            <PageHeading
                title="Company Calendar"
                subtitle="Keep track of important dates and events across your organization."
                actions={canManage && profile && <PrimaryButton icon="add" onClick={() => setEditing({ event: null, date: cursor })}>Add Event</PrimaryButton>}
            />

            {status === "error" && <ErrorNote onRetry={load}>Couldn't load events.</ErrorNote>}
            {actionError && <ErrorNote>{actionError}</ErrorNote>}

            <div className="grid grid-cols-12 gap-4 items-start">
                <section className="col-span-12 xl:col-span-9 space-y-3">
                    <CalendarToolbar view={view} cursor={cursor} onViewChange={setView} onToday={() => goTo(today)} onShift={(n) => setCursor((c) => shiftCursor(view, c, n))} />

                    {view === "month" && (
                        <MonthView
                            cursor={cursor}
                            byDay={byDay}
                            todayKey={todayKey}
                            onOpenEvent={setOpenEvent}
                            onPickDay={(day) => { goTo(day); setView("week") }}
                        />
                    )}
                    {view === "week" && <WeekView days={weekDays(cursor)} byDay={byDay} todayKey={todayKey} onOpenEvent={setOpenEvent} />}
                    {view === "agenda" && <AgendaView events={agendaEvents} onOpenEvent={setOpenEvent} />}
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
                    <Panel title="Upcoming Events">
                        {upcoming.length === 0
                            ? <p className="text-xs text-muted">Nothing in the next {UPCOMING_DAYS} days.</p>
                            : upcoming.map((e) => <EventListItem key={e.id} event={e} onOpen={setOpenEvent} />)}
                    </Panel>
                    <Panel title="Calendar Integrations">
                        <p className="text-xs text-muted">Sync with your external calendar to keep all your events in one place.</p>
                        <SecondaryButton icon="link" disabled title="Coming soon">Connect Calendar (coming soon)</SecondaryButton>
                    </Panel>
                </aside>
            </div>

            {openEvent && !editing && (
                <EventDetail
                    event={openEvent}
                    canEdit={canEdit(openEvent)}
                    onClose={() => setOpenEvent(null)}
                    onEdit={() => setEditing({ event: openEvent, date: eventStart(openEvent) })}
                    onDelete={() => handleDelete(openEvent)}
                />
            )}
            {editing && <EventForm event={editing.event} defaultDate={editing.date} onSubmit={handleSave} onClose={() => setEditing(null)} />}
        </GeneralShell>
    )
}
