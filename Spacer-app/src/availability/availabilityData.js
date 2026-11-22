import { useEffect, useState } from "react"
import { supabase } from "../supabase"
import { AVAILABILITY_SAVED_EVENT } from "../appEvents"
import { awayFields, dayKeyOf, withPeriod } from "./availability"

// Reads and writes for away periods (migration 20261120130000_user_availability).
// Row-level security keeps reads to the viewer's organization and writes to
// their own row. Functions return { data, error } and never throw.

const AWAY_COLUMNS = "id, away_from, away_back_on, away_note"

// Before the migration is applied the columns don't exist; the app then simply
// shows nobody as away
const isMissingColumn = (error) => error?.code === "42703" || error?.code === "PGRST204"

/**
 * Everyone in the viewer's organization who is away now or later, as a Map of
 * id -> { away_from, away_back_on, away_note }. Small: only people with a period
 * that hasn't ended. data is null when loading failed.
 */
export async function fetchAwayPeriods(today = dayKeyOf()) {
    const { data, error } = await supabase
        .from("users")
        .select(AWAY_COLUMNS)
        .gt("away_back_on", today)
    if (isMissingColumn(error)) return { data: new Map(), error: null }
    if (error) {
        console.error("Loading away periods failed:", error)
        return { data: null, error }
    }
    const byId = new Map((data || []).map(({ id, ...period }) => [id, period]))
    return { data: byId, error: null }
}

/** form: { from, backOn, note } to set your period, or null to clear it */
export async function saveMyAwayPeriod(userId, form) {
    const fields = awayFields(form)
    const { error } = await supabase.from("users").update(fields).eq("id", userId)
    if (isMissingColumn(error)) {
        return { data: null, error: new Error("Away status isn't switched on for this workspace yet.") }
    }
    if (error) {
        console.error("Saving your away period failed:", error)
        return { data: null, error: new Error("Couldn't save your away status. Please try again.") }
    }
    window.dispatchEvent(new CustomEvent(AVAILABILITY_SAVED_EVENT, { detail: { userId, fields } }))
    return { data: fields, error: null }
}

/**
 * The organization's away periods (see fetchAwayPeriods). A save in this tab
 * shows at once (from the event's detail) and then reloads the list. A failed
 * load keeps what is shown, and only the newest load is applied.
 */
export function useAwayPeriods() {
    const [byId, setById] = useState(() => new Map())

    useEffect(() => {
        let active = true
        let latest = 0
        const load = () => {
            const request = ++latest
            fetchAwayPeriods().then(({ data }) => {
                if (active && data && request === latest) setById(data)
            })
        }
        const onSaved = (e) => {
            const { userId, fields } = e.detail || {}
            if (userId && fields) setById((prev) => withPeriod(prev, userId, fields, dayKeyOf()))
            load()
        }
        load()
        window.addEventListener(AVAILABILITY_SAVED_EVENT, onSaved)
        return () => {
            active = false
            window.removeEventListener(AVAILABILITY_SAVED_EVENT, onSaved)
        }
    }, [])

    return byId
}
