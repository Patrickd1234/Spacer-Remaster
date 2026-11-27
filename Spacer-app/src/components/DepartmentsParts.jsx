import { DEPARTMENT_STATUS } from "../crossDepartment"
import { TONES } from "./statusTones"
import { formatDay } from "../departmentsView"

// Pieces of the Departments tab (design screen 2). They only render and
// report clicks; DepartmentsTab owns the data.

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`
const percent = (s) => Math.round(s.progress * 100)

export const SectionHeading = ({ children, aside = null }) => (
    <div className="flex items-center justify-between gap-md mb-sm">
        <h3 className="text-sm font-semibold text-white">{children}</h3>
        {aside}
    </div>
)

export function StatusPill({ status }) {
    const info = DEPARTMENT_STATUS[status] || DEPARTMENT_STATUS.on_track
    return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${TONES[info.tone].pill}`}>{info.label}</span>
}

function DepartmentIcon() {
    return (
        <span className="w-9 h-9 rounded-lg bg-surface2 border border-line flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[18px] text-soft" aria-hidden="true">workspaces</span>
        </span>
    )
}

// One tile: an icon, a number, what it counts
export function StatTile({ icon, value, label }) {
    return (
        <div className="rounded-xl border border-line bg-panel px-md py-3 flex items-center gap-3">
            <span className="material-symbols-outlined text-[22px] text-muted" aria-hidden="true">{icon}</span>
            <div>
                <p className="text-lg font-bold text-white leading-tight tabular-nums">{value}</p>
                <p className="text-[11px] text-muted">{label}</p>
            </div>
        </div>
    )
}

function Figure({ value, label, tone = "" }) {
    return (
        <div>
            <p className={`text-sm font-bold tabular-nums ${tone || "text-white"}`}>{value}</p>
            <p className="text-[10px] text-muted">{label}</p>
        </div>
    )
}

// A department's card: status, lead, people and tasks, progress, and the four figures
export function DepartmentCard({ summary, memberCount, note = "", onShowTasks, actions }) {
    const tone = TONES[(DEPARTMENT_STATUS[summary.status] || DEPARTMENT_STATUS.on_track).tone]
    return (
        <article className="rounded-xl border border-line bg-panel p-md flex flex-col gap-3">
            <div className="flex items-start gap-2.5">
                <DepartmentIcon />
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <button type="button" onClick={onShowTasks} className="text-sm font-bold text-white hover:underline cursor-pointer" title={`Show ${summary.name}'s tasks`}>
                            {summary.name}
                        </button>
                        <StatusPill status={summary.status} />
                        {summary.is_lead_department && <span className="px-1.5 py-0.5 rounded-full bg-accent text-on-accent text-[9px] font-bold tracking-wider">LEAD</span>}
                    </div>
                    <p className="text-[11px] text-muted mt-0.5 truncate">Lead: {summary.lead_name || "none yet"}</p>
                </div>
            </div>
            <p className="flex items-center gap-md text-[11px] text-soft">
                {memberCount !== undefined && (
                    <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px] text-muted" aria-hidden="true">group</span>{memberCount === null ? "…" : plural(memberCount, "member")}</span>
                )}
                <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px] text-muted" aria-hidden="true">flag</span>{plural(summary.total, "task")}</span>
            </p>
            <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-line overflow-hidden" role="progressbar" aria-valuenow={percent(summary)} aria-valuemin={0} aria-valuemax={100} aria-label={`${summary.name} progress`}>
                    <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${percent(summary)}%` }} />
                </div>
                <span className="text-[11px] text-soft tabular-nums w-9 text-right">{percent(summary)}%</span>
            </div>
            <div className="grid grid-cols-4 gap-1 pt-2 border-t border-line/60">
                <Figure value={summary.done} label="Completed" />
                <Figure value={summary.overdue} label="Overdue" tone={summary.overdue > 0 ? "text-red-400" : ""} />
                <Figure value={summary.waitingOnOthers} label="Waiting on" tone={summary.waitingOnOthers > 0 ? "text-amber-400" : ""} />
                <div>
                    <p className="text-[11px] font-semibold text-white">{summary.due_date ? formatDay(summary.due_date, true) : "—"}</p>
                    <p className="text-[10px] text-muted">Due</p>
                </div>
            </div>
            {/* Why it isn't on track, in a few words */}
            {note && summary.status !== "on_track" && <p className={`text-[11px] leading-relaxed ${tone.text}`}>{note}</p>}
            {actions}
        </article>
    )
}

function DepartmentBox({ name, note, isAlert }) {
    return (
        <div className={`min-w-[8.5rem] rounded-lg border bg-raised px-3 py-2 ${isAlert ? "border-red-400/50" : "border-line"}`}>
            <p className="text-[12px] font-semibold text-white truncate">{name}</p>
            {note && <p className={`text-[10px] mt-0.5 ${isAlert ? "text-red-400" : "text-muted"}`}>{note}</p>}
        </div>
    )
}

// "Product —Waiting on→ Design": red only when the wait holds someone up
export function DependencyPairs({ pairs, nameOf, waitingDays }) {
    if (pairs.length === 0) return <p className="text-xs text-muted rounded-xl border border-line bg-panel p-md">No department is waiting on another one.</p>
    return (
        <div className="space-y-sm">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-sm">
                {pairs.map((pair) => {
                    const isHolding = pair.holdingTasks > 0
                    return (
                        <div key={`${pair.from}>${pair.to}`} className="flex items-center gap-2 rounded-xl border border-line bg-panel p-3">
                            <DepartmentBox name={nameOf(pair.from)} />
                            <div className="flex-1 min-w-[5rem] flex items-center">
                                <div className={`flex-1 h-px ${isHolding ? "bg-red-400/70" : "bg-line-strong"}`} />
                                <span className={`shrink-0 px-2 py-0.5 rounded-full border text-[10px] ${isHolding ? "border-red-400/50 text-red-400" : "border-line text-muted"}`}>
                                    Waiting on{isHolding && pair.days > 0 ? ` · ${plural(pair.days, "day")}` : ""}
                                </span>
                                <div className={`flex-1 h-px ${isHolding ? "bg-red-400/70" : "bg-line-strong"}`} />
                                <span className={`text-[10px] leading-none ${isHolding ? "text-red-400" : "text-muted"}`} aria-hidden="true">▶</span>
                            </div>
                            <DepartmentBox name={nameOf(pair.to)} note={pair.label} isAlert={isHolding} />
                        </div>
                    )
                })}
            </div>
            <p className="text-[11px] text-muted leading-relaxed">
                A line turns red only when the department waited on holds the other up: its task is overdue, due after it&apos;s needed, or (with no due date) waited on for {waitingDays}+ days. Finished tasks unblock the others automatically.
            </p>
        </div>
    )
}

// One row per department: totals, then progress; the row opens its tasks
export function BreakdownTable({ summaries, onShowTasks }) {
    const head = "px-3 py-2 text-left text-[11px] font-medium text-muted"
    const cell = "px-3 py-2.5 text-[12px] text-soft tabular-nums"
    return (
        <div className="rounded-xl border border-line bg-panel overflow-x-auto">
            <table className="w-full min-w-[640px]">
                <thead className="border-b border-line">
                    <tr>
                        <th scope="col" className={head}>Department</th>
                        <th scope="col" className={head}>Total tasks</th>
                        <th scope="col" className={head}>Completed</th>
                        <th scope="col" className={head}>In progress</th>
                        <th scope="col" className={head}>Waiting on</th>
                        <th scope="col" className={head}>Overdue</th>
                        <th scope="col" className={head}>Progress</th>
                        <th scope="col" className={head}><span className="sr-only">Open</span></th>
                    </tr>
                </thead>
                <tbody>
                    {summaries.map((s) => {
                        const tone = TONES[(DEPARTMENT_STATUS[s.status] || DEPARTMENT_STATUS.on_track).tone]
                        return (
                            <tr key={s.id} className="border-b border-line/50 last:border-0 hover:bg-surface2/40">
                                <th scope="row" className="px-3 py-2.5 text-left text-[12px] font-semibold text-white">{s.name}</th>
                                <td className={cell}>{s.total}</td>
                                <td className={cell}>{s.done}</td>
                                <td className={cell}>{s.inProgress}</td>
                                <td className={cell}>{s.waitingOnOthers}</td>
                                <td className={`${cell} ${s.overdue > 0 ? "text-red-400 font-semibold" : ""}`}>{s.overdue}</td>
                                <td className={cell}>
                                    <div className="flex items-center gap-2 min-w-[8rem]">
                                        <div className="flex-1 h-1.5 rounded-full bg-line overflow-hidden"><div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${percent(s)}%` }} /></div>
                                        <span className="w-9 text-right">{percent(s)}%</span>
                                    </div>
                                </td>
                                <td className="px-2 py-2.5 text-right">
                                    <button type="button" onClick={() => onShowTasks(s)} aria-label={`Show ${s.name}'s tasks`} className="w-7 h-7 rounded-md text-muted hover:text-white hover:bg-line flex items-center justify-center cursor-pointer">
                                        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">chevron_right</span>
                                    </button>
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}
