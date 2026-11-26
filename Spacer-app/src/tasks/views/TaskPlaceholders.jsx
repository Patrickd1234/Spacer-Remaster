// What the Tasks tab shows before its tasks arrive (shapes of the board or
// list, instead of a spinner) and when there's nothing to show.

const bar = "rounded bg-surface2 animate-pulse"

export function BoardSkeleton() {
    return (
        <div className="flex gap-md overflow-hidden mt-md" aria-busy="true" aria-label="Loading tasks">
            {[4, 3, 2].map((cards, column) => (
                <div key={column} className="flex-shrink-0 w-[85vw] max-w-[320px] sm:w-[280px] rounded-xl border border-line/30 bg-raised/50 p-sm space-y-sm">
                    <div className={`${bar} h-4 w-24 m-1`} />
                    {Array.from({ length: cards }, (_, i) => (
                        <div key={i} className="rounded-lg border border-line bg-raised p-md space-y-2">
                            <div className={`${bar} h-3 w-14`} />
                            <div className={`${bar} h-3.5 w-[85%]`} />
                            <div className={`${bar} h-3 w-[60%]`} />
                        </div>
                    ))}
                </div>
            ))}
        </div>
    )
}

export function ListSkeleton() {
    return (
        <div className="mt-md rounded-xl border border-line bg-panel divide-y divide-line/50" aria-busy="true" aria-label="Loading tasks">
            {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3">
                    <div className={`${bar} h-4 w-4`} />
                    <div className={`${bar} h-3.5 flex-1 max-w-[18rem]`} />
                    <div className={`${bar} h-3.5 w-20 hidden sm:block`} />
                    <div className={`${bar} h-3.5 w-24 hidden sm:block`} />
                    <div className={`${bar} h-3.5 w-16`} />
                </div>
            ))}
        </div>
    )
}

/**
 * isFiltered: tasks exist but the view hides them all (offer to clear it);
 * otherwise the project has no tasks yet (offer to add one).
 */
export function TasksEmptyState({ isFiltered, canAdd, onClear, onAdd }) {
    return (
        <div className="mt-md flex flex-col sm:flex-row items-start sm:items-center gap-3 rounded-xl border border-dashed border-line px-4 py-4">
            <span className="material-symbols-outlined text-[26px] text-muted" aria-hidden="true">{isFiltered ? "filter_alt_off" : "inventory_2"}</span>
            <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-white">{isFiltered ? "No tasks match this view" : "No tasks yet"}</p>
                <p className="text-[12px] text-muted">
                    {isFiltered
                        ? "Change the filter or quick filters, or clear them to see every task."
                        : canAdd ? "Add the first one below, or press C anywhere to create a task." : "Tasks added to this project will show here."}
                </p>
            </div>
            {isFiltered
                ? <button type="button" onClick={onClear} className="h-8 px-3 rounded-lg border border-line text-[12px] font-semibold text-soft hover:text-white hover:border-line-strong transition-colors cursor-pointer">Clear filters</button>
                : canAdd && <button type="button" onClick={onAdd} className="h-8 px-3 rounded-lg btn-primary-accent text-[12px] font-semibold cursor-pointer">Add a task</button>}
        </div>
    )
}
