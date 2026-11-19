// Pure helpers for scheduling meetings (ScheduleMeetingModal) and for showing
// repeating events on calendars. Only imports other pure helpers, so `npm test`
// can load it.
import { dayKey, addDays, eventStart, isHttpsUrl, TITLE_MAX } from "../general/generalFormat.js"

export const DESCRIPTION_MAX = 250
export const AGENDA_MAX_ITEMS = 20
export const AGENDA_TEXT_MAX = 200
const MAX_DURATION_MINUTES = 24 * 60
const SLOT_MINUTES = 30
const DEFAULT_TIME = "09:00"
const DEFAULT_DURATION = 30
const BASE_DURATIONS = [15, 30, 45, 60, 90, 120]
// Safety cap on generated repeats per event, whatever the range
const MAX_OCCURRENCES = 400

const MINUTE_MS = 60 * 1000
const pad = (n) => String(n).padStart(2, "0")
const timeOfDate = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`
const parseDay = (key) => {
    const [y, m, d] = key.split("-").map(Number)
    return new Date(y, m - 1, d)
}

// Unique key for a new agenda row (React list key; not stored)
let agendaSeq = 0
export const newAgendaItem = (text = "", done = false) => ({ key: `agenda-${Date.now()}-${agendaSeq++}`, text, done })

// Today: the next half hour from now. Any other day: 9:00.
function defaultTime(day, now) {
    if (dayKey(day) !== dayKey(now)) return DEFAULT_TIME
    const minutes = now.getHours() * 60 + now.getMinutes()
    const next = Math.min((Math.floor(minutes / SLOT_MINUTES) + 1) * SLOT_MINUTES, 23 * 60 + SLOT_MINUTES)
    return `${pad(Math.floor(next / 60))}:${pad(next % 60)}`
}

export function newMeetingForm(day, now = new Date()) {
    return {
        title: "",
        description: "",
        date: dayKey(day),
        time: defaultTime(day, now),
        duration: DEFAULT_DURATION,
        meetingUrl: "",
        repeat: "none",
        addToMyCalendar: true,
        attendees: [],
        agenda: [],
    }
}

// attendees: [{ kind: "user" | "team", id, name, avatarUrl? }], including the
// organizer when they added the meeting to their own calendar
export function editMeetingForm(event, attendees, selfId) {
    const start = event.starts_at ? new Date(event.starts_at) : parseDay(event.event_date)
    const minutes = event.starts_at && event.ends_at
        ? Math.round((new Date(event.ends_at) - start) / MINUTE_MS)
        : DEFAULT_DURATION
    return {
        title: event.title,
        description: event.description || "",
        date: dayKey(start),
        time: event.starts_at ? timeOfDate(start) : DEFAULT_TIME,
        duration: minutes > 0 ? minutes : DEFAULT_DURATION,
        meetingUrl: event.external_url || "",
        repeat: event.repeat || "none",
        addToMyCalendar: attendees.some((a) => a.kind === "user" && a.id === selfId),
        attendees: attendees.filter((a) => !(a.kind === "user" && a.id === selfId)),
        agenda: (event.agenda || []).map((item) => newAgendaItem(item.text, item.done)),
    }
}

const cleanAgenda = (agenda) => agenda
    .map((item) => ({ text: item.text.trim(), done: Boolean(item.done) }))
    .filter((item) => item.text)

const startOf = (form) => new Date(`${form.date}T${form.time}`)

// isNew: a new meeting can't start in the past; an edited one may already have
export function validateMeeting(form, now = new Date(), { isNew = true } = {}) {
    if (!form.title.trim()) return "Add a meeting title."
    if (form.title.trim().length > TITLE_MAX) return `Keep the title under ${TITLE_MAX} characters.`
    if (form.description.length > DESCRIPTION_MAX) return `Keep the description under ${DESCRIPTION_MAX} characters.`
    if (!form.date) return "Pick a date."
    if (!form.time) return "Pick a start time."
    if (Number.isNaN(startOf(form).getTime())) return "That date or time isn't valid."
    if (!(form.duration > 0 && form.duration <= MAX_DURATION_MINUTES)) return "Pick a duration."
    if (isNew && startOf(form) < now) return "That time is in the past. Pick a later one."
    if (form.meetingUrl.trim() && !isHttpsUrl(form.meetingUrl.trim())) return "Meeting links must start with https://"
    const agenda = cleanAgenda(form.agenda)
    if (agenda.length > AGENDA_MAX_ITEMS) return `The agenda can have at most ${AGENDA_MAX_ITEMS} items.`
    if (agenda.some((item) => item.text.length > AGENDA_TEXT_MAX)) return `Keep each agenda item under ${AGENDA_TEXT_MAX} characters.`
    if (form.attendees.length === 0) return "Invite at least one person or department."
    return null
}

// The calendar_events row for a validated form
export function meetingRow(form) {
    const start = startOf(form)
    return {
        title: form.title.trim(),
        description: form.description.trim() || null,
        event_date: form.date,
        starts_at: start.toISOString(),
        ends_at: new Date(start.getTime() + form.duration * MINUTE_MS).toISOString(),
        category: "meeting",
        external_url: form.meetingUrl.trim() || null,
        audience: "invited",
        agenda: cleanAgenda(form.agenda),
        repeat: form.repeat,
    }
}

export function formatDuration(minutes) {
    const hours = Math.floor(minutes / 60)
    const rest = minutes % 60
    if (hours === 0) return `${rest} mins`
    const hourText = `${hours} hr${hours > 1 ? "s" : ""}`
    return rest ? `${hourText} ${rest} mins` : hourText
}

// The standard lengths, plus `current` when it is something else
export function durationOptions(current) {
    const values = BASE_DURATIONS.includes(current) || !(current > 0) ? BASE_DURATIONS : [...BASE_DURATIONS, current].sort((a, b) => a - b)
    return values.map((value) => ({ value, label: formatDuration(value) }))
}

export function repeatOptions(date) {
    const day = date ? parseDay(date) : null
    return [
        { value: "none", label: "Does not repeat" },
        { value: "daily", label: "Daily" },
        { value: "weekly", label: day ? `Weekly on ${day.toLocaleDateString("en-US", { weekday: "long" })}` : "Weekly" },
        { value: "monthly", label: day ? `Monthly on day ${day.getDate()}` : "Monthly" },
    ]
}

export const repeatLabel = (event) => repeatOptions(event.event_date).find((o) => o.value === event.repeat)?.label ?? null

// ---------------------------------------------------------------------------
// Repeating events
// ---------------------------------------------------------------------------

// The stored event an item came from (repeats carry their original's id)
export const baseEventId = (event) => event.occurrence_of ?? event.id

// The nth repeat's day, or null when it doesn't exist (no 31 February)
function nthDay(first, repeat, n) {
    if (repeat === "daily") return addDays(first, n)
    if (repeat === "weekly") return addDays(first, n * 7)
    const day = new Date(first.getFullYear(), first.getMonth() + n, first.getDate())
    return day.getDate() === first.getDate() ? day : null
}

// The first n whose repeat could fall on or after `from`
function firstIndex(first, repeat, from) {
    const days = Math.floor((from - first) / (24 * 60 * MINUTE_MS))
    if (days <= 0) return 0
    if (repeat === "daily") return days
    if (repeat === "weekly") return Math.floor(days / 7)
    return Math.max(0, (from.getFullYear() - first.getFullYear()) * 12 + from.getMonth() - first.getMonth() - 1)
}

function occurrence(event, first, day) {
    const key = dayKey(day)
    if (!event.starts_at) return { ...event, id: `${event.id}@${key}`, occurrence_of: event.id, event_date: key }
    const start = new Date(event.starts_at)
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), start.getHours(), start.getMinutes())
    const length = event.ends_at ? new Date(event.ends_at) - start : null
    return {
        ...event,
        id: `${event.id}@${key}`,
        occurrence_of: event.id,
        event_date: key,
        starts_at: at.toISOString(),
        ends_at: length === null ? null : new Date(at.getTime() + length).toISOString(),
    }
}

// Every repeating event becomes one item per repeat whose day falls between
// `from` and `to` (inclusive, local days). One-off events pass through untouched.
export function expandRecurring(events, from, to) {
    const fromDay = new Date(from.getFullYear(), from.getMonth(), from.getDate())
    const toKey = dayKey(to)
    return events.flatMap((event) => {
        if (!event.repeat || event.repeat === "none") return [event]
        const startDate = eventStart(event)
        const first = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate())
        const out = []
        for (let n = firstIndex(first, event.repeat, fromDay), count = 0; count < MAX_OCCURRENCES; n++, count++) {
            const day = nthDay(first, event.repeat, n)
            if (!day) continue
            const key = dayKey(day)
            if (key > toKey) break
            if (day >= fromDay) out.push(occurrence(event, first, day))
        }
        return out
    })
}

// ---------------------------------------------------------------------------
// Attendees
// ---------------------------------------------------------------------------

const ATTENDEE_RESULTS = 8
export const attendeeKey = (a) => `${a.kind}:${a.id}`

// People (by name or email) then departments (by name) matching `query`,
// leaving out those already chosen and the organizer
export function searchAttendees(people, teams, query, chosen, selfId) {
    const needle = query.trim().toLowerCase()
    const taken = new Set(chosen.map(attendeeKey))
    const matches = (text) => (text || "").toLowerCase().includes(needle)
    const personOptions = people
        .filter((p) => p.id !== selfId && !taken.has(`user:${p.id}`) && (matches(p.name) || matches(p.email)))
        .map((p) => ({ kind: "user", id: p.id, name: p.name || p.email, detail: p.job_title || p.email, avatarUrl: p.avatarUrl ?? null }))
    const teamOptions = teams
        .filter((t) => !taken.has(`team:${t.id}`) && matches(t.name))
        .map((t) => ({ kind: "team", id: t.id, name: t.name, detail: "Department" }))
    return [...personOptions, ...teamOptions].slice(0, ATTENDEE_RESULTS)
}

export function attendeeChanges(before, after) {
    const beforeKeys = new Set(before.map(attendeeKey))
    const afterKeys = new Set(after.map(attendeeKey))
    return {
        added: after.filter((a) => !beforeKeys.has(attendeeKey(a))),
        removed: before.filter((a) => !afterKeys.has(attendeeKey(a))),
    }
}
