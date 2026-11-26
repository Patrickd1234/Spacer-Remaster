import { useEffect } from "react"
import { UNDO_WINDOW_MS } from "../useUndoable"

// The toast for useUndoable: the message, Undo, and a bar running down the time.
export default function UndoToast({ pending, onUndo, windowMs = UNDO_WINDOW_MS }) {
    // Ctrl+Z undoes while the toast shows (not while typing, where it undoes text)
    useEffect(() => {
        if (!pending) return undefined
        const onKey = (e) => {
            const tag = String(e.target?.tagName || "").toUpperCase()
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !["INPUT", "TEXTAREA"].includes(tag)) {
                e.preventDefault()
                onUndo()
            }
        }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [pending, onUndo])

    if (!pending) return null
    return (
        <div role="status" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[75] w-[min(26rem,calc(100vw-1.5rem))] rounded-xl border border-line-strong bg-raised shadow-2xl overflow-hidden animate-fadeIn">
            <div className="flex items-center gap-3 px-4 py-3">
                <span className="material-symbols-outlined text-[18px] text-muted" aria-hidden="true">delete</span>
                <p className="flex-1 min-w-0 text-[13px] text-white">{pending.message}</p>
                <button type="button" onClick={onUndo} className="px-2.5 py-1 rounded-md text-[13px] font-semibold text-accent-ink hover:bg-surface2 transition-colors cursor-pointer">
                    Undo
                </button>
            </div>
            <div key={pending.id} className="h-0.5 bg-accent-ink/60 origin-left" style={{ animation: `undo-countdown ${windowMs}ms linear forwards` }} aria-hidden="true" />
        </div>
    )
}
