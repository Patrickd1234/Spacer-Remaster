import { useState } from "react"
import Select from "./Select"

const NOTE_MAX = 1000
const fieldClass = "w-full bg-canvas border border-line rounded-lg px-3 py-2 text-[12px] text-white focus:outline-none focus:border-accent-ink/50 placeholder:text-muted/50"
const primaryClass = "h-8 px-3 rounded-lg bg-accent text-on-accent text-[12px] font-bold hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
const timeAgo = (value) => new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })

const ACTIONS = [
    { key: "nudge", icon: "notifications", title: "Nudge department", detail: "Send the department's lead an in-app reminder" },
    { key: "reassign", icon: "group", title: "Reassign task", detail: "Move a task to someone else" },
    { key: "deadline", icon: "calendar_month", title: "Adjust deadline", detail: "Change a task's due date" },
    { key: "note", icon: "description", title: "Add a note", detail: "Log a decision or context for the team" },
]

// Pick one of `choices` ({ id, label }) and run `onGo(id)`
function PickAndGo({ label, choices, emptyText, goLabel, isBusy = false, onGo }) {
    const [pickedId, setPickedId] = useState("")
    const picked = choices.some((c) => String(c.id) === String(pickedId)) ? pickedId : ""
    if (choices.length === 0) return <p className="text-[12px] text-muted">{emptyText}</p>
    return (
        <div className="flex gap-2">
            <div className="flex-1 min-w-0">
                <Select aria-label={label} className={fieldClass} value={picked} onChange={(e) => setPickedId(e.target.value)}>
                    <option value="">{label}</option>
                    {choices.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </Select>
            </div>
            <button type="button" disabled={!picked || isBusy} onClick={() => onGo(picked)} className={primaryClass}>{goLabel}</button>
        </div>
    )
}

/**
 * The Resolve tab's "Take action" card (design screen 6): nudge a department,
 * reassign a task or change its due date (both open the task's panel at that
 * control, where the usual rights apply), or log a note. Notes are listed under it.
 * `departments`: those with a lead, { id, name }. `reassignable` and
 * `movable`: open tasks ({ id, label }) the viewer may reassign / change the
 * due date of.
 */
export default function TakeActionPanel({ departments, reassignable, movable, canNudge, notes, notesError, onNudge, onOpenTask, onAddNote, departmentsHint = null }) {
    const [openKey, setOpenKey] = useState(null)
    const [note, setNote] = useState("")
    const [isBusy, setIsBusy] = useState(false)
    const [message, setMessage] = useState(null)

    const run = async (action) => {
        setIsBusy(true)
        setMessage(null)
        const result = await action()
        setIsBusy(false)
        setMessage(result)
        return !result?.isError
    }
    const saveNote = async () => {
        const ok = await run(() => onAddNote(note))
        if (ok) setNote("")
    }

    const body = {
        nudge: canNudge
            ? <PickAndGo label="Pick a department" choices={departments.map((d) => ({ id: d.id, label: d.name }))} emptyText="No department has a lead to nudge." goLabel="Send nudge" isBusy={isBusy} onGo={(id) => run(() => onNudge(id))} />
            : <p className="text-[12px] text-muted">Only the project&apos;s managers and department leads can send a nudge.</p>,
        reassign: <PickAndGo label="Pick a task" choices={reassignable} emptyText="No open task you can reassign (the project's managers and each task's assignee can)." goLabel="Open" onGo={(id) => onOpenTask(id, "assignee")} />,
        deadline: (
            <div className="space-y-1.5">
                <PickAndGo label="Pick a task" choices={movable} emptyText="No open task whose due date you can change (the project's managers and the task's department lead can)." goLabel="Open" onGo={(id) => onOpenTask(id, "due")} />
                {departmentsHint}
            </div>
        ),
        note: (
            <div className="space-y-2">
                <textarea rows={3} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Agreed to ship the API before the screens" aria-label="Note" className={`${fieldClass} resize-none`} />
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-muted">{note.length}/{NOTE_MAX}</span>
                    <button type="button" disabled={isBusy || !note.trim()} onClick={saveNote} className={primaryClass}>{isBusy ? "Saving…" : "Save note"}</button>
                </div>
            </div>
        ),
    }

    return (
        <section aria-label="Take action" className="rounded-xl border border-line bg-panel p-md space-y-3">
            <div>
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white">
                    <span className="material-symbols-outlined text-[18px] text-accent-ink" aria-hidden="true">bolt</span>
                    Take action
                </h3>
                <p className="text-[11px] text-muted mt-0.5">Resolve delays and keep the project on track.</p>
            </div>
            <ul className="space-y-1.5">
                {ACTIONS.map((action) => {
                    const isOpen = openKey === action.key
                    return (
                        <li key={action.key} className={`rounded-lg border ${isOpen ? "border-line-strong bg-raised/60" : "border-line"}`}>
                            <button type="button" aria-expanded={isOpen} onClick={() => { setOpenKey(isOpen ? null : action.key); setMessage(null) }} className="w-full flex items-center gap-3 px-3 py-2.5 text-left cursor-pointer">
                                <span className="material-symbols-outlined text-[18px] text-muted" aria-hidden="true">{action.icon}</span>
                                <span className="flex-1 min-w-0">
                                    <span className="block text-[12px] font-semibold text-white">{action.title}</span>
                                    <span className="block text-[11px] text-muted">{action.detail}</span>
                                </span>
                                <span className={`material-symbols-outlined text-[18px] text-muted transition-transform ${isOpen ? "rotate-90" : ""}`} aria-hidden="true">chevron_right</span>
                            </button>
                            {isOpen && <div className="px-3 pb-3">{body[action.key]}</div>}
                        </li>
                    )
                })}
            </ul>
            {message && <p role="status" className={`text-[12px] ${message.isError ? "text-red-400" : "text-accent-ink"}`}>{message.text}</p>}

            <div className="pt-2 border-t border-line/60">
                <h4 className="text-[12px] font-semibold text-white mb-2">Notes &amp; decisions</h4>
                {notesError && <p className="text-[11px] text-red-400">{notesError}</p>}
                {!notesError && notes.length === 0 && <p className="text-[11px] text-muted">No notes yet.</p>}
                <ul className="space-y-2">
                    {notes.map((n) => (
                        <li key={n.id} className="text-[12px]">
                            <p className="text-soft whitespace-pre-wrap break-words">{n.note}</p>
                            <p className="text-[10px] text-muted mt-0.5">{n.actor_name} · {timeAgo(n.created_at)}</p>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    )
}
