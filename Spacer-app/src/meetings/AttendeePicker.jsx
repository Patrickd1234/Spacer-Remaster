import { useId, useState } from "react"
import { Avatar } from "../general/GeneralParts"
import { searchAttendees, attendeeKey } from "./meetingFormat"

function AttendeeAvatar({ attendee }) {
    if (attendee.kind === "team") {
        return (
            <span className="w-5 h-5 rounded-full bg-blue-500/15 text-blue-300 flex items-center justify-center shrink-0" aria-hidden="true">
                <span className="material-symbols-outlined text-[13px]">groups</span>
            </span>
        )
    }
    return <Avatar name={attendee.name} url={attendee.avatarUrl} size="xs" />
}

function AttendeeChip({ attendee, onRemove }) {
    return (
        <li className="flex items-center gap-2 pl-1 pr-1.5 py-1 rounded-full bg-raised border border-line text-xs text-white max-w-full">
            <AttendeeAvatar attendee={attendee} />
            <span className="truncate">{attendee.name}</span>
            <button
                type="button"
                onClick={() => onRemove(attendee)}
                aria-label={`Remove ${attendee.name}`}
                className="w-4 h-4 rounded-full flex items-center justify-center text-muted hover:text-white hover:bg-line transition-colors cursor-pointer"
            >
                <span className="material-symbols-outlined text-[13px]">close</span>
            </button>
        </li>
    )
}

// Search box over the organization's people and departments, with the chosen
// ones as removable chips. people need { id, name, email, avatarUrl }.
export default function AttendeePicker({ people, teams, selfId, value, onChange, isLoading, inputRef }) {
    const [query, setQuery] = useState("")
    const [isOpen, setIsOpen] = useState(false)
    const [activeIndex, setActiveIndex] = useState(0)
    const listId = useId()
    const results = isOpen ? searchAttendees(people, teams, query, value, selfId) : []
    const avatarOf = new Map(people.map((p) => [p.id, p.avatarUrl]))

    const add = (option) => {
        onChange([...value, option])
        setQuery("")
        setActiveIndex(0)
    }
    const remove = (attendee) => onChange(value.filter((a) => attendeeKey(a) !== attendeeKey(attendee)))

    const handleKeyDown = (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault()
            setIsOpen(true)
            const step = e.key === "ArrowDown" ? 1 : -1
            setActiveIndex((i) => (results.length ? (i + step + results.length) % results.length : 0))
        } else if (e.key === "Enter") {
            // Never submits the form from here
            e.preventDefault()
            if (results[activeIndex]) add(results[activeIndex])
        } else if (e.key === "Escape" && isOpen) {
            // Close the list, not the dialog
            e.preventDefault()
            e.stopPropagation()
            setIsOpen(false)
        } else if (e.key === "Backspace" && !query && value.length) {
            remove(value[value.length - 1])
        }
    }

    return (
        <div className="space-y-3">
            <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-muted text-[16px] pointer-events-none">search</span>
                <input
                    ref={inputRef}
                    type="text"
                    role="combobox"
                    aria-label="Search people or departments to invite"
                    aria-expanded={isOpen && results.length > 0}
                    aria-controls={listId}
                    aria-activedescendant={isOpen && results[activeIndex] ? `${listId}-${activeIndex}` : undefined}
                    aria-autocomplete="list"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setIsOpen(true); setActiveIndex(0) }}
                    onFocus={() => setIsOpen(true)}
                    onBlur={() => setIsOpen(false)}
                    onKeyDown={handleKeyDown}
                    placeholder={isLoading ? "Loading people…" : "Search people or teams…"}
                    disabled={isLoading}
                    className="w-full bg-field border border-line focus:border-accent-ink rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-muted focus:outline-none transition-colors disabled:opacity-60"
                />
                {isOpen && (
                    <ul id={listId} role="listbox" className="absolute z-10 left-0 right-0 mt-1.5 max-h-64 overflow-y-auto bg-raised border border-line rounded-xl shadow-2xl p-1">
                        {results.length === 0 && (
                            <li role="option" aria-disabled="true" aria-selected="false" className="px-3 py-2.5 text-xs text-muted">{query.trim() ? "No one matches that search." : "Everyone's already invited."}</li>
                        )}
                        {results.map((option, index) => (
                            <li
                                key={attendeeKey(option)}
                                id={`${listId}-${index}`}
                                role="option"
                                aria-selected={index === activeIndex}
                                // Keep focus in the search box so the list doesn't close first
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => add(option)}
                                onMouseEnter={() => setActiveIndex(index)}
                                className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer ${index === activeIndex ? "bg-surface2" : ""}`}
                            >
                                <AttendeeAvatar attendee={option} />
                                <span className="min-w-0">
                                    <span className="block text-sm text-white truncate">{option.name}</span>
                                    <span className="block text-[11px] text-muted truncate">{option.detail}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            {value.length > 0 && (
                <ul className="flex flex-col items-start gap-2" aria-label="Invited">
                    {value.map((attendee) => (
                        <AttendeeChip
                            key={attendeeKey(attendee)}
                            attendee={{ ...attendee, avatarUrl: attendee.avatarUrl ?? avatarOf.get(attendee.id) }}
                            onRemove={remove}
                        />
                    ))}
                </ul>
            )}
        </div>
    )
}
