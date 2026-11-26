import { useState } from "react"
import Select from "../../components/Select"

// Shown while tasks are ticked in the List view: change their status,
// assignee, priority or due date together, or delete them. Each task is
// changed on its own, so one you can't change doesn't stop the rest; the bar
// then says how many changed and why the others didn't.
// Handlers resolve to { message, isError }.

const PICK = ""
const pickClass = "h-8 bg-raised border border-line hover:border-line-strong rounded-lg pl-2.5 pr-2 text-[12px] font-semibold text-soft hover:text-white transition-colors focus:outline-none focus-visible:border-accent-ink/60"
const PRIORITIES = [
    { value: "urgent", label: "Urgent" },
    { value: "high", label: "High" },
    { value: "medium", label: "Medium" },
    { value: "low", label: "Low" },
]
const UNASSIGN = "__nobody__"

export default function BulkBar({ count, columns, people, canDelete, onMove, onSave, onDelete, onClear }) {
    const [isBusy, setIsBusy] = useState(false)
    const [result, setResult] = useState(null)

    const run = async (action) => {
        setIsBusy(true)
        setResult(null)
        const outcome = await action()
        setIsBusy(false)
        setResult(outcome)
    }

    return (
        <div role="region" aria-label={`${count} tasks selected`} className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[min(56rem,calc(100vw-1.5rem))] rounded-2xl border border-line-strong bg-panel shadow-2xl px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold text-white tabular-nums px-1">{count} selected</span>
                <Select value={PICK} disabled={isBusy} aria-label="Move the selected tasks to" onChange={(e) => {
                    const column = columns.find((c) => c.key === e.target.value)
                    if (column) run(() => onMove(column))
                }} className={pickClass}>
                    <option value={PICK}>Status…</option>
                    {columns.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
                </Select>
                <Select value={PICK} disabled={isBusy} aria-label="Assign the selected tasks to" onChange={(e) => {
                    if (e.target.value) run(() => onSave({ assignee_id: e.target.value === UNASSIGN ? null : e.target.value }))
                }} className={pickClass}>
                    <option value={PICK}>Assign…</option>
                    <option value={UNASSIGN}>Nobody</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.name || "Someone"}</option>)}
                </Select>
                <Select value={PICK} disabled={isBusy} aria-label="Set the priority of the selected tasks" onChange={(e) => {
                    if (e.target.value) run(() => onSave({ priority: e.target.value }))
                }} className={pickClass}>
                    <option value={PICK}>Priority…</option>
                    {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </Select>
                <label className="flex items-center gap-1.5 h-8 px-2 rounded-lg border border-line bg-raised text-[12px] font-semibold text-soft">
                    Due
                    <input
                        type="date"
                        disabled={isBusy}
                        aria-label="Set the due date of the selected tasks"
                        onChange={(e) => { if (e.target.value) run(() => onSave({ due_date: e.target.value })) }}
                        className="bg-transparent border-0 p-0 text-[12px] text-white focus:outline-none focus:ring-0"
                    />
                </label>
                {canDelete && (
                    <button type="button" disabled={isBusy} onClick={() => run(onDelete)} className="h-8 px-2.5 rounded-lg text-[12px] font-semibold text-muted hover:text-red-400 hover:bg-surface2 transition-colors cursor-pointer disabled:opacity-60">
                        Delete
                    </button>
                )}
                <button type="button" onClick={onClear} className="ml-auto h-8 px-2.5 rounded-lg text-[12px] font-semibold text-muted hover:text-white hover:bg-surface2 transition-colors cursor-pointer">
                    Clear selection
                </button>
            </div>
            {(isBusy || result) && (
                <p role="status" className={`flex items-center gap-2 text-[12px] px-1 pt-1.5 ${result?.isError ? "text-amber-400" : "text-muted"}`}>
                    {isBusy ? "Saving…" : result.message}
                    {!isBusy && result?.undo && (
                        <button type="button" onClick={() => run(result.undo)} className="font-semibold text-accent-ink hover:underline cursor-pointer">
                            Undo
                        </button>
                    )}
                </p>
            )}
        </div>
    )
}
