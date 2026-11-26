import { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Select from "../../components/Select"
import { choicesInDepartment } from "../waiting"

const NOTE_MAX = 500
const fieldClass = "w-full bg-canvas border border-line rounded-lg px-3 py-2 text-[13px] text-white focus:outline-none focus:border-accent-ink/50 transition-colors placeholder:text-muted/50"
const dueText = (t) => (t.due_date ? ` · due ${String(t.due_date).slice(0, 10)}` : "")

/**
 * Mark as Waiting (design screen 05), or Add dependency (`mode` "dependency"):
 * pick the department waited on, then the task, and optionally say why.
 * `choices`: tasks this one may wait on (blockableTasks, rights already
 * applied). `departments`: the project's, lead first (empty on a
 * one-department project: no department picker then). `onConfirm({ blockerId,
 * note })` resolves to an error message or null.
 */
export default function MarkWaitingModal({ mode = "waiting", task, choices, departments, onConfirm, onClose }) {
    const isWaiting = mode === "waiting"
    const hasDepartments = departments.length > 1
    const titleId = useId()
    const fieldsRef = useRef(null)
    // Start on the first department that has something to wait on
    const firstDepartment = hasDepartments
        ? departments.find((d) => choicesInDepartment(choices, departments, d.team_space_id).length > 0)?.team_space_id ?? ""
        : ""
    const [departmentId, setDepartmentId] = useState(firstDepartment)
    const [blockerId, setBlockerId] = useState("")
    const [note, setNote] = useState("")
    const [error, setError] = useState(null)
    const [isSaving, setIsSaving] = useState(false)

    const shown = choicesInDepartment(choices, departments, departmentId)
    const pickedId = shown.some((t) => String(t.id) === String(blockerId)) ? blockerId : ""

    // Focus the first picker; give focus back to what opened the window
    useEffect(() => {
        const opener = document.activeElement
        fieldsRef.current?.querySelector("button")?.focus()
        return () => { if (opener instanceof HTMLElement && opener.isConnected) opener.focus() }
    }, [])
    useEffect(() => {
        const onKey = (e) => {
            if (e.key !== "Escape" || e.defaultPrevented) return
            // An open picker list closes first (Select handles that Escape)
            if (document.querySelector("[role='listbox']")) return
            // Close only this window, not the task panel under it
            e.preventDefault()
            e.stopPropagation()
            if (!isSaving) onClose()
        }
        window.addEventListener("keydown", onKey, true)
        return () => window.removeEventListener("keydown", onKey, true)
    }, [isSaving, onClose])

    const submit = async (e) => {
        e.preventDefault()
        if (!pickedId) { setError("Pick the task it waits on."); return }
        setIsSaving(true)
        setError(null)
        const message = await onConfirm({ blockerId: pickedId, note })
        setIsSaving(false)
        if (message) setError(message)
    }

    const departmentName = departments.find((d) => String(d.team_space_id) === String(departmentId))?.name
    return createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50" onClick={() => !isSaving && onClose()}>
            <form
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                onSubmit={submit}
                onClick={(e) => e.stopPropagation()}
                // Keys typed here (a picker's type-ahead "E", say) must not
                // reach the task panel's J/K/E shortcuts underneath
                onKeyDown={(e) => { if (e.key !== "Escape") e.nativeEvent.stopPropagation() }}
                className="w-full max-w-md rounded-xl border border-line bg-raised shadow-2xl"
            >
                <div className="flex items-start justify-between gap-3 px-5 pt-5">
                    <div>
                        <h2 id={titleId} className="text-base font-semibold text-white">{isWaiting ? "Mark as Waiting" : "Add dependency"}</h2>
                        <p className="text-[12px] text-muted mt-1">
                            {isWaiting
                                ? `Let the project know “${task.title}” is blocked by ${hasDepartments ? "another department's" : "another task's"} work.`
                                : `Pick a task “${task.title}” waits on. Its status stays as it is.`}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} disabled={isSaving} aria-label="Close" className="text-muted hover:text-white cursor-pointer">
                        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">close</span>
                    </button>
                </div>

                <div ref={fieldsRef} className="px-5 py-4 space-y-3.5">
                    {hasDepartments && (
                        <div className="space-y-1.5">
                            <label htmlFor={`${titleId}-department`} className="block text-[12px] text-soft">Waiting on department</label>
                            <Select id={`${titleId}-department`} className={fieldClass} value={departmentId} onChange={(e) => { setDepartmentId(e.target.value); setBlockerId("") }}>
                                {departments.map((d) => <option key={d.team_space_id} value={d.team_space_id}>{d.name}</option>)}
                            </Select>
                        </div>
                    )}
                    <div className="space-y-1.5">
                        <label htmlFor={`${titleId}-task`} className="block text-[12px] text-soft">Blocking task</label>
                        <Select id={`${titleId}-task`} className={fieldClass} value={pickedId} onChange={(e) => setBlockerId(e.target.value)}>
                            <option value="">{shown.length === 0 ? `No open task${departmentName ? ` in ${departmentName}` : ""} to wait on` : "Pick a task"}</option>
                            {shown.map((t) => (
                                <option key={t.id} value={t.id}>{t.title}{dueText(t)}</option>
                            ))}
                        </Select>
                    </div>
                    <label className="block space-y-1.5">
                        <span className="block text-[12px] text-soft">Add a note <span className="text-muted">(optional)</span></span>
                        <textarea
                            rows={3}
                            maxLength={NOTE_MAX}
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="What are you waiting for?"
                            className={`${fieldClass} resize-none`}
                        />
                    </label>
                    {error && <p role="alert" className="text-[12px] text-red-400">{error}</p>}
                </div>

                <div className="flex justify-end gap-2 px-5 pb-5">
                    <button type="button" onClick={onClose} disabled={isSaving} className="px-4 py-2 rounded-lg border border-line text-xs font-semibold text-soft hover:text-white hover:bg-line transition-colors cursor-pointer">
                        Cancel
                    </button>
                    <button type="submit" disabled={isSaving || !pickedId} className="px-4 py-2 rounded-lg bg-accent text-on-accent text-xs font-bold hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
                        {isSaving ? "Saving…" : isWaiting ? "Mark as waiting" : "Add dependency"}
                    </button>
                </div>
            </form>
        </div>,
        document.body
    )
}
