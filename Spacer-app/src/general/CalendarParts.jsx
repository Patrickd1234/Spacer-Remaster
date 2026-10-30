import { useState } from "react"
import {
    EVENT_CATEGORIES, TONE_CLASSES, categoryOf, formatEventTime, meetingPlatform, monthGrid,
    dayKey, eventStart, isAllDay, validateEvent, CALENDAR_VIEWS, rangeLabel,
} from "./generalFormat"
import { DateBadge, Modal, Field, INPUT_CLASS, PrimaryButton, SecondaryButton, ErrorNote, CategoryTag, Chip } from "./GeneralParts"

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MAX_CHIPS_PER_DAY = 3

// Month / Week / Agenda chips, Today, previous/next and the period heading
export function CalendarToolbar({ view, cursor, onViewChange, onToday, onShift }) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1" role="group" aria-label="Calendar view">
                {CALENDAR_VIEWS.map((v) => <Chip key={v.value} isActive={view === v.value} onClick={() => onViewChange(v.value)}>{v.label}</Chip>)}
            </div>
            <SecondaryButton onClick={onToday}>Today</SecondaryButton>
            <button type="button" aria-label="Previous" onClick={() => onShift(-1)} className="text-[#8c947b] hover:text-white cursor-pointer"><span className="material-symbols-outlined">chevron_left</span></button>
            <button type="button" aria-label="Next" onClick={() => onShift(1)} className="text-[#8c947b] hover:text-white cursor-pointer"><span className="material-symbols-outlined">chevron_right</span></button>
            <h2 className="text-sm font-semibold text-white">{rangeLabel(view, cursor)}</h2>
        </div>
    )
}

// One event inside a calendar cell: time + title, coloured by category (label in the title attribute)
export function EventChip({ event, onOpen }) {
    const category = categoryOf(EVENT_CATEGORIES, event.category)
    return (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpen(event) }}
            title={`${category.label}: ${event.title}`}
            className={`w-full text-left px-1.5 py-1 rounded-md border text-[11px] leading-tight truncate cursor-pointer ${TONE_CLASSES[category.tone]}`}
        >
            {!isAllDay(event) && <span className="opacity-80">{new Date(event.starts_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} </span>}
            {event.title}
        </button>
    )
}

// The views take calendar items: events, or anything shaped like one ({ id,
// title, event_date, starts_at? }). renderItem draws one inside a day.
const defaultRenderItem = (onOpenEvent) => (event) => <EventChip key={event.id} event={event} onOpen={onOpenEvent} />

export function MonthView({ cursor, byDay, todayKey, onOpenEvent, onPickDay, renderItem = defaultRenderItem(onOpenEvent) }) {
    return (
        <div className="rounded-xl border border-[#2D3139] overflow-hidden">
            <div className="grid grid-cols-7 bg-[#14161b] border-b border-[#2D3139]">
                {WEEKDAYS.map((d) => <div key={d} className="px-2 py-2 text-[11px] font-medium text-[#8c947b] text-center">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
                {monthGrid(cursor).map((day) => {
                    const key = dayKey(day)
                    const events = byDay.get(key) || []
                    const inMonth = day.getMonth() === cursor.getMonth()
                    return (
                        <div
                            key={key}
                            onClick={() => onPickDay(day)}
                            className={`min-h-[104px] p-1.5 border-r border-b border-[#2D3139] space-y-1 cursor-pointer hover:bg-[#191c21] ${inMonth ? "" : "bg-[#0c0d10]"}`}
                        >
                            <span className={`inline-flex w-6 h-6 items-center justify-center rounded-full text-xs ${key === todayKey ? "bg-[#aff82a] text-[#1C1F26] font-semibold" : inMonth ? "text-[#c4c9b8]" : "text-[#5a5f52]"}`}>
                                {day.getDate()}
                            </span>
                            {events.slice(0, MAX_CHIPS_PER_DAY).map(renderItem)}
                            {events.length > MAX_CHIPS_PER_DAY && <p className="text-[10px] text-[#8c947b] px-1">+{events.length - MAX_CHIPS_PER_DAY} more</p>}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

export function WeekView({ days, byDay, todayKey, onOpenEvent, renderItem = defaultRenderItem(onOpenEvent) }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-7 rounded-xl border border-[#2D3139] overflow-hidden">
            {days.map((day) => {
                const key = dayKey(day)
                const events = byDay.get(key) || []
                return (
                    <div key={key} className="min-h-[320px] p-2 border-r border-[#2D3139] last:border-r-0 space-y-1.5">
                        <p className={`text-xs font-medium ${key === todayKey ? "text-[#aff82a]" : "text-[#8c947b]"}`}>
                            {WEEKDAYS[day.getDay()]} {day.getDate()}
                        </p>
                        {events.map(renderItem)}
                    </div>
                )
            })}
        </div>
    )
}

export function EventListItem({ event, onOpen }) {
    const platform = meetingPlatform(event.external_url)
    return (
        <button type="button" onClick={() => onOpen(event)} className="w-full text-left flex items-center gap-3 p-2 rounded-lg hover:bg-[#191c21] cursor-pointer">
            <DateBadge event={event} />
            <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white truncate">{event.title}</p>
                <p className="text-[11px] text-[#8c947b] flex items-center gap-2">
                    <span>{formatEventTime(event)}</span>
                    {platform && <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[13px]">videocam</span>{platform}</span>}
                </p>
            </div>
            <CategoryTag categories={EVENT_CATEGORIES} value={event.category} />
        </button>
    )
}

// Agenda: events grouped under each day that has any
// renderItem draws one row; defaults to an event row
export function AgendaView({ events, onOpenEvent, renderItem = (e) => <EventListItem key={e.id} event={e} onOpen={onOpenEvent} /> }) {
    const days = [...new Set(events.map((e) => dayKey(eventStart(e))))]
    if (days.length === 0) return <p className="text-sm text-[#8c947b] py-8 text-center">No events in this period.</p>
    return (
        <div className="space-y-4">
            {days.map((key) => (
                <section key={key} className="space-y-1">
                    <h3 className="text-xs font-semibold text-[#8c947b]">
                        {eventStart(events.find((e) => dayKey(eventStart(e)) === key)).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}
                    </h3>
                    {events.filter((e) => dayKey(eventStart(e)) === key).map(renderItem)}
                </section>
            ))}
        </div>
    )
}

export function MiniMonth({ cursor, todayKey, onPick, onShift }) {
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white">{cursor.toLocaleDateString([], { month: "long", year: "numeric" })}</p>
                <div className="flex">
                    <button type="button" aria-label="Previous month" onClick={() => onShift(-1)} className="text-[#8c947b] hover:text-white cursor-pointer"><span className="material-symbols-outlined text-[18px]">chevron_left</span></button>
                    <button type="button" aria-label="Next month" onClick={() => onShift(1)} className="text-[#8c947b] hover:text-white cursor-pointer"><span className="material-symbols-outlined text-[18px]">chevron_right</span></button>
                </div>
            </div>
            <div className="grid grid-cols-7 gap-y-1 text-center">
                {WEEKDAYS.map((d) => <span key={d} className="text-[10px] text-[#8c947b]">{d.slice(0, 2)}</span>)}
                {monthGrid(cursor).map((day) => {
                    const key = dayKey(day)
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => onPick(day)}
                            aria-label={day.toDateString()}
                            className={`mx-auto w-7 h-7 rounded-full text-[11px] cursor-pointer ${key === todayKey ? "bg-[#aff82a] text-[#1C1F26] font-semibold" : day.getMonth() === cursor.getMonth() ? "text-[#c4c9b8] hover:bg-[#2D3139]" : "text-[#5a5f52] hover:bg-[#2D3139]"}`}
                        >
                            {day.getDate()}
                        </button>
                    )
                })}
            </div>
        </div>
    )
}

export function EventDetail({ event, canEdit, onEdit, onDelete, onClose }) {
    const platform = meetingPlatform(event.external_url)
    return (
        <Modal title={event.title} onClose={onClose}>
            <div className="space-y-3 text-sm text-[#c4c9b8]">
                <CategoryTag categories={EVENT_CATEGORIES} value={event.category} />
                <p className="flex items-center gap-2"><span className="material-symbols-outlined text-[16px]">calendar_today</span>{eventStart(event).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
                <p className="flex items-center gap-2"><span className="material-symbols-outlined text-[16px]">schedule</span>{formatEventTime(event)}</p>
                {platform && (
                    <a href={event.external_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-[#aff82a] hover:underline">
                        <span className="material-symbols-outlined text-[16px]">videocam</span>Join on {platform}
                    </a>
                )}
                {event.description && <p className="whitespace-pre-line pt-2 border-t border-[#2D3139]">{event.description}</p>}
                {canEdit && (
                    <div className="flex gap-2 pt-3 border-t border-[#2D3139]">
                        <button type="button" onClick={onEdit} className="text-xs hover:text-white flex items-center gap-1 cursor-pointer"><span className="material-symbols-outlined text-[16px]">edit</span>Edit</button>
                        <button type="button" onClick={onDelete} className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 cursor-pointer ml-auto"><span className="material-symbols-outlined text-[16px]">delete</span>Delete</button>
                    </div>
                )}
            </div>
        </Modal>
    )
}

const timeOf = (iso) => (iso ? new Date(iso).toTimeString().slice(0, 5) : "")

function initialForm(event, date) {
    if (!event) return { title: "", description: "", date: dayKey(date), allDay: false, startTime: "09:00", endTime: "10:00", category: "meeting", meetingUrl: "" }
    return {
        title: event.title,
        description: event.description || "",
        // The viewer's own day for timed events, so date + time rebuild the same instant on save
        date: event.starts_at ? dayKey(new Date(event.starts_at)) : event.event_date,
        allDay: isAllDay(event),
        startTime: timeOf(event.starts_at),
        endTime: timeOf(event.ends_at),
        category: event.category,
        meetingUrl: event.external_url || "",
    }
}

// Add (event null) or edit an event
export function EventForm({ event, defaultDate, onSubmit, onClose }) {
    const [form, setForm] = useState(() => initialForm(event, defaultDate))
    const [errorMsg, setErrorMsg] = useState("")
    const [isSaving, setIsSaving] = useState(false)
    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === "checkbox" ? e.target.checked : e.target.value }))

    const handleSubmit = async (e) => {
        e.preventDefault()
        const invalid = validateEvent(form)
        setErrorMsg(invalid || "")
        if (invalid) return
        setIsSaving(true)
        const error = await onSubmit(form)
        setIsSaving(false)
        if (error) setErrorMsg("Couldn't save the event. Please try again.")
    }

    return (
        <Modal title={event ? "Edit event" : "Add event"} onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <Field label="Title"><input className={INPUT_CLASS} value={form.title} onChange={set("title")} maxLength={200} required /></Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Date"><input type="date" className={INPUT_CLASS} value={form.date} onChange={set("date")} required /></Field>
                    <Field label="Category">
                        <select className={INPUT_CLASS} value={form.category} onChange={set("category")}>
                            {EVENT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                    </Field>
                </div>
                <label className="flex items-center gap-2 text-sm text-[#c4c9b8]">
                    <input type="checkbox" checked={form.allDay} onChange={set("allDay")} className="accent-[#aff82a]" />
                    All day
                </label>
                {!form.allDay && (
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Starts"><input type="time" className={INPUT_CLASS} value={form.startTime} onChange={set("startTime")} /></Field>
                        <Field label="Ends"><input type="time" className={INPUT_CLASS} value={form.endTime} onChange={set("endTime")} /></Field>
                    </div>
                )}
                <Field label="Meeting link" hint="Optional. Must start with https://">
                    <input type="url" className={INPUT_CLASS} value={form.meetingUrl} onChange={set("meetingUrl")} placeholder="https://zoom.us/j/…" />
                </Field>
                <Field label="Details"><textarea className={`${INPUT_CLASS} min-h-[80px]`} value={form.description} onChange={set("description")} /></Field>
                {errorMsg && <ErrorNote>{errorMsg}</ErrorNote>}
                <div className="flex justify-end">
                    <PrimaryButton type="submit" icon="event" disabled={isSaving}>{isSaving ? "Saving…" : "Save event"}</PrimaryButton>
                </div>
            </form>
        </Modal>
    )
}
