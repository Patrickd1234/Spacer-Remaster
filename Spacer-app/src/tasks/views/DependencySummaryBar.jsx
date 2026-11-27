import { boardDependencySummary } from "../../departmentsView"

/**
 * Under the board (design screen 4): how many tasks wait on which department
 * and how many hold up another department, with a way to the dependencies
 * (the Departments tab, or the Timeline on a one-department project).
 * Nothing when the project has no dependencies at all and one department.
 * `tasks` carry `blocked_by`; `departments`: lead first, empty when only one.
 */
export default function DependencySummaryBar({ tasks, departments, hasAnyDependency, onView, viewLabel }) {
    const summary = boardDependencySummary(tasks, departments)
    if (!hasAnyDependency && departments.length < 2) return null
    return (
        <section aria-label="Dependency summary" className="mt-md flex items-center gap-3 rounded-xl border border-line bg-panel px-md py-2.5 flex-wrap">
            <span className="w-8 h-8 rounded-full bg-surface2 border border-line flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[17px] text-soft" aria-hidden="true">link</span>
            </span>
            <div className="flex-1 min-w-[12rem]">
                <p className="text-[13px] font-semibold text-white">Dependency summary</p>
                <p className={`text-[12px] ${summary.blockingOthers > 0 ? "text-amber-300" : "text-muted"}`}>{summary.text}</p>
            </div>
            <button type="button" onClick={onView} className="flex items-center gap-1 h-8 px-3 rounded-lg border border-line text-[12px] font-semibold text-soft hover:text-white hover:bg-line transition-colors cursor-pointer">
                {viewLabel}
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">arrow_forward</span>
            </button>
        </section>
    )
}
