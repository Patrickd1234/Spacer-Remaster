import { useState } from "react"
import { AWAY_NOTE_MAX, awayState, dayAfter, dayKeyOf, validateAwayPeriod } from "./availability"
import { saveMyAwayPeriod } from "./availabilityData"
import AwayBadge from "./AwayBadge"

const INPUT_CLASS = "w-full bg-neutral-900/80 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus-border-primary-accent transition-colors [color-scheme:dark]"
const LABEL_CLASS = "block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-1.5"

const formOf = (period) => ({
    from: period?.away_from || "",
    backOn: period?.away_back_on || "",
    note: period?.away_note || "",
})

// Your own away period on the Profile page. Only you can set it (the database
// lets people update only their own row). `period` is
// { away_from, away_back_on, away_note } or undefined; saving fires
// AVAILABILITY_SAVED_EVENT, which reloads every useAwayPeriods() in the tab.
export default function AvailabilityCard({ userId, period }) {
    const today = dayKeyOf()
    const hasPeriod = Boolean(awayState(period, today))
    const [isEditing, setIsEditing] = useState(false)
    const [form, setForm] = useState(() => formOf(period))
    const [errorMsg, setErrorMsg] = useState("")
    const [isSaving, setIsSaving] = useState(false)
    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

    const startEditing = () => {
        setForm(formOf(period))
        setErrorMsg("")
        setIsEditing(true)
    }

    const save = async (next) => {
        const invalid = next && validateAwayPeriod(next, today)
        if (invalid) {
            setErrorMsg(invalid)
            return
        }
        setIsSaving(true)
        const { error } = await saveMyAwayPeriod(userId, next)
        setIsSaving(false)
        if (error) {
            setErrorMsg(error.message)
            return
        }
        setErrorMsg("")
        setIsEditing(false)
    }

    return (
        <div className="p-6 rounded-2xl bg-surface-container border border-white/10 space-y-4">
            <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-amber-400" aria-hidden="true">event_busy</span>
                    Availability
                </h3>
                {!isEditing && (
                    <button type="button" onClick={startEditing} className="text-xs font-medium text-accent-ink hover:underline cursor-pointer">
                        {hasPeriod ? "Change" : "Set away"}
                    </button>
                )}
            </div>

            {!isEditing && (
                hasPeriod ? (
                    <div className="space-y-3">
                        <AwayBadge person={period} today={today} />
                        {period.away_note && <p className="text-sm text-neutral-300">{period.away_note}</p>}
                        <button
                            type="button"
                            onClick={() => save(null)}
                            disabled={isSaving}
                            className="text-xs text-neutral-400 hover:text-white disabled:opacity-50 cursor-pointer"
                        >
                            {isSaving ? "Clearing…" : awayState(period, today) === "away" ? "I'm back — clear" : "Cancel this away period"}
                        </button>
                    </div>
                ) : (
                    <p className="text-sm text-neutral-400">
                        Available. Going on leave or to an event? Set the dates so whoever assigns tasks can see when you're back.
                    </p>
                )
            )}

            {isEditing && (
                <form onSubmit={(e) => { e.preventDefault(); save(form) }} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
                        <div>
                            <label htmlFor="away-from" className={LABEL_CLASS}>First day away</label>
                            <input id="away-from" type="date" className={INPUT_CLASS} value={form.from} onChange={set("from")} required />
                        </div>
                        <div>
                            <label htmlFor="away-back-on" className={LABEL_CLASS}>Back on</label>
                            <input id="away-back-on" type="date" className={INPUT_CLASS} value={form.backOn} min={dayAfter(form.from) || undefined} onChange={set("backOn")} required />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="away-note" className={LABEL_CLASS}>Note <span className="normal-case font-normal">(optional)</span></label>
                        <input id="away-note" type="text" className={INPUT_CLASS} value={form.note} onChange={set("note")} maxLength={AWAY_NOTE_MAX} placeholder="e.g. On leave, Conference" />
                    </div>
                    {errorMsg && <p role="alert" className="text-xs text-red-400">{errorMsg}</p>}
                    <div className="flex items-center gap-3">
                        <button type="submit" disabled={isSaving} className="px-4 py-2 rounded-xl btn-primary-accent text-sm font-medium disabled:opacity-50 cursor-pointer">
                            {isSaving ? "Saving…" : "Save"}
                        </button>
                        <button type="button" onClick={() => setIsEditing(false)} disabled={isSaving} className="px-4 py-2 rounded-xl bg-white/5 text-neutral-300 hover:text-white hover:bg-white/10 text-sm font-medium cursor-pointer">
                            Cancel
                        </button>
                    </div>
                </form>
            )}

            {!isEditing && errorMsg && <p role="alert" className="text-xs text-red-400">{errorMsg}</p>}
        </div>
    )
}
