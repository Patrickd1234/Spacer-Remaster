import Select from "../../components/Select"
import { QUICK_FILTERS, GROUP_OPTIONS, SORT_OPTIONS, PRIORITY_ORDER, UNASSIGNED_FILTER, CLEARED_FILTERS, isFilteredView } from "../taskViews"
import { TASK_STATUSES } from "../../taskStatuses"

// The Tasks tab's toolbar: Board or List, search, assignee / status /
// priority filters (design screen 04), quick filters, grouping (list only),
// sorting, and the saved-views menu (passed in as `views`).
// `onChange(changes)` updates the view. `people`: { id, name }[] to filter by.

const PRIORITY_LABELS = { urgent: "Urgent", high: "High", medium: "Medium", low: "Low" }

const selectClass = "h-8 bg-transparent border border-line hover:border-line-strong rounded-lg pl-2.5 pr-2 text-[12px] font-semibold text-soft hover:text-white transition-colors focus:outline-none focus-visible:border-accent-ink/60"

function ModeSwitch({ mode, onChange }) {
    const modes = [
        { key: "board", label: "Board", icon: "view_kanban" },
        { key: "list", label: "List", icon: "view_list" },
    ]
    return (
        <div role="radiogroup" aria-label="Show tasks as" className="flex items-center p-0.5 rounded-lg border border-line bg-raised/60">
            {modes.map((m) => (
                <button
                    key={m.key}
                    type="button"
                    role="radio"
                    aria-checked={mode === m.key}
                    onClick={() => onChange({ mode: m.key })}
                    className={`flex items-center gap-1 h-7 px-2.5 rounded-md text-[12px] font-semibold transition-colors cursor-pointer ${mode === m.key ? "bg-surface2 text-white shadow-sm" : "text-muted hover:text-white"}`}
                >
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">{m.icon}</span>
                    {m.label}
                </button>
            ))}
        </div>
    )
}

export default function TaskViewToolbar({ view, onChange, views, shownCount, totalCount, departmentFilter, hasDepartments, people = [] }) {
    const toggleQuick = (key) => onChange({ quick: view.quick.includes(key) ? view.quick.filter((k) => k !== key) : [...view.quick, key] })
    const isFiltered = isFilteredView(view)
    const filterClass = (isOn) => `${selectClass} ${isOn ? "border-accent-ink/60 text-white" : ""}`
    // A saved view may name someone no longer listed; keep them choosable
    const assigneeChoices = view.assignee && view.assignee !== UNASSIGNED_FILTER && !people.some((p) => String(p.id) === view.assignee)
        ? [...people, { id: view.assignee, name: "Someone" }]
        : people
    const groupChoices = GROUP_OPTIONS.filter((g) => g.key !== "department" || hasDepartments)

    return (
        <div className="space-y-2.5">
            <div className="flex flex-wrap items-center gap-2">
                <ModeSwitch mode={view.mode} onChange={onChange} />
                <div className="relative flex-1 min-w-[10rem] max-w-xs">
                    <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[16px] text-muted pointer-events-none" aria-hidden="true">search</span>
                    <input
                        id="task-filter"
                        type="search"
                        value={view.search}
                        maxLength={200}
                        onChange={(e) => onChange({ search: e.target.value })}
                        placeholder="Filter by title or key (F)"
                        aria-label="Filter tasks by title or key"
                        className="w-full h-8 bg-field border border-line rounded-lg pl-8 pr-2.5 text-[13px] text-white placeholder-muted focus:outline-none focus:border-accent-ink/60"
                    />
                </div>
                <Select value={view.assignee} onChange={(e) => onChange({ assignee: e.target.value })} aria-label="Filter by assignee" className={filterClass(view.assignee !== "")}>
                    <option value="">All assignees</option>
                    <option value={UNASSIGNED_FILTER}>Unassigned</option>
                    {assigneeChoices.map((p) => <option key={p.id} value={String(p.id)}>{p.name || "Someone"}</option>)}
                </Select>
                <Select value={view.status} onChange={(e) => onChange({ status: e.target.value })} aria-label="Filter by status" className={filterClass(view.status !== "")}>
                    <option value="">All statuses</option>
                    {TASK_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </Select>
                <Select value={view.priority} onChange={(e) => onChange({ priority: e.target.value })} aria-label="Filter by priority" className={filterClass(view.priority !== "")}>
                    <option value="">All priorities</option>
                    {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
                </Select>
                {view.mode === "list" && (
                    <Select value={view.groupBy} onChange={(e) => onChange({ groupBy: e.target.value })} aria-label="Group by" className={selectClass}>
                        {groupChoices.map((g) => <option key={g.key} value={g.key}>{g.key === "none" ? g.label : `Group: ${g.label}`}</option>)}
                    </Select>
                )}
                <Select value={view.sortBy} onChange={(e) => onChange({ sortBy: e.target.value })} aria-label="Sort by" className={selectClass}>
                    {SORT_OPTIONS.map((s) => <option key={s.key} value={s.key}>{`Sort: ${s.label}`}</option>)}
                </Select>
                {views}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
                {departmentFilter}
                {QUICK_FILTERS.map((f) => {
                    const isOn = view.quick.includes(f.key)
                    return (
                        <button
                            key={f.key}
                            type="button"
                            aria-pressed={isOn}
                            onClick={() => toggleQuick(f.key)}
                            className={`h-7 px-2.5 rounded-full border text-[12px] font-medium transition-colors cursor-pointer ${isOn ? "border-accent-ink/60 bg-accent/15 text-white" : "border-line text-muted hover:text-white hover:border-line-strong"}`}
                        >
                            {f.label}
                        </button>
                    )
                })}
                {isFiltered && (
                    <>
                        <span className="text-[12px] text-muted tabular-nums ml-1" aria-live="polite">{shownCount} of {totalCount}</span>
                        <button type="button" onClick={() => onChange(CLEARED_FILTERS)} className="h-7 px-2 rounded-md text-[12px] text-muted hover:text-white cursor-pointer">
                            Clear
                        </button>
                    </>
                )}
            </div>
        </div>
    )
}
