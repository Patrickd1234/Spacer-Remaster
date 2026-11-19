import Select from "../components/Select"
import { meetingPlatform } from "../general/generalFormat"

export const FIELD_CLASS = "w-full bg-field border border-line hover:border-line-strong focus:border-accent-ink rounded-lg px-3 py-2 text-[13px] text-white placeholder-muted focus:outline-none transition-colors"

export function FieldLabel({ htmlFor, children, isRequired = false, icon = null }) {
    return (
        <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-xs font-medium text-white mb-1.5">
            {icon && <span className="material-symbols-outlined text-[15px] text-soft">{icon}</span>}
            {children}
            {isRequired && <span className="text-red-400" aria-hidden="true">*</span>}
        </label>
    )
}

// showPicker throws outside a user gesture and in some embedded frames; typing still works then
const openPicker = (e) => {
    try { e.currentTarget.showPicker?.() } catch { /* keyboard entry still works */ }
}

// Native date/time input that shows `display` ("Tue, 9 Dec 2026") until it is
// focused, then the browser's own editable value
export function PickerInput({ id, type, icon, value, display, onChange, isRequired = false }) {
    return (
        <div className="relative">
            <input
                id={id}
                type={type}
                value={value}
                onChange={onChange}
                onClick={openPicker}
                required={isRequired}
                className={`peer ${FIELD_CLASS} pl-9 [color-scheme:dark] cursor-pointer text-transparent focus:text-white [&::-webkit-calendar-picker-indicator]:hidden`}
            />
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-soft pointer-events-none">{icon}</span>
            <span className="absolute left-9 right-3 top-1/2 -translate-y-1/2 text-[13px] text-white truncate pointer-events-none peer-focus:hidden" aria-hidden="true">
                {display || <span className="text-muted">Pick one</span>}
            </span>
        </div>
    )
}

export function IconSelect({ id, icon, value, onChange, options, label }) {
    return (
        <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[16px] text-soft pointer-events-none z-[1]">{icon}</span>
            <Select id={id} aria-label={label} value={String(value)} onChange={onChange} className={`${FIELD_CLASS} ${icon ? "pl-9" : ""} cursor-pointer`}>
                {options.map((o) => <option key={o.value} value={String(o.value)}>{o.label}</option>)}
            </Select>
        </div>
    )
}

// Paste a link and press "Add link"; once added it shows as the platform's name
export function MeetingLinkField({ id, url, draft, onDraftChange, onAdd, onRemove }) {
    if (url) {
        return (
            <div className="flex items-center gap-2.5 bg-field border border-line rounded-lg px-3 py-2">
                <span className="material-symbols-outlined text-[16px] text-accent-ink">videocam</span>
                <span className="min-w-0 flex-1">
                    <span className="block text-[13px] text-white">{meetingPlatform(url)}</span>
                    <span className="block text-[11px] text-muted truncate">{url}</span>
                </span>
                <button type="button" onClick={onRemove} aria-label="Remove meeting link" className="text-muted hover:text-white cursor-pointer">
                    <span className="material-symbols-outlined text-[16px]">close</span>
                </button>
            </div>
        )
    }
    return (
        <div className="flex gap-2">
            <input
                id={id}
                type="url"
                inputMode="url"
                value={draft}
                onChange={(e) => onDraftChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onAdd() } }}
                placeholder="Paste a meeting link (e.g., https://meet.google.com/...)"
                className={`${FIELD_CLASS} min-w-0`}
            />
            <button
                type="button"
                onClick={onAdd}
                className="shrink-0 flex items-center gap-1.5 px-3 rounded-lg border border-line bg-raised hover:border-line-strong text-[13px] text-white transition-colors cursor-pointer"
            >
                <span className="material-symbols-outlined text-[16px]">link</span>
                Add link
            </button>
        </div>
    )
}
