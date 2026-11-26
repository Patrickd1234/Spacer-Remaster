import { useRef, useState } from "react"

// Text you edit where it sits, like a Jira or ClickUp task title: click (or
// focus and press Enter) to edit, then Enter or clicking away saves and Escape
// cancels. A description saves with Ctrl+Enter or the Save button.
// onSave(text) resolves to an error message, or null once saved.

function useEditing(value, onSave) {
    const [draft, setDraft] = useState(null)
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState(null)
    const isEditing = draft !== null
    // Escape removes the field, and a blur from that must not save it
    const isCancelling = useRef(false)

    const start = () => { isCancelling.current = false; setDraft(value || ""); setError(null) }
    const cancel = () => { isCancelling.current = true; setDraft(null); setError(null) }
    const save = async () => {
        if (draft === null || isSaving || isCancelling.current) return
        if (draft.trim() === (value || "").trim()) { cancel(); return }
        setIsSaving(true)
        const message = await onSave(draft.trim())
        setIsSaving(false)
        if (message) setError(message)
        else setDraft(null)
    }
    const blur = () => {
        if (isCancelling.current) return
        if (draft?.trim()) save()
        else cancel()
    }
    return { draft, setDraft, isEditing, isSaving, error, start, cancel, save, blur }
}

export function EditableTitle({ value, canEdit, onSave, id }) {
    const edit = useEditing(value, onSave)
    if (!edit.isEditing) {
        return (
            <h1
                id={id}
                tabIndex={canEdit ? 0 : undefined}
                role={canEdit ? "button" : undefined}
                aria-label={canEdit ? `${value}. Edit the title` : undefined}
                onClick={canEdit ? edit.start : undefined}
                onKeyDown={canEdit ? (e) => { if (e.key === "Enter") { e.preventDefault(); edit.start() } } : undefined}
                className={`text-xl md:text-[22px] font-semibold text-white leading-snug break-words rounded-md -mx-2 px-2 py-1 ${canEdit ? "cursor-text hover:bg-surface2/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink/50" : ""}`}
            >
                {value}
            </h1>
        )
    }
    return (
        <div>
            <input
                autoFocus
                aria-label="Task title"
                value={edit.draft}
                maxLength={300}
                disabled={edit.isSaving}
                onChange={(e) => edit.setDraft(e.target.value)}
                onBlur={edit.blur}
                onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); if (edit.draft.trim()) edit.save() }
                    if (e.key === "Escape") { e.preventDefault(); edit.cancel() }
                }}
                className="w-full -mx-2 px-2 py-1 bg-field border border-accent-ink/50 rounded-md text-xl md:text-[22px] font-semibold text-white focus:outline-none"
            />
            {edit.error && <p role="alert" className="text-xs text-red-400 mt-1">{edit.error}</p>}
        </div>
    )
}

export function EditableDescription({ value, canEdit, onSave }) {
    const edit = useEditing(value, onSave)
    if (!edit.isEditing) {
        if (!value && !canEdit) return <p className="text-sm text-muted italic">No description.</p>
        return (
            <div
                tabIndex={canEdit ? 0 : undefined}
                role={canEdit ? "button" : undefined}
                aria-label={canEdit ? "Edit the description" : undefined}
                onClick={canEdit ? edit.start : undefined}
                onKeyDown={canEdit ? (e) => { if (e.key === "Enter") { e.preventDefault(); edit.start() } } : undefined}
                className={`rounded-lg -mx-2 px-2 py-1.5 min-h-[2.5rem] ${canEdit ? "cursor-text hover:bg-surface2/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-ink/50" : ""}`}
            >
                {value
                    ? <p className="text-sm text-soft whitespace-pre-wrap break-words leading-relaxed">{value}</p>
                    : <p className="text-sm text-muted">Add a description…</p>}
            </div>
        )
    }
    return (
        <div className="space-y-2">
            <textarea
                autoFocus
                aria-label="Task description"
                value={edit.draft}
                rows={Math.min(14, Math.max(4, edit.draft.split("\n").length + 1))}
                maxLength={10000}
                disabled={edit.isSaving}
                onChange={(e) => edit.setDraft(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); edit.save() }
                    if (e.key === "Escape") { e.preventDefault(); edit.cancel() }
                }}
                className="w-full bg-field border border-accent-ink/50 rounded-lg px-3 py-2 text-sm text-white leading-relaxed focus:outline-none resize-y"
            />
            <div className="flex items-center gap-2">
                <button type="button" onClick={edit.save} disabled={edit.isSaving} className="px-3 py-1.5 rounded-lg btn-primary-accent text-xs font-semibold cursor-pointer disabled:opacity-60">
                    {edit.isSaving ? "Saving…" : "Save"}
                </button>
                <button type="button" onClick={edit.cancel} disabled={edit.isSaving} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-muted hover:text-white hover:bg-line transition-colors cursor-pointer">
                    Cancel
                </button>
                <span className="text-[11px] text-muted ml-auto hidden sm:inline">Ctrl+Enter to save · Esc to cancel</span>
            </div>
            {edit.error && <p role="alert" className="text-xs text-red-400">{edit.error}</p>}
        </div>
    )
}
