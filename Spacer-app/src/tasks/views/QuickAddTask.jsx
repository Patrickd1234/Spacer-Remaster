import { useState } from "react"

// "+ Add task" at the end of a board column or a list group. Type a title and
// press Enter: the task is added and the field stays open for the next one.
// Escape or clicking away with nothing typed closes it.
// onAdd(title) resolves to an error message, or null once added.
export default function QuickAddTask({ onAdd, label = "Add task", className = "" }) {
    const [isOpen, setIsOpen] = useState(false)
    const [title, setTitle] = useState("")
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState(null)

    const close = () => { setIsOpen(false); setTitle(""); setError(null) }
    const submit = async (e) => {
        e.preventDefault()
        const text = title.trim()
        if (!text || isSaving) return
        setIsSaving(true)
        setError(null)
        const message = await onAdd(text)
        setIsSaving(false)
        if (message) setError(message)
        else setTitle("")
    }

    if (!isOpen) {
        return (
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                className={`flex items-center gap-1.5 w-full rounded-lg px-2 py-1.5 text-[12px] font-medium text-muted hover:text-white hover:bg-surface2/60 transition-colors cursor-pointer ${className}`}
            >
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">add</span>
                {label}
            </button>
        )
    }
    return (
        <form onSubmit={submit} className={className}>
            <input
                autoFocus
                value={title}
                maxLength={300}
                disabled={isSaving}
                aria-label="New task title"
                placeholder="Task title, then Enter"
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => { if (!title.trim() && !isSaving) close() }}
                onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); close() } }}
                className="w-full bg-field border border-accent-ink/50 rounded-lg px-2.5 py-1.5 text-[13px] text-white placeholder-muted focus:outline-none disabled:opacity-60"
            />
            {error && <p role="alert" className="text-[11px] text-red-400 mt-1 px-1">{error}</p>}
        </form>
    )
}
