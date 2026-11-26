import { useEffect, useRef, useState } from "react"
import { sameView } from "../taskViews"

// The "Views" menu: saved views to switch to, saving the current one (shared
// with the project if you manage it), and updating or deleting the one in use.
// Handlers resolve to an error message, or null.
export default function SavedViewsMenu({ views, activeViewId, currentView, meId, canShare, onApply, onCreate, onUpdate, onDelete, onReset }) {
    const [isOpen, setIsOpen] = useState(false)
    const [name, setName] = useState("")
    const [isShared, setIsShared] = useState(false)
    const [isBusy, setIsBusy] = useState(false)
    const [error, setError] = useState(null)
    const rootRef = useRef(null)
    const active = views.find((v) => v.id === activeViewId) || null
    const isChanged = active ? !sameView(active.config, currentView) : false
    const canChange = (view) => (view.is_shared ? canShare : view.owner_id === meId)

    useEffect(() => {
        if (!isOpen) return undefined
        const onDown = (e) => { if (!rootRef.current?.contains(e.target)) setIsOpen(false) }
        const onKey = (e) => { if (e.key === "Escape") { e.preventDefault(); setIsOpen(false) } }
        document.addEventListener("mousedown", onDown)
        document.addEventListener("keydown", onKey)
        return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey) }
    }, [isOpen])

    const run = async (action, after) => {
        setIsBusy(true)
        setError(null)
        const message = await action()
        setIsBusy(false)
        if (message) setError(message)
        else after?.()
    }

    const label = active ? `${active.name}${isChanged ? " (changed)" : ""}` : "Views"

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                aria-haspopup="true"
                aria-expanded={isOpen}
                onClick={() => setIsOpen((o) => !o)}
                className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-[12px] font-semibold transition-colors cursor-pointer max-w-[14rem] ${active ? "border-accent-ink/50 text-white bg-accent/10" : "border-line text-soft hover:text-white hover:border-line-strong"}`}
            >
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">bookmarks</span>
                <span className="truncate">{label}</span>
                <span className="material-symbols-outlined text-[16px] text-muted" aria-hidden="true">expand_more</span>
            </button>

            {isOpen && (
                <div className="absolute right-0 sm:left-0 sm:right-auto top-full mt-1.5 z-[45] w-[min(19rem,calc(100vw-2rem))] rounded-xl border border-line bg-panel shadow-2xl p-2">
                    {views.length > 0 ? (
                        <ul className="max-h-60 overflow-y-auto">
                            {views.map((view) => (
                                <li key={view.id}>
                                    <button
                                        type="button"
                                        onClick={() => { onApply(view); setIsOpen(false) }}
                                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left text-[13px] transition-colors cursor-pointer ${view.id === activeViewId ? "bg-surface2 text-white" : "text-soft hover:bg-surface2/60 hover:text-white"}`}
                                    >
                                        <span className="material-symbols-outlined text-[15px] text-muted" aria-hidden="true">{view.is_shared ? "group" : "person"}</span>
                                        <span className="flex-1 truncate">{view.name}</span>
                                        {view.is_shared && <span className="text-[10px] text-muted">Shared</span>}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="px-2.5 py-2 text-[12px] text-muted">No saved views yet. Set up filters, grouping and sorting, then save them here.</p>
                    )}

                    {active && (
                        <div className="flex flex-wrap gap-1 px-1 pt-2 mt-2 border-t border-line">
                            {isChanged && canChange(active) && (
                                <button type="button" disabled={isBusy} onClick={() => run(() => onUpdate(active))} className="px-2 py-1 rounded-md text-[12px] font-semibold text-accent-ink hover:bg-surface2 cursor-pointer disabled:opacity-60">
                                    Update “{active.name}”
                                </button>
                            )}
                            <button type="button" onClick={() => { onReset(); setIsOpen(false) }} className="px-2 py-1 rounded-md text-[12px] text-muted hover:text-white hover:bg-surface2 cursor-pointer">
                                Stop using it
                            </button>
                            {canChange(active) && (
                                <button type="button" disabled={isBusy} onClick={() => run(() => onDelete(active))} className="ml-auto px-2 py-1 rounded-md text-[12px] text-muted hover:text-red-400 hover:bg-surface2 cursor-pointer disabled:opacity-60">
                                    Delete
                                </button>
                            )}
                        </div>
                    )}

                    <form
                        className="px-1 pt-2 mt-2 border-t border-line space-y-2"
                        onSubmit={(e) => {
                            e.preventDefault()
                            if (!name.trim()) return
                            run(() => onCreate({ name, isShared }), () => { setName(""); setIsShared(false); setIsOpen(false) })
                        }}
                    >
                        <label htmlFor="new-view-name" className="block text-[11px] font-semibold text-muted px-1">Save what you see now</label>
                        <div className="flex gap-1.5">
                            <input
                                id="new-view-name"
                                value={name}
                                maxLength={60}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="View name"
                                className="flex-1 min-w-0 bg-field border border-line rounded-md px-2 py-1.5 text-[13px] text-white placeholder-muted focus:outline-none focus:border-accent-ink/60"
                            />
                            <button type="submit" disabled={isBusy || !name.trim()} className="px-2.5 rounded-md btn-primary-accent text-[12px] font-semibold cursor-pointer disabled:opacity-50">
                                Save
                            </button>
                        </div>
                        {canShare && (
                            <label className="flex items-center gap-2 px-1 text-[12px] text-soft cursor-pointer">
                                <input type="checkbox" checked={isShared} onChange={(e) => setIsShared(e.target.checked)} className="rounded border-line bg-field text-accent focus:ring-accent-ink/40" />
                                Share with everyone on the project
                            </label>
                        )}
                    </form>
                    {error && <p role="alert" className="px-2 pt-2 text-[12px] text-red-400">{error}</p>}
                </div>
            )}
        </div>
    )
}
