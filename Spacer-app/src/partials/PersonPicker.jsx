import PersonPhoto from "../avatars/PersonPhoto"

// Building blocks for choosing people from the organization in the Create
// Department form: initials avatar, single-select lead list, multi-select grid.

const initialsOf = (person) =>
    (person.name || person.email || "?")
        .split(/[\s@.]+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0].toUpperCase())
        .join("")

export function Avatar({ person, size = "w-7 h-7" }) {
    return (
        <div className={`${size} rounded-full overflow-hidden bg-surface2 border border-line flex items-center justify-center shrink-0 text-[10px] font-bold text-primary-fixed`}>
            <PersonPhoto userId={person.id} fallback={initialsOf(person)} />
        </div>
    )
}

export function SearchField({ value, onChange, placeholder, onFocus, isOpen, onToggle }) {
    return (
        <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-muted text-[16px]">search</span>
            <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onFocus={onFocus}
                placeholder={placeholder}
                className="w-full bg-panel border border-line rounded-lg pl-9 pr-9 py-2.5 text-sm text-white placeholder-muted/60 focus:outline-none focus:border-accent-ink"
            />
            <button
                type="button"
                onClick={onToggle}
                aria-label={isOpen ? "Hide list" : "Show list"}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-white cursor-pointer"
            >
                <span className={`material-symbols-outlined text-[18px] transition-transform ${isOpen ? "rotate-180" : ""}`}>expand_more</span>
            </button>
        </div>
    )
}

export function PersonRow({ person, onSelect }) {
    return (
        <button
            type="button"
            onClick={() => onSelect(person)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-surface2 transition-colors cursor-pointer"
        >
            <Avatar person={person} />
            <div className="min-w-0">
                <p className="text-sm text-white truncate">{person.name || person.email}</p>
                <p className="text-[11px] text-muted truncate">{person.email}</p>
            </div>
        </button>
    )
}

export function SelectedPerson({ person, onClear }) {
    return (
        <div className="flex items-center gap-3 px-3 py-2.5 bg-panel border border-line rounded-lg">
            <Avatar person={person} />
            <div className="min-w-0 flex-1">
                <p className="text-sm text-white truncate">{person.name || person.email}</p>
                <p className="text-[11px] text-muted truncate">{person.email}</p>
            </div>
            <button type="button" onClick={onClear} aria-label="Remove lead" className="text-muted hover:text-white cursor-pointer">
                <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
        </div>
    )
}

export function PersonCheckCard({ person, isChecked, onToggle }) {
    return (
        <label className={`relative flex flex-col items-center text-center gap-1.5 p-3 rounded-lg border cursor-pointer transition-colors ${isChecked ? "border-[rgba(var(--primary-color-rgb),0.6)] bg-surface1" : "border-line hover:bg-surface1"}`}>
            <input
                type="checkbox"
                checked={isChecked}
                onChange={() => onToggle(person)}
                className="absolute top-2 left-2 w-3.5 h-3.5 rounded bg-transparent border-line-strong text-accent-ink focus:ring-0 focus:ring-offset-0"
            />
            <Avatar person={person} />
            <p className="text-xs text-white truncate max-w-full">{person.name || person.email}</p>
            <p className="text-[10px] text-muted truncate max-w-full">{person.email}</p>
        </label>
    )
}

const VISIBLE_CHIPS = 2

export function Chips({ labels, onRemove }) {
    if (labels.length === 0) return null
    const hidden = labels.length - VISIBLE_CHIPS
    return (
        <div className="flex flex-wrap items-center gap-1.5">
            {labels.slice(0, VISIBLE_CHIPS).map(({ key, text }) => (
                <span key={key} className="flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-md bg-surface1 border border-line text-[11px] text-white">
                    {text}
                    <button type="button" onClick={() => onRemove(key)} aria-label={`Remove ${text}`} className="text-muted hover:text-white cursor-pointer">
                        <span className="material-symbols-outlined text-[13px]">close</span>
                    </button>
                </span>
            ))}
            {hidden > 0 && (
                <span className="px-2 py-1 rounded-md bg-[rgba(var(--primary-color-rgb),0.15)] text-[11px] font-semibold text-primary-fixed">+{hidden}</span>
            )}
        </div>
    )
}
