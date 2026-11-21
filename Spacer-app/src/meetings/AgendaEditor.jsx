import { useState } from "react"
import { newAgendaItem, AGENDA_MAX_ITEMS, AGENDA_TEXT_MAX } from "./meetingFormat"

// Offered while the agenda is empty; one click adds one
const SUGGESTIONS = ["Review project progress", "Discuss blockers", "Align on next steps"]

function CheckBox({ checked, onChange, label }) {
    return (
        <span className="relative w-4 h-4 shrink-0">
            <input type="checkbox" checked={checked} onChange={onChange} aria-label={label} className="peer absolute inset-0 opacity-0 cursor-pointer" />
            <span className="pointer-events-none absolute inset-0 rounded border border-line-strong bg-field peer-checked:bg-accent peer-checked:border-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent/40 flex items-center justify-center">
                {checked && <span className="material-symbols-outlined text-[13px] text-on-accent font-bold">check</span>}
            </span>
        </span>
    )
}

// Agenda checklist: tick, rename, remove; Enter adds the next item.
// items: [{ key, text, done }]
export default function AgendaEditor({ items, onChange }) {
    const [focusKey, setFocusKey] = useState(null)
    const isFull = items.length >= AGENDA_MAX_ITEMS

    const update = (key, changes) => onChange(items.map((item) => (item.key === key ? { ...item, ...changes } : item)))
    const remove = (key) => onChange(items.filter((item) => item.key !== key))
    const addAfter = (index, text = "") => {
        if (isFull) return
        const item = newAgendaItem(text)
        onChange([...items.slice(0, index + 1), item, ...items.slice(index + 1)])
        if (!text) setFocusKey(item.key)
    }

    const handleKeyDown = (e, item, index) => {
        if (e.key === "Enter") {
            e.preventDefault()
            if (item.text.trim()) addAfter(index)
        } else if (e.key === "Backspace" && !item.text) {
            e.preventDefault()
            remove(item.key)
            const previous = items[index - 1]
            if (previous) setFocusKey(previous.key)
        }
    }

    return (
        <div className="space-y-1">
            <ul className="space-y-0.5">
                {items.map((item, index) => (
                    <li key={item.key} className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1 hover:bg-raised focus-within:bg-raised">
                        <CheckBox checked={item.done} onChange={(e) => update(item.key, { done: e.target.checked })} label={`Done: ${item.text || "agenda item"}`} />
                        <input
                            // Only the row just added takes focus
                            ref={(el) => { if (el && item.key === focusKey) { el.focus(); setFocusKey(null) } }}
                            type="text"
                            value={item.text}
                            maxLength={AGENDA_TEXT_MAX}
                            onChange={(e) => update(item.key, { text: e.target.value })}
                            onKeyDown={(e) => handleKeyDown(e, item, index)}
                            placeholder="Agenda item"
                            aria-label={`Agenda item ${index + 1}`}
                            className={`flex-1 min-w-0 bg-transparent text-[13px] placeholder-muted focus:outline-none ${item.done ? "text-muted line-through" : "text-white"}`}
                        />
                        <button
                            type="button"
                            onClick={() => remove(item.key)}
                            aria-label={`Remove agenda item ${index + 1}`}
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted hover:text-white transition-opacity cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                        </button>
                    </li>
                ))}
                {items.length === 0 && SUGGESTIONS.map((text) => (
                    <li key={text}>
                        <button
                            type="button"
                            onClick={() => addAfter(items.length - 1, text)}
                            className="w-full flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-left text-[13px] text-soft hover:text-white hover:bg-raised transition-colors cursor-pointer"
                        >
                            <span className="w-4 h-4 rounded border border-line-strong bg-field shrink-0" aria-hidden="true" />
                            {text}
                            <span className="ml-auto text-[10px] uppercase tracking-wide text-faint">Suggested</span>
                        </button>
                    </li>
                ))}
            </ul>
            {!isFull && (
                <button
                    type="button"
                    onClick={() => addAfter(items.length - 1)}
                    className="flex items-center gap-2.5 px-1.5 py-1 text-[13px] text-soft hover:text-white transition-colors cursor-pointer"
                >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    Add agenda item
                </button>
            )}
        </div>
    )
}
