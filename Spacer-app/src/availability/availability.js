// Pure helpers for "away" periods (migration 20261120130000_user_availability).
// No imports, so `npm test` can load them.
//
// A person has at most one period, stored on their users row as plain dates:
//   away_from     first day away
//   away_back_on  first day back (not counted as away)
//   away_note     optional short note ("On leave")
// Days are "YYYY-MM-DD" strings in the viewer's calendar, so they compare as text.

export const AWAY_NOTE_MAX = 80

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const pad = (n) => String(n).padStart(2, "0")

/** @param {Date} date @returns {string} the local calendar day, "YYYY-MM-DD" */
export function dayKeyOf(date = new Date()) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// "Nov 25" from "2026-11-25", built from the date parts so it never slips a day
function shortDay(day) {
    const [y, m, d] = day.split("-").map(Number)
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function periodOf(person) {
    const from = person?.away_from
    const backOn = person?.away_back_on
    if (!DATE_RE.test(from || "") || !DATE_RE.test(backOn || "")) return null
    return { from, backOn }
}

/** @returns {boolean} whether `day` falls in the person's away period */
export function isAwayOn(person, day) {
    const period = periodOf(person)
    if (!period || !DATE_RE.test(day || "")) return false
    return period.from <= day && day < period.backOn
}

/** @returns {"away" | "upcoming" | null} null when there's no period or it's over */
export function awayState(person, today) {
    const period = periodOf(person)
    if (!period || today >= period.backOn) return null
    return today >= period.from ? "away" : "upcoming"
}

/** "Away · back Nov 25", "Away from Dec 22 · back Jan 5", or null */
export function awayLabel(person, today) {
    const state = awayState(person, today)
    if (!state) return null
    const back = shortDay(person.away_back_on)
    return state === "away" ? `Away · back ${back}` : `Away from ${shortDay(person.away_from)} · back ${back}`
}

/** The assignee list's option text: "Ada (away, back Nov 25)" */
export function assigneeOptionLabel(person, today) {
    const state = awayState(person, today)
    if (state === "away") return `${person.name} (away, back ${shortDay(person.away_back_on)})`
    if (state === "upcoming") return `${person.name} (away from ${shortDay(person.away_from)})`
    return person.name
}

/**
 * A heads-up for whoever assigns a task, or null. With a due date it warns only
 * when that day falls in the away period; without one, only when they're away now.
 */
export function assignWarning(person, { today, dueDate }) {
    if (!person || !awayState(person, today)) return null
    const back = shortDay(person.away_back_on)
    if (DATE_RE.test(dueDate || "")) {
        return isAwayOn(person, dueDate) ? `${person.name} is away on the due date (${shortDay(dueDate)}) and back on ${back}.` : null
    }
    return awayState(person, today) === "away" ? `${person.name} is away and back on ${back}.` : null
}

/** form: { from, backOn, note }. Returns an error message, or null when it can be saved. */
export function validateAwayPeriod({ from, backOn, note }, today) {
    if (!DATE_RE.test(from || "")) return "Choose the first day you're away."
    if (!DATE_RE.test(backOn || "")) return "Choose the day you're back."
    if (backOn <= from) return "The day you're back must be after the first day away."
    if (backOn <= today) return "That period is already over."
    if ((note || "").trim().length > AWAY_NOTE_MAX) return `Keep the note to ${AWAY_NOTE_MAX} characters.`
    return null
}

/** The users-row columns for a form, or all nulls to clear the period */
export function awayFields(form) {
    if (!form) return { away_from: null, away_back_on: null, away_note: null }
    return { away_from: form.from, away_back_on: form.backOn, away_note: (form.note || "").trim() || null }
}

/** "2026-12-01" from "2026-11-30"; "" for anything that isn't a day */
export function dayAfter(day) {
    if (!DATE_RE.test(day || "")) return ""
    const [y, m, d] = day.split("-").map(Number)
    return dayKeyOf(new Date(y, m - 1, d + 1))
}

/** A new Map with one person's period set from users-row fields, or removed when cleared or over */
export function withPeriod(byId, userId, fields, today) {
    const next = new Map(byId)
    if (awayState(fields, today)) next.set(userId, { ...fields })
    else next.delete(userId)
    return next
}

/** New person objects with their period from `byId`; people without one are returned as they are */
export function withAvailability(people, byId) {
    return people.map((person) => (byId.has(person.id) ? { ...person, ...byId.get(person.id) } : person))
}
