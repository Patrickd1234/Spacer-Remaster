import { Link } from "react-router-dom"
import { useRole } from "../RoleContext"
import { useHoldups } from "../holdupsData"
import { holdupsForMe, holdupReason } from "../holdups"

const MAX_ROWS = 6

function HoldupRow({ row, nameOf }) {
    const blocking = nameOf(row.blockerDepartmentId)
    const waiting = nameOf(row.waitingDepartmentId)
    return (
        <li>
            <Link
                to={`/project_page/${row.projectId}?task_id=${row.blocker.id}`}
                className="flex items-center gap-md flex-wrap rounded-lg border border-line bg-raised px-md py-sm hover:border-line-strong transition-colors"
            >
                <span className="flex items-center gap-1.5 text-xs font-semibold text-white min-w-0">
                    <span className="truncate max-w-[9rem]">{blocking}</span>
                    <span className="material-symbols-outlined text-[14px] text-red-400" aria-label="is holding up">arrow_forward</span>
                    <span className="truncate max-w-[9rem]">{waiting}</span>
                </span>
                <span className="flex-1 min-w-[10rem] text-xs text-soft truncate">
                    &ldquo;{row.blocker.title}&rdquo; <span className="text-muted">in {row.projectName}</span>
                </span>
                <span className="text-[11px] font-semibold text-red-400 whitespace-nowrap">{holdupReason(row)}</span>
            </Link>
        </li>
    )
}

function Section({ title, rows, nameOf }) {
    if (rows.length === 0) return null
    return (
        <div className="space-y-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">{title}</p>
            <ul className="space-y-sm">
                {rows.slice(0, MAX_ROWS).map((row) => <HoldupRow key={`${row.waitingTask.id}>${row.blocker.id}`} row={row} nameOf={nameOf} />)}
            </ul>
            {rows.length > MAX_ROWS && <p className="text-[11px] text-muted">And {rows.length - MAX_ROWS} more.</p>}
        </div>
    )
}

// Home page panel: which department is holding which up, across every project
// the person can see. Their departments' hold-ups first (or, for organization-
// wide admins, all of them), then what their departments are waiting on.
// Shows nothing while everything is on schedule.
export default function HoldupsPanel({ userId }) {
    const { departments, isSuperAdmin } = useRole()
    const { rows, nameOf, error, isLoaded } = useHoldups()
    if (!isLoaded) return null
    const { holdingUp, waitingOn, onScheduleCount } = holdupsForMe(rows, {
        departmentIds: departments.map((d) => d.team_space_id),
        userId,
        isOrgWide: isSuperAdmin,
    })
    if (!error && holdingUp.length === 0 && waitingOn.length === 0) return null

    return (
        <section className="bg-panel border border-red-400/30 rounded-xl p-4 space-y-4" aria-label="Hold-ups between departments">
            <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-red-400 text-[20px]">hourglass_top</span>
                <h2 className="text-[15px] font-semibold text-white">Hold-ups between departments</h2>
            </div>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <Section title={isSuperAdmin ? "Across the organization" : "Your department is holding up"} rows={holdingUp} nameOf={nameOf} />
            <Section title="Your department is waiting on" rows={waitingOn} nameOf={nameOf} />
            {onScheduleCount > 0 && (
                <p className="text-[11px] text-muted">{onScheduleCount} other hand-off{onScheduleCount === 1 ? " is" : "s are"} on schedule.</p>
            )}
        </section>
    )
}
