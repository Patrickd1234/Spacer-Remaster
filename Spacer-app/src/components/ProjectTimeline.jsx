import { layoutTimeline } from "../timelineLayout"
import { taskHoldupRoles } from "../crossDepartment"

const DAY_W = 28
const ROW_H = 30
const LANE_PAD = 10
const HEADER_H = 36
const LABEL_W = 150

const BAR_TONES = {
    holding: "bg-red-500/15 border-red-400 text-white",
    held: "bg-amber-500/15 border-amber-400 text-white",
    done: "bg-line/60 border-line text-muted line-through",
    normal: "bg-accent/15 border-accent-ink/60 text-white",
}

const dayLabel = (date) => date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })

// Day numbers along the top, with the month where it starts
function DateHeader({ range }) {
    return (
        <div className="relative border-b border-line" style={{ height: HEADER_H, width: range.days * DAY_W }}>
            {Array.from({ length: range.days }, (_, i) => {
                const date = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate() + i)
                const isWeekend = date.getDay() === 0 || date.getDay() === 6
                const isMonthStart = i === 0 || date.getDate() === 1
                return (
                    <div key={i} className={`absolute top-0 bottom-0 flex flex-col items-center justify-end pb-1 text-[10px] ${isWeekend ? "text-muted/60" : "text-muted"}`} style={{ left: i * DAY_W, width: DAY_W }}>
                        {isMonthStart && <span className="absolute top-1 left-1 whitespace-nowrap text-[10px] font-semibold text-soft">{date.toLocaleDateString("en-GB", { month: "short" })}</span>}
                        {date.getDate()}
                    </div>
                )
            })}
        </div>
    )
}

// A vertical line through the lanes: today, the deadline, or a department's due date
function DayLine({ day, top, height, className, label }) {
    if (day === null || day === undefined) return null
    return (
        <div className={`absolute w-0 border-l ${className}`} style={{ left: day * DAY_W + DAY_W / 2, top, height }} aria-hidden="true">
            {label && <span className="absolute -top-0 left-1 text-[9px] font-semibold whitespace-nowrap opacity-80">{label}</span>}
        </div>
    )
}

/**
 * A project's Timeline: a lane per department, a bar per task from when it was
 * created to its due date, and arrows from each task to the tasks waiting on
 * it, red when it holds them up. Today, the deadline and each department's due
 * date are lines. `tasks` carry `blocked_by` (attachDependencies).
 */
export default function ProjectTimeline({ tasks, departments, projectDueDate, onOpenTask }) {
    const now = new Date()
    const layout = layoutTimeline({ tasks, departments, projectDueDate, now })
    const roles = taskHoldupRoles(tasks, now)
    const width = layout.range.days * DAY_W

    // Where each lane starts, and the middle of each bar for the arrows
    const lanes = layout.lanes.reduce((placed, lane) => {
        const previous = placed[placed.length - 1]
        const laneTop = previous ? previous.top + previous.height : 0
        return [...placed, { ...lane, top: laneTop, height: lane.rowCount * ROW_H + LANE_PAD * 2 }]
    }, [])
    const totalHeight = lanes.reduce((sum, lane) => sum + lane.height, 0)
    const points = new Map()
    lanes.forEach((lane) => lane.bars.forEach((bar) => {
        const y = lane.top + LANE_PAD + bar.row * ROW_H + ROW_H / 2
        points.set(String(bar.task.id), { startX: bar.from * DAY_W + 2, endX: (bar.to + 1) * DAY_W - 2, y })
    }))

    if (tasks.length === 0) return <p className="text-sm text-muted">No tasks yet. Tasks appear here from when they're created to their due date.</p>

    return (
        <div className="space-y-sm">
            <p className="text-[11px] text-muted">
                Bars run from when a task was created to its due date (dashed: no due date). Arrows point from a task to the tasks waiting on it: <span className="text-red-400">red</span> when it holds them up, grey when on schedule.
            </p>
            <div className="rounded-xl border border-line bg-panel overflow-hidden flex">
                {/* Department names stay put while the days scroll */}
                <div className="shrink-0 border-r border-line bg-raised" style={{ width: LABEL_W }}>
                    <div className="border-b border-line" style={{ height: HEADER_H }} />
                    {lanes.map((lane) => (
                        <div key={lane.id} className="px-3 flex items-start pt-3 border-b border-line/50 text-xs font-semibold text-white truncate" style={{ height: lane.height }}>
                            {lane.name}
                        </div>
                    ))}
                </div>
                <div className="overflow-x-auto flex-1">
                    <DateHeader range={layout.range} />
                    <div className="relative" style={{ width, height: totalHeight }}>
                        {lanes.map((lane) => (
                            <div key={lane.id} className="absolute left-0 border-b border-line/50" style={{ top: lane.top, height: lane.height, width }}>
                                <DayLine day={lane.dueDay} top={0} height={lane.height} className="border-dashed border-soft/50 text-soft" label="due" />
                            </div>
                        ))}
                        <DayLine day={layout.todayDay} top={0} height={totalHeight} className="border-accent-ink/70 text-accent-ink" label="today" />
                        <DayLine day={layout.projectDueDay} top={0} height={totalHeight} className="border-red-400/70 text-red-400" label="deadline" />

                        <svg className="absolute inset-0 pointer-events-none" width={width} height={totalHeight} aria-hidden="true">
                            <defs>
                                {["holding", "normal"].map((kind) => (
                                    <marker key={kind} id={`timeline-arrow-${kind}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                                        <path d="M0,0 L8,4 L0,8 z" className={kind === "holding" ? "fill-red-400" : "fill-muted"} />
                                    </marker>
                                ))}
                            </defs>
                            {layout.arrows.map((arrow) => {
                                const from = points.get(arrow.fromId)
                                const to = points.get(arrow.toId)
                                if (!from || !to) return null
                                const bend = Math.max(24, Math.abs(to.startX - from.endX) / 2)
                                const d = `M${from.endX},${from.y} C${from.endX + bend},${from.y} ${to.startX - bend},${to.y} ${to.startX},${to.y}`
                                return <path key={`${arrow.fromId}>${arrow.toId}`} d={d} fill="none" strokeWidth={arrow.isHolding ? 2 : 1.25}
                                    className={arrow.isHolding ? "stroke-red-400" : "stroke-muted opacity-60"} markerEnd={`url(#timeline-arrow-${arrow.isHolding ? "holding" : "normal"})`} />
                            })}
                        </svg>

                        {lanes.map((lane) => lane.bars.map((bar) => {
                            const tone = bar.task.status === "done" ? "done" : roles.get(String(bar.task.id)) || "normal"
                            const due = bar.task.due_date ? `due ${dayLabel(new Date(`${String(bar.task.due_date).slice(0, 10)}T00:00:00`))}` : "no due date"
                            return (
                                <button
                                    key={bar.task.id}
                                    type="button"
                                    onClick={() => onOpenTask(bar.task)}
                                    title={`${bar.task.title} · ${due}`}
                                    className={`absolute rounded-md border px-1.5 text-left text-[11px] font-medium truncate hover:brightness-125 transition cursor-pointer ${BAR_TONES[tone]} ${bar.hasNoDueDate ? "border-dashed" : ""}`}
                                    style={{ left: bar.from * DAY_W + 2, width: Math.max(DAY_W - 4, (bar.to - bar.from + 1) * DAY_W - 4), top: lane.top + LANE_PAD + bar.row * ROW_H + 3, height: ROW_H - 6 }}
                                >
                                    {bar.task.title}
                                </button>
                            )
                        }))}
                    </div>
                </div>
            </div>
        </div>
    )
}
