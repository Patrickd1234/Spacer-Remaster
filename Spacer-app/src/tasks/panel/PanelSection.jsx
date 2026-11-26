// A titled block in the task panel: icon, title, an optional count and action
export default function PanelSection({ icon, title, count, action, children, id }) {
    return (
        <section aria-labelledby={id} className="space-y-2">
            <div className="flex items-center gap-2 min-h-[28px]">
                <span className="material-symbols-outlined text-[17px] text-muted" aria-hidden="true">{icon}</span>
                <h2 id={id} className="text-[13px] font-semibold text-white">{title}</h2>
                {count && <span className="text-[11px] text-muted tabular-nums">{count}</span>}
                {action && <div className="ml-auto">{action}</div>}
            </div>
            {children}
        </section>
    )
}

// A row's tick box: done or not, disabled without the right to change it
export function TickBox({ isDone, disabled, onToggle, label }) {
    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={isDone}
            aria-label={label}
            disabled={disabled}
            onClick={onToggle}
            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer ${isDone ? "bg-accent border-accent text-on-accent" : "border-line-strong hover:border-accent-ink"}`}
        >
            {isDone && <span className="material-symbols-outlined text-[13px] font-bold" aria-hidden="true">check</span>}
        </button>
    )
}

// "Add …" one-line form: Enter adds, Escape clears
export function AddLine({ placeholder, isBusy, onAdd, label }) {
    return (
        <form
            onSubmit={async (e) => {
                e.preventDefault()
                const input = e.currentTarget.elements.namedItem("title")
                const text = input.value.trim()
                if (!text) return
                const ok = await onAdd(text)
                if (ok) input.value = ""
            }}
            className="flex items-center gap-2"
        >
            <span className="material-symbols-outlined text-[16px] text-muted pl-0.5" aria-hidden="true">add</span>
            <input
                name="title"
                aria-label={label}
                placeholder={placeholder}
                maxLength={300}
                disabled={isBusy}
                onKeyDown={(e) => { if (e.key === "Escape" && e.currentTarget.value) { e.preventDefault(); e.currentTarget.value = "" } }}
                className="flex-1 min-w-0 bg-transparent border-b border-transparent hover:border-line focus:border-accent-ink/60 py-1.5 text-[13px] text-white placeholder-muted focus:outline-none transition-colors disabled:opacity-60"
            />
        </form>
    )
}
