import { awayLabel, awayState, dayKeyOf } from "./availability"

// Amber like the app's other "heads-up" chips; the text always says what it
// means, so colour is never the only cue
const AWAY_TONE = "bg-amber-500/10 text-amber-300 border-amber-500/30"
const UPCOMING_TONE = "bg-line text-soft border-line-strong"

// "Away · back Nov 25" chip, or nothing when the person has no current or
// upcoming away period. The note, if any, is in the tooltip and read out by
// screen readers; the Directory drawer and Profile also show it as text.
export default function AwayBadge({ person, today = dayKeyOf(), className = "" }) {
    const label = awayLabel(person, today)
    if (!label) return null
    const tone = awayState(person, today) === "away" ? AWAY_TONE : UPCOMING_TONE
    const title = person.away_note ? `${label} — ${person.away_note}` : label
    return (
        <span title={title} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium whitespace-nowrap ${tone} ${className}`}>
            <span className="material-symbols-outlined text-[13px]" aria-hidden="true">event_busy</span>
            {label}
            {person.away_note && <span className="sr-only">: {person.away_note}</span>}
        </span>
    )
}

// A small amber dot for the corner of an avatar while someone is away now.
// Place inside a `relative` wrapper. `isDecorative` hides it from screen
// readers when an AwayBadge next to it already says the same.
export function AwayDot({ person, today = dayKeyOf(), isDecorative = false, className = "" }) {
    const label = awayState(person, today) === "away" ? awayLabel(person, today) : null
    if (!label) return null
    const a11y = isDecorative ? { "aria-hidden": true } : { role: "img", "aria-label": label }
    return (
        <span
            {...a11y}
            title={label}
            className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-400 border-2 border-panel ${className}`}
        />
    )
}
