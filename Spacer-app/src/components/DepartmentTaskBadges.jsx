import { openBlocker } from "../crossDepartment"

// Orbit board pieces for cross-department projects (design screen 3).
// `departments`: { team_space_id, name }[], lead department first.

const chipClass = (isActive, tone = "accent") => {
    if (isActive && tone === "amber") return "bg-[#f59e0b]/15 border-[#f59e0b] text-[#f59e0b]"
    if (isActive) return "bg-accent border-accent text-on-accent"
    return tone === "amber"
        ? "border-[#f59e0b]/50 text-[#f59e0b] hover:bg-[#f59e0b]/10"
        : "border-line text-soft hover:text-white hover:bg-line/50"
}

// The board's filter: one department, or only blocked tasks.
// `filter` is { departmentId: string | null, isBlockedOnly: boolean }.
export function DepartmentFilterBar({ departments, filter, onChange }) {
    const chip = "px-3 py-1 rounded-full border text-xs font-semibold transition-colors cursor-pointer"
    return (
        <div className="flex items-center gap-sm flex-wrap" role="group" aria-label="Filter tasks by department">
            <button type="button" aria-pressed={!filter.departmentId} className={`${chip} ${chipClass(!filter.departmentId)}`} onClick={() => onChange({ ...filter, departmentId: null })}>
                All departments
            </button>
            {departments.map((d) => {
                const isActive = String(filter.departmentId) === String(d.team_space_id)
                return (
                    <button key={d.team_space_id} type="button" aria-pressed={isActive} className={`${chip} ${chipClass(isActive)}`} onClick={() => onChange({ ...filter, departmentId: d.team_space_id })}>
                        {d.name}
                    </button>
                )
            })}
            <button type="button" aria-pressed={filter.isBlockedOnly} className={`${chip} ml-sm ${chipClass(filter.isBlockedOnly, "amber")}`} onClick={() => onChange({ ...filter, isBlockedOnly: !filter.isBlockedOnly })}>
                Blocked only
            </button>
        </div>
    )
}

// Line on a task card: what it waits on (amber) and whose work it holds up (red)
export function TaskDependencyNote({ task, tasks, departments }) {
    const leadId = departments[0]?.team_space_id
    const nameOf = (id) => departments.find((d) => String(d.team_space_id) === String(id ?? leadId))?.name || "another department"
    const blocker = openBlocker(task, new Map(tasks.map((t) => [String(t.id), t])))
    const waiting = task.status === "done" ? [] : tasks.filter((t) => t.status !== "done" && String(t.blocked_by_task_id) === String(task.id))
    if (!blocker && waiting.length === 0) return null

    const waitingByDept = new Map()
    waiting.forEach((t) => {
        const name = nameOf(t.team_space_id)
        waitingByDept.set(name, (waitingByDept.get(name) || 0) + 1)
    })
    return (
        <div className="space-y-0.5 mb-xs">
            {blocker && (
                <p className="text-[11px] font-medium text-[#f59e0b] leading-snug">
                    Waiting on {nameOf(blocker.team_space_id)}: {blocker.title}
                </p>
            )}
            {[...waitingByDept].map(([name, count]) => (
                <p key={name} className="text-[11px] font-medium text-red-400 leading-snug">
                    Holding up {count} {name} task{count === 1 ? "" : "s"}
                </p>
            ))}
        </div>
    )
}
