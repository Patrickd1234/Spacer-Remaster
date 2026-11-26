import { useEffect, useRef, useState } from "react"
import { BASE_STATUSES, COLUMN_NAME_MAX } from "../projectColumns"
import PlanetLoader from "./PlanetLoader"

const STATUS_LABEL = Object.fromEntries(BASE_STATUSES.map((s) => [s.value, s.label]))

// Header of one board column. Managers can rename it (click the name or use the
// menu), drag it to reorder, move it left/right, or delete it.
export function BoardColumnHeader({
    column, count, dotColor, editable, canMoveLeft, canMoveRight, canDelete,
    onRename, onMoveLeft, onMoveRight, onDelete, onDragStart, onDragEnd,
}) {
    const [isEditing, setIsEditing] = useState(false)
    const [draft, setDraft] = useState(column.name)
    const [menuOpen, setMenuOpen] = useState(false)
    const menuRef = useRef(null)

    useEffect(() => {
        if (!menuOpen) return undefined
        const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false) }
        const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false) }
        document.addEventListener("mousedown", close)
        document.addEventListener("keydown", onKey)
        return () => {
            document.removeEventListener("mousedown", close)
            document.removeEventListener("keydown", onKey)
        }
    }, [menuOpen])

    const startEditing = () => {
        setDraft(column.name)
        setIsEditing(true)
        setMenuOpen(false)
    }

    const commit = () => {
        const name = draft.trim()
        setIsEditing(false)
        if (name && name !== column.name) onRename(name)
    }

    const menuItem = "w-full flex items-center gap-2 px-3 py-2 text-left text-[12px] rounded-md transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"

    return (
        <div
            className="group/header flex items-center justify-between gap-2 px-md py-sm sticky top-0 z-10"
            draggable={editable && !isEditing}
            onDragStart={editable ? onDragStart : undefined}
            onDragEnd={editable ? onDragEnd : undefined}
        >
            <div className="flex items-center gap-sm min-w-0 flex-1">
                {editable && (
                    <span
                        className="material-symbols-outlined text-[16px] text-faint cursor-grab opacity-0 group-hover/header:opacity-100 transition-opacity -ml-1"
                        title="Drag to reorder"
                        aria-hidden="true"
                    >
                        drag_indicator
                    </span>
                )}
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColor}`}></span>
                {isEditing ? (
                    <input
                        autoFocus
                        value={draft}
                        maxLength={COLUMN_NAME_MAX}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={commit}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") commit()
                            if (e.key === "Escape") setIsEditing(false)
                        }}
                        aria-label="Column name"
                        className="min-w-0 flex-1 bg-canvas border border-accent-ink rounded-md px-2 py-0.5 text-[13px] font-bold text-white outline-none"
                    />
                ) : editable ? (
                    <button
                        type="button"
                        onClick={startEditing}
                        title="Rename column"
                        className="font-label-md text-xs text-white font-bold truncate text-left hover:text-accent-ink transition-colors cursor-text"
                    >
                        {column.name}
                    </button>
                ) : (
                    <span className="font-label-md text-xs text-white font-bold truncate">{column.name}</span>
                )}
                <span className="text-[10px] text-muted bg-surface1 border border-line/50 rounded-full px-[6px] py-[1px] min-w-[18px] text-center shrink-0">{count}</span>
            </div>

            {editable && (
                <div className="relative shrink-0" ref={menuRef}>
                    <button
                        type="button"
                        onClick={() => setMenuOpen((open) => !open)}
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                        aria-label={`Options for ${column.name}`}
                        className="material-symbols-outlined text-[18px] text-muted hover:text-white rounded-md p-0.5 hover:bg-white/5 transition-colors cursor-pointer"
                    >
                        more_horiz
                    </button>
                    {menuOpen && (
                        <div role="menu" className="font-body-md reports-fade absolute right-0 top-full mt-1 z-30 w-44 rounded-xl border border-line bg-panel p-1 shadow-2xl shadow-black/40">
                            <p className="px-3 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-faint">
                                Status: {STATUS_LABEL[column.base_status]}
                            </p>
                            <button type="button" role="menuitem" onClick={startEditing} className={`${menuItem} text-soft hover:bg-white/5`}>
                                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">edit</span>Rename
                            </button>
                            <button type="button" role="menuitem" disabled={!canMoveLeft} onClick={() => { setMenuOpen(false); onMoveLeft() }} className={`${menuItem} text-soft hover:bg-white/5`}>
                                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">arrow_back</span>Move left
                            </button>
                            <button type="button" role="menuitem" disabled={!canMoveRight} onClick={() => { setMenuOpen(false); onMoveRight() }} className={`${menuItem} text-soft hover:bg-white/5`}>
                                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">arrow_forward</span>Move right
                            </button>
                            <div className="my-1 h-px bg-line" />
                            <button
                                type="button"
                                role="menuitem"
                                disabled={!canDelete}
                                title={canDelete ? undefined : "A board needs at least one column"}
                                onClick={() => { setMenuOpen(false); onDelete() }}
                                className={`${menuItem} text-red-400 hover:bg-red-950/20`}
                            >
                                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">delete</span>Delete column
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

// Common column ideas: one click fills the name and a sensible status
const COLUMN_SUGGESTIONS = [
    { name: "Review", baseStatus: "in_review" },
    { name: "Testing", baseStatus: "in_review" },
    { name: "Blocked", baseStatus: "waiting" },
    { name: "On hold", baseStatus: "todo" },
    { name: "Ready", baseStatus: "todo" },
]

const STATUS_OPTIONS = [
    { value: "todo", label: "To do", dot: "bg-muted", hint: "Cards here count as not started." },
    { value: "in_progress", label: "In progress", dot: "bg-[#3b82f6]", hint: "Cards here count as being worked on." },
    { value: "waiting", label: "Waiting", dot: "bg-amber-400", hint: "Cards here are waiting on other work. They go back on their own once what they wait on is done." },
    { value: "in_review", label: "In review", dot: "bg-violet-400", hint: "Cards here are done and being checked." },
    { value: "done", label: "Done", dot: "bg-[var(--primary-color)]", hint: "Cards here count as finished and never show as overdue." },
]

// "+ Add column" tile at the end of the editable columns; new columns are added at
// the end. `columns` are the current board columns, used to spot duplicate names.
export function AddColumnTile({ columns, onAdd, saving }) {
    const [isOpen, setIsOpen] = useState(false)
    const [name, setName] = useState("")
    const [baseStatus, setBaseStatus] = useState("in_progress")
    const [addedCount, setAddedCount] = useState(0)
    const inputRef = useRef(null)

    const trimmed = name.trim()
    const isDuplicate = trimmed !== "" && columns.some((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase())
    const usedNames = new Set(columns.map((c) => c.name.trim().toLowerCase()))
    const suggestions = COLUMN_SUGGESTIONS.filter((s) => !usedNames.has(s.name.toLowerCase()))
    const statusHint = STATUS_OPTIONS.find((o) => o.value === baseStatus)?.hint

    const open = () => {
        setAddedCount(0)
        setIsOpen(true)
    }

    const close = () => {
        setIsOpen(false)
        setName("")
        setBaseStatus("in_progress")
    }

    const submit = async (e) => {
        e.preventDefault()
        if (!trimmed || isDuplicate || saving) return
        const ok = await onAdd(trimmed, baseStatus)
        if (!ok) return
        // Stay open for adding several columns in a row
        setName("")
        setAddedCount((n) => n + 1)
        inputRef.current?.focus()
    }

    if (!isOpen) {
        return (
            <button
                type="button"
                onClick={open}
                className="flex-shrink-0 w-[280px] h-[52px] flex items-center justify-center gap-2 rounded-xl border border-dashed border-line text-muted text-[13px] font-semibold hover:text-white hover:border-accent-ink hover:bg-[rgba(var(--primary-color-rgb),0.05)] transition-colors cursor-pointer"
            >
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">add</span>
                Add column
            </button>
        )
    }

    return (
        <form
            onSubmit={submit}
            onKeyDown={(e) => { if (e.key === "Escape") close() }}
            aria-label="Add a column"
            className="reports-fade flex-shrink-0 w-[300px] self-start rounded-xl border border-line bg-raised p-4 space-y-4 shadow-xl shadow-black/30"
        >
            <div className="flex items-center justify-between">
                <h3 className="text-[13px] font-bold text-white flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[17px] text-accent-ink" aria-hidden="true">view_column</span>
                    New column
                </h3>
                <button type="button" onClick={close} aria-label="Close" className="material-symbols-outlined text-[18px] text-muted hover:text-white rounded-md p-0.5 hover:bg-white/5 cursor-pointer">
                    close
                </button>
            </div>

            {/* Name */}
            <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                    <label htmlFor="new-column-name" className="text-[11px] font-semibold uppercase tracking-wider text-muted">Name</label>
                    <span className={`text-[10px] ${trimmed.length >= COLUMN_NAME_MAX ? "text-amber-400" : "text-faint"}`}>{trimmed.length}/{COLUMN_NAME_MAX}</span>
                </div>
                <input
                    id="new-column-name"
                    ref={inputRef}
                    autoFocus
                    value={name}
                    maxLength={COLUMN_NAME_MAX}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Review"
                    aria-invalid={isDuplicate}
                    aria-describedby={isDuplicate ? "new-column-name-error" : undefined}
                    className={`w-full bg-canvas border rounded-lg px-3 py-2 text-[13px] text-white placeholder-muted/60 outline-none transition-colors ${
                        isDuplicate ? "border-amber-500/60 focus:border-amber-500" : "border-line focus:border-accent-ink"
                    }`}
                />
                {isDuplicate && (
                    <p id="new-column-name-error" className="text-[11px] text-amber-400">A column with this name already exists.</p>
                )}
                {suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5" aria-label="Suggestions">
                        {suggestions.map((sug) => (
                            <button
                                key={sug.name}
                                type="button"
                                onClick={() => { setName(sug.name); setBaseStatus(sug.baseStatus); inputRef.current?.focus() }}
                                className="rounded-full border border-line px-2.5 py-0.5 text-[11px] text-muted hover:text-white hover:border-accent-ink transition-colors cursor-pointer"
                            >
                                {sug.name}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Status the column stands for */}
            <fieldset className="space-y-1.5">
                <legend className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-1.5">Cards count as</legend>
                <div className="grid grid-cols-3 gap-1.5" role="radiogroup">
                    {STATUS_OPTIONS.map((opt) => {
                        const selected = baseStatus === opt.value
                        return (
                            <button
                                key={opt.value}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                onClick={() => setBaseStatus(opt.value)}
                                className={`flex items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors cursor-pointer ${
                                    selected
                                        ? "border-accent-ink bg-[rgba(var(--primary-color-rgb),0.1)] text-white"
                                        : "border-line text-muted hover:text-white hover:border-line-strong"
                                }`}
                            >
                                <span className={`w-2 h-2 rounded-full ${opt.dot}`} aria-hidden="true" />
                                {opt.label}
                            </button>
                        )
                    })}
                </div>
                <p className="text-[11px] text-faint">{statusHint}</p>
            </fieldset>

            <div className="flex items-center gap-2 pt-1">
                <button type="button" onClick={close} className="flex-1 py-2 rounded-lg border border-line text-muted hover:text-white hover:bg-line text-[12px] font-semibold transition-colors cursor-pointer">
                    {addedCount > 0 ? "Done" : "Cancel"}
                </button>
                <button
                    type="submit"
                    disabled={saving || !trimmed || isDuplicate}
                    className="flex-1 py-2 rounded-lg bg-[var(--primary-color)] text-on-accent text-[12px] font-bold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1.5"
                >
                    {saving
                        ? <><PlanetLoader className="text-[15px]" />Adding…</>
                        : "Add column"}
                </button>
            </div>
            {addedCount > 0 && (
                <p role="status" className="text-[11px] text-accent-ink -mt-2">
                    {addedCount} column{addedCount !== 1 ? "s" : ""} added. Add another or press Done.
                </p>
            )}
        </form>
    )
}

// Confirmation before deleting a column; its tasks move to `target`
export function DeleteColumnModal({ column, target, taskCount, deleting, error, onCancel, onConfirm }) {
    return (
        <div
            className="fixed inset-0 z-[150] flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
            onClick={() => !deleting && onCancel()}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="delete-column-title"
                className="bg-surface1 border border-line rounded-2xl shadow-2xl w-full max-w-sm p-6"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 mx-auto mb-4">
                    <span className="material-symbols-outlined text-red-400 text-[32px]" aria-hidden="true">view_column</span>
                </div>
                <h2 id="delete-column-title" className="text-white font-bold text-[18px] text-center mb-2">Delete this column?</h2>
                <p className="text-white font-bold text-[15px] text-center mb-3">"{column.name}"</p>
                <p className="text-muted text-[12px] text-center mb-6">
                    {taskCount > 0
                        ? <>Its {taskCount} task{taskCount !== 1 ? "s" : ""} will move to <span className="text-white font-semibold">{target?.name}</span>. No tasks are deleted.</>
                        : "This column has no tasks. No tasks are deleted."}
                </p>
                {error && <p role="alert" className="text-red-400 text-[12px] text-center -mt-3 mb-4">{error}</p>}
                <div className="flex gap-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={deleting}
                        className="flex-1 py-2.5 rounded-xl border border-line text-muted hover:bg-line hover:text-white text-[13px] font-semibold transition-colors cursor-pointer disabled:opacity-50"
                    >
                        No, keep it
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={deleting}
                        className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-[#ffffff] text-[13px] font-bold transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                        {deleting
                            ? <><PlanetLoader className="text-[16px]" />Deleting…</>
                            : <><span className="material-symbols-outlined text-[16px]" aria-hidden="true">delete</span>Yes, delete</>}
                    </button>
                </div>
            </div>
        </div>
    )
}
