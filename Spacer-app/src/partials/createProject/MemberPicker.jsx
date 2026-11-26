import { useId, useState } from "react"
import { Avatar } from "../PersonPicker"
import { matchesPerson } from "../../newProject"

// A department's people on the Create Project form (design screen 1): a search
// box and a scrolling list; + adds a person, the row then shows "Added" and a
// second click removes them. The department's lead is always on the project,
// so their row says so and can't be removed.
// `people`: { id, name, jobTitle }[]; `selectedIds`: picked member ids.
export default function MemberPicker({ departmentName, people, selectedIds, leadId, isLoading, onToggle }) {
    const [query, setQuery] = useState("")
    const shown = people.filter((person) => matchesPerson(person, query))
    const selected = new Set(selectedIds)
    const searchId = useId()

    return (
        <div className="space-y-2">
            <label htmlFor={searchId} className="sr-only">Search {departmentName} members</label>
            <div className="relative">
                <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-muted text-[16px]" aria-hidden="true">search</span>
                <input
                    id={searchId}
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={`Search ${departmentName} members...`}
                    className="w-full bg-canvas border border-line rounded-lg pl-8 pr-3 py-2 text-[13px] text-white placeholder:text-muted/60 focus:outline-none focus:border-accent-ink/50"
                />
            </div>
            <ul className="max-h-[188px] overflow-y-auto rounded-lg border border-line divide-y divide-line/40" aria-label={`${departmentName} members`}>
                {isLoading && <li className="px-3 py-3 text-[12px] text-muted">Loading people…</li>}
                {!isLoading && people.length === 0 && <li className="px-3 py-3 text-[12px] text-muted">Nobody is in {departmentName} yet.</li>}
                {!isLoading && people.length > 0 && shown.length === 0 && <li className="px-3 py-3 text-[12px] text-muted">No one matches &ldquo;{query}&rdquo;.</li>}
                {shown.map((person) => {
                    const isLead = person.id === leadId
                    const isAdded = isLead || selected.has(person.id)
                    return (
                        <li key={person.id} className={`flex items-center gap-2.5 px-3 py-2 ${isAdded ? "bg-accent/[0.06]" : ""}`}>
                            <Avatar person={person} size="w-7 h-7" />
                            <div className="flex-1 min-w-0">
                                <p className="text-[13px] text-white truncate">{person.name}</p>
                                {person.jobTitle && <p className="text-[11px] text-muted truncate">{person.jobTitle}</p>}
                            </div>
                            {isLead ? (
                                <span className="flex items-center gap-1 text-[11px] font-semibold text-accent-ink" title="The department's lead is always on the project">
                                    <span className="material-symbols-outlined text-[15px]" aria-hidden="true">check</span>
                                    Lead · Added
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => onToggle(person.id)}
                                    aria-label={isAdded ? `Remove ${person.name}` : `Add ${person.name}`}
                                    className={`flex items-center gap-1 rounded-full text-[11px] font-semibold transition-colors cursor-pointer ${isAdded
                                        ? "px-2 py-0.5 text-accent-ink hover:text-red-400"
                                        : "w-6 h-6 justify-center border border-line-strong text-soft hover:text-white hover:border-white/60"}`}
                                >
                                    <span className="material-symbols-outlined text-[15px]" aria-hidden="true">{isAdded ? "check" : "add"}</span>
                                    {isAdded && "Added"}
                                </button>
                            )}
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}
