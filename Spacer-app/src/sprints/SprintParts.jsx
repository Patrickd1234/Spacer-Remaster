import Select from "../components/Select"
import { STORY_POINT_OPTIONS } from "./sprintMath"

const STATUS_STYLES = {
    todo: { label: "To do", dot: "bg-[#8c947b]" },
    in_progress: { label: "In progress", dot: "bg-amber-400" },
    done: { label: "Done", dot: "bg-[#22c55e]" },
}

const SMALL_SELECT_CLASS = "bg-[#111318] border border-[#2D3139] hover:border-[#3d424d] focus:border-[var(--primary-color)] rounded-lg px-2 py-1 text-white text-xs focus:outline-none transition-colors"

export const CARD_CLASS = "rounded-2xl border border-[#2D3139] bg-[#191c21] p-5"

export function StatTile({ label, value, hint = null }) {
    return (
        <div className="rounded-xl border border-[#2D3139] bg-[#1C1F26] px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#8c947b]">{label}</p>
            <p className="mt-1 text-xl font-bold text-white">{value}</p>
            {hint && <p className="text-[11px] text-[#8c947b]">{hint}</p>}
        </div>
    )
}

export function SprintStatusChip({ status }) {
    const styles = {
        active: "bg-[rgba(var(--primary-color-rgb),0.12)] text-[var(--primary-color)]",
        planned: "bg-sky-500/10 text-sky-300",
        completed: "bg-white/5 text-[#8c947b]",
    }
    return <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${styles[status] || styles.completed}`}>{status}</span>
}

// One task in a sprint or the backlog. moveOptions: [{ value, label }] where
// "" is the backlog; leave it empty to hide the move control.
export function SprintTaskRow({ task, moveOptions = [], onMove, onPoints, isBusy = false }) {
    const status = STATUS_STYLES[task.status] || STATUS_STYLES.todo
    const points = task.story_points ?? ""
    return (
        <li className="flex flex-wrap items-center gap-3 rounded-xl border border-[#2D3139] bg-[#1C1F26] px-3 py-2.5">
            <span className={`h-2 w-2 shrink-0 rounded-full ${status.dot}`} aria-hidden="true" />
            <span className="flex-1 min-w-[140px]">
                <span className={`block truncate text-sm font-medium ${task.status === "done" ? "text-[#8c947b] line-through" : "text-white"}`}>{task.title}</span>
                <span className="block text-[11px] text-[#8c947b]">{status.label}</span>
            </span>
            <Select aria-label={`Story points for ${task.title}`} className={`${SMALL_SELECT_CLASS} w-[88px]`} value={String(points)} disabled={isBusy} onChange={(e) => onPoints(e.target.value === "" ? null : Number(e.target.value))}>
                <option value="">No estimate</option>
                {STORY_POINT_OPTIONS.map((p) => <option key={p} value={String(p)}>{p} pt{p === 1 ? "" : "s"}</option>)}
            </Select>
            {moveOptions.length > 0 && (
                <Select aria-label={`Move ${task.title}`} className={`${SMALL_SELECT_CLASS} w-[150px]`} value="__move" disabled={isBusy} onChange={(e) => onMove(e.target.value || null)}>
                    <option value="__move" disabled>Move to…</option>
                    {moveOptions.map((o) => <option key={o.value || "backlog"} value={o.value}>{o.label}</option>)}
                </Select>
            )}
        </li>
    )
}

const CHART_WIDTH = 600
const CHART_HEIGHT = 160
const CHART_PAD = 8

// Work left per day (solid) against the even ideal (dashed)
export function BurndownChart({ chart }) {
    const { days, total, unit } = chart
    if (days.length < 2 || total === 0) {
        return <p className="text-xs text-[#8c947b]">The burndown appears once the sprint has estimated or planned work and lasts more than a day.</p>
    }
    const x = (i) => CHART_PAD + (i * (CHART_WIDTH - 2 * CHART_PAD)) / (days.length - 1)
    const y = (value) => CHART_PAD + (1 - value / total) * (CHART_HEIGHT - 2 * CHART_PAD)
    const line = (points) => points.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ")
    const ideal = line(days.map((d, i) => [x(i), y(d.ideal)]))
    const actualDays = days.map((d, i) => [i, d.remaining]).filter(([, r]) => r !== null)
    const actual = line(actualDays.map(([i, r]) => [x(i), y(r)]))
    const last = actualDays[actualDays.length - 1]
    const fmt = (key) => new Date(`${key}T00:00:00`).toLocaleDateString([], { day: "numeric", month: "short" })
    return (
        <figure>
            <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="w-full h-40" role="img" aria-label={`Burndown: ${last ? last[1] : total} of ${total} ${unit} left`}>
                {[0, 0.5, 1].map((f) => (
                    <line key={f} x1={CHART_PAD} x2={CHART_WIDTH - CHART_PAD} y1={y(total * f)} y2={y(total * f)} stroke="#2D3139" strokeWidth="1" />
                ))}
                <path d={ideal} fill="none" stroke="#8c947b" strokeWidth="2" strokeDasharray="6 6" />
                {actual && <path d={actual} fill="none" stroke="var(--primary-color)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
                {last && <circle cx={x(last[0])} cy={y(last[1])} r="5" fill="var(--primary-color)" />}
            </svg>
            <figcaption className="mt-1 flex items-center justify-between text-[11px] text-[#8c947b]">
                <span>{fmt(days[0].date)}</span>
                <span className="flex items-center gap-3">
                    <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 bg-[var(--primary-color)]" />{unit} left</span>
                    <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 border-t-2 border-dashed border-[#8c947b]" />ideal</span>
                </span>
                <span>{fmt(days[days.length - 1].date)}</span>
            </figcaption>
        </figure>
    )
}
