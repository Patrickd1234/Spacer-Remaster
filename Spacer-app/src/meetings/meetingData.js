import { supabase } from "../supabase"
import { fetchPeople } from "../general/generalData"
import { dayKey, eventStart } from "../general/generalFormat"
import { meetingRow, attendeeChanges, expandRecurring } from "./meetingFormat"

// Reads and writes for meetings (calendar_events with audience 'invited') and
// their guest lists. Row-level security (migration 20261119090000) lets anyone
// schedule a meeting as themselves and shows it only to the organizer and the
// attendees. Every function returns { data, error } and never throws.

const MEETING_FIELDS = "id, title, description, event_date, starts_at, ends_at, category, external_url, created_by, audience, agenda, repeat"
const ATTENDEE_FIELDS = "user_id, team_space_id, user:users!calendar_event_attendees_user_id_fkey(id, name, email), team:team_spaces(name)"

// Everyone and every department the organizer can invite
export async function fetchInvitees() {
    const { data, teams, error } = await fetchPeople()
    return { data: { people: data, teams }, error }
}

// [{ kind, id, name }] for one event. Members can only read departments they
// belong to, so `teams` (fetchInvitees) fills in the other names when given.
export async function fetchAttendees(eventId, teams = []) {
    const { data, error } = await supabase.from("calendar_event_attendees").select(ATTENDEE_FIELDS).eq("event_id", eventId)
    if (error) {
        console.error("Loading attendees failed:", error)
        return { data: [], error }
    }
    const teamName = new Map(teams.map((t) => [t.id, t.name]))
    const attendees = (data || []).map((row) => (row.user_id
        ? { kind: "user", id: row.user_id, name: row.user?.name || row.user?.email || "Someone" }
        : { kind: "team", id: row.team_space_id, name: teamName.get(row.team_space_id) || row.team?.name || "A department" }))
    return { data: attendees, error: null }
}

const attendeeRow = (eventId, userId) => (a) => ({
    event_id: eventId,
    user_id: a.kind === "user" ? a.id : null,
    team_space_id: a.kind === "team" ? a.id : null,
    added_by: userId,
})

// The guest list to store: the chosen attendees, plus the organizer when they
// added the meeting to their own calendar
const guestList = (form, userId) => (form.addToMyCalendar ? [...form.attendees, { kind: "user", id: userId }] : form.attendees)

async function addAttendees(eventId, attendees, userId) {
    if (attendees.length === 0) return null
    const { error } = await supabase.from("calendar_event_attendees").insert(attendees.map(attendeeRow(eventId, userId)))
    if (error) console.error("Adding attendees failed:", error)
    return error
}

async function removeAttendees(eventId, attendees) {
    for (const kind of ["user", "team"]) {
        const ids = attendees.filter((a) => a.kind === kind).map((a) => a.id)
        if (ids.length === 0) continue
        const column = kind === "user" ? "user_id" : "team_space_id"
        const { error } = await supabase.from("calendar_event_attendees").delete().eq("event_id", eventId).in(column, ids)
        if (error) {
            console.error("Removing attendees failed:", error)
            return error
        }
    }
    return null
}

// organizer: { id, organization_id }. The meeting is removed again when its
// guest list can't be saved, so no one is left with a half-made meeting.
export async function createMeeting(organizer, form) {
    const { data: event, error } = await supabase.from("calendar_events")
        .insert({ ...meetingRow(form), organization_id: organizer.organization_id, created_by: organizer.id })
        .select(MEETING_FIELDS).single()
    if (error) {
        console.error("Scheduling meeting failed:", error)
        return { data: null, error }
    }
    const attendeeError = await addAttendees(event.id, guestList(form, organizer.id), organizer.id)
    if (attendeeError) {
        const { error: cleanupError } = await supabase.from("calendar_events").delete().eq("id", event.id)
        if (cleanupError) console.error("Removing the unfinished meeting failed:", cleanupError)
        return { data: null, error: attendeeError }
    }
    return { data: event, error: null }
}

// before: the stored guest list (fetchAttendees), organizer included
export async function updateMeeting(eventId, organizerId, form, before) {
    const { data: event, error } = await supabase.from("calendar_events")
        .update(meetingRow(form)).eq("id", eventId)
        .select(MEETING_FIELDS).single()
    if (error) {
        console.error("Updating meeting failed:", error)
        return { data: null, error }
    }
    const { added, removed } = attendeeChanges(before, guestList(form, organizerId))
    const attendeeError = (await removeAttendees(eventId, removed)) || (await addAttendees(eventId, added, organizerId))
    return { data: event, error: attendeeError }
}

// Removes a meeting (and with it the guest list); `eventId` is the stored event,
// so every repeat goes too
export async function deleteMeeting(eventId) {
    const { error } = await supabase.from("calendar_events").delete().eq("id", eventId)
    if (error) console.error("Deleting meeting failed:", error)
    return { data: null, error }
}

// Upcoming meetings and events for My Space, repeats included, soonest first
export async function fetchUpcomingMeetings(from, until, limit) {
    const fields = "id, title, event_date, starts_at, ends_at, external_url, repeat"
    const fromKey = dayKey(from)
    let { data, error } = await supabase.from("calendar_events").select(fields)
        .or(`event_date.gte.${fromKey},repeat.neq.none`).lte("event_date", dayKey(until))
    // Before migration 20261119090000 there is no repeat column
    if (error?.code === "42703" || error?.code === "PGRST204" || error?.code === "PGRST100") {
        ({ data, error } = await supabase.from("calendar_events").select("id, title, event_date, starts_at, ends_at, external_url")
            .gte("event_date", fromKey).lte("event_date", dayKey(until)))
    }
    if (error) {
        console.error("Loading upcoming meetings failed:", error)
        return { data: [], error }
    }
    const upcoming = expandRecurring(data || [], from, until)
        .filter((e) => e.event_date >= fromKey)
        .sort((a, b) => eventStart(a) - eventStart(b))
        .slice(0, limit)
    return { data: upcoming, error: null }
}
