// Pure helpers for the General Space pages (Overview, Announcements,
// Company Calendar, Directory). No imports, so `npm test` can load them.

export const ANNOUNCEMENT_CATEGORIES = [
    { value: "company_update", label: "Company Updates", tone: "blue" },
    { value: "policy", label: "Policy & Guidelines", tone: "orange" },
    { value: "event", label: "Events", tone: "green" },
    { value: "people_culture", label: "People & Culture", tone: "purple" },
]

export const EVENT_CATEGORIES = [
    { value: "meeting", label: "Meeting", tone: "blue" },
    { value: "holiday", label: "Holiday", tone: "purple" },
    { value: "training", label: "Training", tone: "green" },
    { value: "social", label: "Social", tone: "pink" },
    { value: "review", label: "Review", tone: "orange" },
    { value: "other", label: "Other", tone: "gray" },
]

// Tag colours; every tag also shows its label, so colour is never the only cue
export const TONE_CLASSES = {
    blue: "bg-blue-500/10 text-blue-300 border-blue-500/30",
    orange: "bg-orange-500/10 text-orange-300 border-orange-500/30",
    green: "bg-accent/10 text-accent-ink border-accent-ink/30",
    purple: "bg-purple-500/10 text-purple-300 border-purple-500/30",
    pink: "bg-pink-500/10 text-pink-300 border-pink-500/30",
    gray: "bg-line text-soft border-line-strong",
}

export const TITLE_MAX = 200

export function categoryOf(categories, value) {
    return categories.find((c) => c.value === value) || categories[categories.length - 1]
}

// "Google Meet", "Zoom", … from a meeting link; null when there is no usable link
export function meetingPlatform(url) {
    if (!url) return null
    let host
    try {
        const parsed = new URL(url)
        if (parsed.protocol !== "https:") return null
        host = parsed.hostname.toLowerCase()
    } catch {
        return null
    }
    if (host === "meet.google.com") return "Google Meet"
    if (host === "zoom.us" || host.endsWith(".zoom.us")) return "Zoom"
    if (host === "teams.microsoft.com" || host === "teams.live.com") return "Microsoft Teams"
    return "Online meeting"
}

export function isHttpsUrl(value) {
    return meetingPlatform(value) !== null
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

// filter: "all" | "pinned" | a category value
export function filterAnnouncements(list, filter) {
    if (filter === "all") return list
    if (filter === "pinned") return list.filter((a) => a.pinned)
    return list.filter((a) => a.category === filter)
}

// sort: "latest" | "oldest"
export function sortAnnouncements(list, sort) {
    const direction = sort === "oldest" ? 1 : -1
    return [...list].sort((a, b) => direction * (new Date(a.created_at) - new Date(b.created_at)))
}

export function validateAnnouncement({ title, body, meetingUrl, startsAt, endsAt }) {
    if (!title.trim()) return "Add a title."
    if (title.trim().length > TITLE_MAX) return `Keep the title under ${TITLE_MAX} characters.`
    if (!body.trim()) return "Add the announcement text."
    if (meetingUrl.trim() && !isHttpsUrl(meetingUrl.trim())) return "Meeting links must start with https://"
    if (startsAt && endsAt && new Date(endsAt) < new Date(startsAt)) return "The end time is before the start time."
    return null
}

// ---------------------------------------------------------------------------
// Dates and events
// ---------------------------------------------------------------------------

// Local calendar day as YYYY-MM-DD (not UTC, so late-evening events stay on their day)
export function dayKey(date) {
    const pad = (n) => String(n).padStart(2, "0")
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseDayKey(key) {
    const [y, m, d] = key.split("-").map(Number)
    return new Date(y, m - 1, d)
}

export function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addDays(date, days) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

export function isAllDay(event) {
    return !event.starts_at
}

export function eventStart(event) {
    return event.starts_at ? new Date(event.starts_at) : parseDayKey(event.event_date)
}

export function eventDayKey(event) {
    return event.starts_at ? dayKey(new Date(event.starts_at)) : event.event_date
}

function formatTime(date) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
}

export function formatEventTime(event) {
    if (isAllDay(event)) return "All day"
    const start = formatTime(new Date(event.starts_at))
    return event.ends_at ? `${start} – ${formatTime(new Date(event.ends_at))}` : start
}

// Events from today through `days` days ahead, soonest first
export function upcomingEvents(events, now = new Date(), days = 30, limit = Infinity) {
    const from = startOfDay(now)
    const until = addDays(from, days)
    return events
        .filter((e) => {
            const start = eventStart(e)
            const end = e.ends_at ? new Date(e.ends_at) : start
            return end >= from && start < until && (isAllDay(e) || end >= now)
        })
        .sort((a, b) => eventStart(a) - eventStart(b))
        .slice(0, limit)
}

export function eventsByDay(events) {
    const byDay = new Map()
    for (const event of [...events].sort((a, b) => eventStart(a) - eventStart(b))) {
        const key = eventDayKey(event)
        byDay.set(key, [...(byDay.get(key) || []), event])
    }
    return byDay
}

// A task due on a day, shaped like an all-day calendar item so the shared views
// can place it. Only for tasks that have a due_date.
export const taskItem = (task) => ({
    id: `task-${task.id}`,
    kind: "task",
    title: task.title,
    description: task.description,
    event_date: task.due_date.slice(0, 10),
    starts_at: null,
    task,
})

// Six Sunday-first weeks covering the month of `date`
export function monthGrid(date) {
    const first = new Date(date.getFullYear(), date.getMonth(), 1)
    const gridStart = addDays(first, -first.getDay())
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i))
}

// Sunday-first week containing `date`
export function weekDays(date) {
    const start = addDays(startOfDay(date), -date.getDay())
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

export function validateEvent({ title, date, startTime, endTime, allDay, meetingUrl }) {
    if (!title.trim()) return "Add a title."
    if (title.trim().length > TITLE_MAX) return `Keep the title under ${TITLE_MAX} characters.`
    if (!date) return "Pick a date."
    if (!allDay && !startTime) return "Add a start time, or mark it as all day."
    if (!allDay && endTime && endTime < startTime) return "The end time is before the start time."
    if (meetingUrl.trim() && !isHttpsUrl(meetingUrl.trim())) return "Meeting links must start with https://"
    return null
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export function initials(name) {
    return (name || "?").trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?"
}

// query matches name, job title, email or team name; teamId and jobTitle are exact
export function filterPeople(people, { query = "", teamId = "all", jobTitle = "all" }) {
    const needle = query.trim().toLowerCase()
    return people.filter((person) => {
        if (teamId !== "all" && !person.teams.some((t) => t.id === teamId)) return false
        if (jobTitle !== "all" && person.job_title !== jobTitle) return false
        if (!needle) return true
        const haystack = [person.name, person.job_title, person.email, ...person.teams.map((t) => t.name)]
        return haystack.some((value) => value?.toLowerCase().includes(needle))
    })
}

const DEPARTMENT_ADMIN_ROLES = new Set(["admin", "super_admin"])

// Who the directory lists. Super admins see everyone. Admins see the people in
// the departments they are admin of; everyone else sees the people in their own
// departments. The viewer is always listed, and the team filter only offers
// departments in that scope.
export function scopeDirectory(people, teams, { viewerId, isSuperAdmin }) {
    if (isSuperAdmin) return { people, teams }
    const myTeams = people.find((p) => p.id === viewerId)?.teams || []
    const adminTeams = myTeams.filter((t) => DEPARTMENT_ADMIN_ROLES.has(t.role))
    const scope = new Set((adminTeams.length > 0 ? adminTeams : myTeams).map((t) => t.id))
    return {
        people: people.filter((p) => p.id === viewerId || p.teams.some((t) => scope.has(t.id))),
        teams: teams.filter((t) => scope.has(t.id)),
    }
}

export function sortPeople(people, order) {
    const direction = order === "za" ? -1 : 1
    return [...people].sort((a, b) => direction * (a.name || "").localeCompare(b.name || ""))
}

// ---------------------------------------------------------------------------
// Calendar navigation (Month / Week / Agenda)
// ---------------------------------------------------------------------------

export const AGENDA_DAYS = 30
export const CALENDAR_VIEWS = [{ value: "month", label: "Month" }, { value: "week", label: "Week" }, { value: "agenda", label: "Agenda" }]

// First and last day the view shows
export function visibleRange(view, cursor) {
    if (view === "month") {
        const grid = monthGrid(cursor)
        return [grid[0], grid[grid.length - 1]]
    }
    if (view === "week") {
        const days = weekDays(cursor)
        return [days[0], days[6]]
    }
    return [startOfDay(cursor), addDays(cursor, AGENDA_DAYS - 1)]
}

// One month, week or agenda period forward (direction 1) or back (-1)
export function shiftCursor(view, cursor, direction) {
    if (view === "month") return new Date(cursor.getFullYear(), cursor.getMonth() + direction, 1)
    return addDays(cursor, direction * (view === "week" ? 7 : AGENDA_DAYS))
}

export function rangeLabel(view, cursor) {
    if (view === "month") return cursor.toLocaleDateString([], { month: "long", year: "numeric" })
    const [from, to] = visibleRange(view, cursor)
    const short = (d) => d.toLocaleDateString([], { day: "numeric", month: "short" })
    return `${short(from)} – ${short(to)}, ${to.getFullYear()}`
}

// Items in the agenda period, soonest first
export function agendaItems(items, cursor) {
    const [start, end] = visibleRange("agenda", cursor)
    const until = addDays(end, 1)
    return items.filter((e) => eventStart(e) >= start && eventStart(e) < until).sort((a, b) => eventStart(a) - eventStart(b))
}
