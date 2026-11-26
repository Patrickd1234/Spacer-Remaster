import { openBlockers, blockerEdges, dependencyState, isHoldingUp } from "../crossDepartment"

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

// Why a wait holds someone up, as a few words on the card
const STATE_WORDS = { late: "late", conflict: "due after it's needed", stalled: "waiting a while" }
const MAX_LINES = 2

// Lines on a task card: what it waits on and whose work waits on it. Amber/red
// only when a wait holds someone up (dependencyState); a normal hand-off is
// grey. `departments` may be empty (a one-department project): no names then.
export function TaskDependencyNote({ task, tasks, departments }) {
    const leadId = departments[0]?.team_space_id
    const hasDepartments = departments.length > 1
    const nameOf = (id) => departments.find((d) => String(d.team_space_id) === String(id ?? leadId))?.name || "another department"
    const now = new Date()
    const byId = new Map(tasks.map((t) => [String(t.id), t]))
    const blockers = openBlockers(task, byId).map(({ blocker }) => ({ blocker, state: dependencyState(task, blocker, now) }))
    const waiting = task.status === "done" ? [] : tasks.filter((t) => t.status !== "done" && blockerEdges(t).some((e) => String(e.id) === String(task.id)))
    if (blockers.length === 0 && waiting.length === 0) return null

    // { count, holding } per waiting department (or all together without departments)
    const waitingByDept = new Map()
    waiting.forEach((t) => {
        const name = hasDepartments ? nameOf(t.team_space_id) : ""
        const entry = waitingByDept.get(name) || { count: 0, holding: 0 }
        waitingByDept.set(name, { count: entry.count + 1, holding: entry.holding + Number(isHoldingUp(dependencyState(t, task, now))) })
    })
    const label = (name, n) => `${n}${name ? ` ${name}` : ""} task${n === 1 ? "" : "s"}`
    return (
        <div className="space-y-0.5 mb-xs">
            {blockers.slice(0, MAX_LINES).map(({ blocker, state }) => (
                <p key={blocker.id} className={`text-[11px] font-medium leading-snug ${isHoldingUp(state) ? "text-[#f59e0b]" : "text-muted"}`}>
                    Waiting on {hasDepartments ? `${nameOf(blocker.team_space_id)}: ` : ""}{blocker.title} · {STATE_WORDS[state] || "on schedule"}
                </p>
            ))}
            {blockers.length > MAX_LINES && <p className="text-[11px] text-muted leading-snug">and {blockers.length - MAX_LINES} more</p>}
            {[...waitingByDept].map(([name, { count, holding }]) => (
                <p key={name || "all"} className={`text-[11px] font-medium leading-snug ${holding > 0 ? "text-red-400" : "text-muted"}`}>
                    {holding > 0 ? `Holding up ${label(name, holding)}` : `${label(name, count)} wait${count === 1 ? "s" : ""} on this`}
                </p>
            ))}
        </div>
    )
}
