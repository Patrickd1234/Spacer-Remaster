import { useEffect, useId, useRef, useState } from "react"

// "+ Add department" on the Create Project form: opens a search box over the
// departments not on the project yet; pick one with the mouse, or the arrow
// keys and Enter. Escape (or clicking elsewhere) closes it without closing
// the form. `choices`: { id, name }[]; `isInvite(id)`: the user can't create
// projects there, so picking it invites the department.
export default function DepartmentPicker({ choices, isInvite, onPick }) {
    const [isOpen, setIsOpen] = useState(false)
    const [query, setQuery] = useState("")
    const [activeIndex, setActiveIndex] = useState(0)
    const rootRef = useRef(null)
    const inputRef = useRef(null)
    const listId = useId()
    const needle = query.trim().toLowerCase()
    const shown = choices.filter((d) => d.name.toLowerCase().includes(needle))
    const active = Math.min(activeIndex, Math.max(shown.length - 1, 0))

    const close = () => { setIsOpen(false); setQuery(""); setActiveIndex(0) }
    const pick = (department) => { onPick(department); close() }

    useEffect(() => {
        if (!isOpen) return undefined
        inputRef.current?.focus()
        const onDown = (e) => {
            if (rootRef.current?.contains(e.target)) return
            setIsOpen(false)
            setQuery("")
            setActiveIndex(0)
        }
        document.addEventListener("mousedown", onDown)
        return () => document.removeEventListener("mousedown", onDown)
    }, [isOpen])

    const onKeyDown = (e) => {
        if (e.key === "Escape") {
            e.preventDefault()
            // Close only the picker, not the Create Project form
            e.nativeEvent.stopPropagation()
            close()
        } else if (e.key === "ArrowDown") {
            e.preventDefault()
            setActiveIndex(Math.min(active + 1, shown.length - 1))
        } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setActiveIndex(Math.max(active - 1, 0))
        } else if (e.key === "Enter") {
            e.preventDefault()
            if (shown[active]) pick(shown[active])
        }
    }

    if (!isOpen) {
        return (
            <button
                type="button"
                onClick={() => setIsOpen(true)}
                disabled={choices.length === 0}
                title={choices.length === 0 ? "Every department is already on it" : "Add a department that will work on this project"}
                className="w-full py-2.5 rounded-xl border border-line text-accent-ink text-[12px] font-semibold hover:bg-accent/5 hover:border-accent-ink/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1"
            >
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">add</span>
                Add department
            </button>
        )
    }

    const optionId = (index) => `${listId}-option-${index}`
    return (
        <div ref={rootRef} className="rounded-xl border border-accent-ink/40 bg-panel">
            <div className="relative border-b border-line">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-muted text-[16px]" aria-hidden="true">search</span>
                <input
                    ref={inputRef}
                    type="text"
                    role="combobox"
                    aria-expanded="true"
                    aria-controls={listId}
                    aria-activedescendant={shown.length > 0 ? optionId(active) : undefined}
                    aria-autocomplete="list"
                    aria-label="Search departments to add"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setActiveIndex(0) }}
                    onKeyDown={onKeyDown}
                    placeholder="Search departments…"
                    className="w-full bg-transparent pl-9 pr-9 py-2.5 text-[13px] text-white placeholder:text-muted/60 focus:outline-none"
                />
                <button type="button" onClick={close} aria-label="Close the department list" className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-muted hover:text-white cursor-pointer">
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">close</span>
                </button>
            </div>
            <ul id={listId} role="listbox" aria-label="Departments" className="max-h-[220px] overflow-y-auto py-1">
                {shown.length === 0 && <li className="px-3 py-2.5 text-[12px] text-muted">No department matches &ldquo;{query}&rdquo;.</li>}
                {shown.map((department, index) => {
                    const invite = isInvite(department.id)
                    return (
                        <li
                            key={department.id}
                            id={optionId(index)}
                            role="option"
                            aria-selected={index === active}
                            onMouseEnter={() => setActiveIndex(index)}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pick(department)}
                            className={`flex items-center gap-2.5 px-3 py-2 cursor-pointer ${index === active ? "bg-surface2" : ""}`}
                        >
                            <span className="w-7 h-7 rounded-md bg-surface2 border border-line flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-[15px] text-soft" aria-hidden="true">workspaces</span>
                            </span>
                            <span className="flex-1 min-w-0 text-[13px] text-white truncate">{department.name}</span>
                            {invite && (
                                <span className="shrink-0 px-2 py-0.5 rounded-full border border-line-strong text-[10px] font-bold tracking-wider text-soft" title="You can't create projects here, so this department will be invited">
                                    INVITE
                                </span>
                            )}
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}
