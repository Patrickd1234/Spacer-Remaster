import { useCallback, useEffect, useRef, useState } from "react"

// "Deleted “Fix login”. Undo" instead of "Are you sure?" (as Gmail, Linear and
// ClickUp do): the change shows at once and only goes to the database once
// the toast has gone, so Undo needs no second request. Leaving the page, or a
// new undoable change, sends the waiting one straight away.

export const UNDO_WINDOW_MS = 6000

/**
 * offer({ message, commit, undo }): shows the toast; commit() runs when the
 * time is up, undo() if the person clicks Undo.
 */
export function useUndoable(windowMs = UNDO_WINDOW_MS) {
    const [pending, setPending] = useState(null)
    const pendingRef = useRef(null)
    const timerRef = useRef(null)

    const flush = useCallback(() => {
        const entry = pendingRef.current
        if (!entry) return
        clearTimeout(timerRef.current)
        pendingRef.current = null
        setPending(null)
        entry.commit()
    }, [])

    const offer = useCallback((entry) => {
        flush()
        const next = { ...entry, id: `${Date.now()}-${Math.random()}` }
        pendingRef.current = next
        setPending(next)
        timerRef.current = setTimeout(flush, windowMs)
    }, [flush, windowMs])

    const undo = useCallback(() => {
        const entry = pendingRef.current
        if (!entry) return
        clearTimeout(timerRef.current)
        pendingRef.current = null
        setPending(null)
        entry.undo()
    }, [])

    // Leaving the page or closing the tab sends the waiting change
    useEffect(() => {
        window.addEventListener("pagehide", flush)
        return () => {
            window.removeEventListener("pagehide", flush)
            flush()
        }
    }, [flush])

    return { pending, offer, undo }
}

