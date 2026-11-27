import { useState } from "react"
import Select from "./Select"
import { StatTile } from "./DepartmentsParts"
import { KeyDatesCard, InsightsCard } from "./TimelineParts"
import PersonPhoto from "../avatars/PersonPhoto"
import { taskHoldupRoles, daysBetween } from "../crossDepartment"
import { waitingLabel } from "../tasks/waiting"
import {
    TIMELINE_VIEWS, windowStart, shiftWindow, taskSpan, placeInWindow, timelineGroups, timelineArrows,
    timelineStats, keyDates, timelineInsights, addDays, toDay,
} from "../timelineLayout"

const ROW_H = 44
const GROUP_H = 36
const HEADER_H = 46
const LEFT_W = 300
const MIN_ROWS_H = 220

const BAR_TONES = {
    holding: "bg-red-500/20 border-red-400/80",
    held: "bg-amber-500/15 border-amber-400/80",
    done: "bg-line/50 border-line text-muted",
    normal: "bg-accent/15 border-accent-ink/50",
}
const shortDay = (date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })

// Day columns along the top: the month where it starts, then the day; today highlighted
function DayHeader({ start, view }) {
    const today = toDay(new Date())
    return (
        <div className="relative border-b border-line" style={{ height: HEADER_H, width: view.days * view.dayWidth }}>
            {Array.from({ length: view.days }, (_, i) => {
                const date = addDays(start, i)
                const isToday = date.getTime() === today.getTime()
                const isWeekend = date.getDay() === 0 || date.getDay() === 6
                const showMonth = i === 0 || date.getDate() === 1
                const label = view.key === "week"
                    ? `${date.toLocaleDateString("en-GB", { weekday: "short" })} ${date.getDate()}`
                    : String(date.getDate())
                return (
                    <div key={i} className="absolute top-0 bottom-0 flex flex-col justify-end items-center pb-1.5" style={{ left: i * view.dayWidth, width: view.dayWidth }}>
                        {showMonth && <span className="absolute top-1 left-1 text-[10px] font-semibold text-soft whitespace-nowrap">{date.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</span>}
                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] whitespace-nowrap ${isToday ? "bg-accent text-on-accent font-bold" : isWeekend ? "text-muted/50" : "text-muted"}`}>{label}</span>
                    </div>
                )
            })}
        </div>
    )
}

function VerticalLine({ day, view, height, className, label }) {
    if (day === null || day < 0 || day > view.days - 1) return null
    return (
        <div className={`absolute top-0 w-0 border-l ${className}`} style={{ left: day * view.dayWidth + view.dayWidth / 2, height }} aria-hidden="true">
            {label && <span className="absolute top-0.5 left-1 text-[9px] font-semibold whitespace-nowrap">{label}</span>}
        </div>
    )
}

function StatusIcon({ task }) {
    if (task.status === "done") return <span role="img" className="material-symbols-outlined text-[17px] text-accent-ink" aria-label="Done">check_circle</span>
    if (task.status === "waiting") return <span role="img" className="material-symbols-outlined text-[17px] text-amber-400" aria-label="Waiting">schedule</span>
    return <span role="img" className="material-symbols-outlined text-[17px] text-muted" aria-label="Open">radio_button_unchecked</span>
}

/**
 * A project's Timeline (design screen 7): four tiles; a two-week or six-week
 * window you move through; one row per task (grouped by department on a
 * Collab project, groups fold) with its assignee beside a bar from when it was
 * created to its due date; arrows from a task to the tasks waiting on it (red
 * when it holds them up); lines for today, the deadline and each department's
 * due date; key dates and insights worked out from the tasks.
 * `tasks` carry `blocked_by`; `departments`: lead first, empty when only one;
 * `people`: { id, name }[] for assignees.
 */
export default function ProjectTimeline({ tasks, departments, projectDueDate, people = [], onOpenTask }) {
    const now = new Date()
    const [viewKey, setViewKey] = useState("week")
    const [start, setStart] = useState(() => windowStart("week", now))
    const [folded, setFolded] = useState(() => new Set())
    const view = TIMELINE_VIEWS[viewKey]
    const width = view.days * view.dayWidth
    const end = addDays(start, view.days - 1)
    const dayIndex = (value) => (value ? daysBetween(start, toDay(value)) : null)
    const isSplit = departments.length > 1
    const roles = taskHoldupRoles(tasks, now)
    const nameOf = (id) => people.find((p) => String(p.id) === String(id))?.name

    const changeView = (next) => {
        setViewKey(next)
        setStart(windowStart(next, now))
    }
    const toggleGroup = (id) => setFolded((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
    })

    // The rows in order, with where each sits
    const groups = timelineGroups(tasks, departments)
    const rows = []
    let top = 0
    groups.forEach((group) => {
        if (isSplit) {
            rows.push({ kind: "group", group, top, height: GROUP_H })
            top += GROUP_H
        }
        if (folded.has(group.id)) return
        group.tasks.forEach((task) => {
            rows.push({ kind: "task", task, group, top, height: ROW_H })
            top += ROW_H
        })
    })
    const rowsHeight = Math.max(top, MIN_ROWS_H)
    const placed = new Map()
    rows.filter((r) => r.kind === "task").forEach((r) => {
        const span = taskSpan(r.task)
        const spot = placeInWindow(span, start, view.days)
        if (spot) placed.set(String(r.task.id), { ...spot, hasNoDueDate: span.hasNoDueDate, y: r.top + ROW_H / 2, row: r })
    })
    const arrows = timelineArrows(tasks, now).filter((a) => placed.has(a.fromId) && placed.has(a.toId))
    // Tasks in open groups whose bar is outside these dates
    const shownTaskRows = rows.filter((r) => r.kind === "task").length
    const outside = shownTaskRows - placed.size

    const stats = timelineStats(tasks, now)
    const tiles = (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-sm">
            <StatTile icon="task_alt" value={`${stats.progress}%`} label="Overall progress" />
            <StatTile icon="stacks" value={stats.total} label="Total tasks" />
            <StatTile icon="schedule" value={stats.overdue} label={stats.overdue === 1 ? "Overdue task" : "Overdue tasks"} />
            <StatTile icon="link" value={stats.activeDependencies} label={stats.activeDependencies === 1 ? "Active dependency" : "Active dependencies"} />
        </div>
    )

    if (tasks.length === 0) {
        return (
            <div className="space-y-lg">
                {tiles}
                <p className="rounded-xl border border-line bg-panel p-lg text-sm text-muted">No tasks yet. Each task shows here from when it's created to its due date.</p>
            </div>
        )
    }

    return (
        <div className="space-y-lg">
            {tiles}

            <section aria-label="Timeline" className="space-y-sm">
                <div className="flex items-center justify-between gap-md flex-wrap">
                    <div>
                        <h3 className="text-sm font-semibold text-white">Timeline</h3>
                        <p className="text-[11px] text-muted">{shortDay(start)} – {shortDay(end)} {end.getFullYear()}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <Select value={viewKey} onChange={(e) => changeView(e.target.value)} aria-label="Timeline view" className="h-8 bg-transparent border border-line rounded-lg pl-2.5 pr-2 text-[12px] font-semibold text-soft hover:text-white">
                            {Object.values(TIMELINE_VIEWS).map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
                        </Select>
                        <button type="button" onClick={() => setStart(windowStart(viewKey, now))} className="h-8 px-2.5 rounded-lg border border-line text-[12px] font-semibold text-soft hover:text-white hover:bg-line cursor-pointer">Today</button>
                        <button type="button" onClick={() => setStart(shiftWindow(start, viewKey, -1))} aria-label="Earlier" className="w-8 h-8 rounded-lg border border-line flex items-center justify-center text-soft hover:text-white hover:bg-line cursor-pointer">
                            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_back</span>
                        </button>
                        <button type="button" onClick={() => setStart(shiftWindow(start, viewKey, 1))} aria-label="Later" className="w-8 h-8 rounded-lg border border-line flex items-center justify-center text-soft hover:text-white hover:bg-line cursor-pointer">
                            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">arrow_forward</span>
                        </button>
                    </div>
                </div>

                <div className="rounded-xl border border-line bg-panel overflow-hidden flex">
                    {/* Task names and assignees stay put while the days scroll */}
                    <div className="shrink-0 border-r border-line bg-raised/40" style={{ width: LEFT_W }}>
                        <div className="flex items-end justify-between px-3 pb-2 border-b border-line text-[11px] font-medium text-muted" style={{ height: HEADER_H }}>
                            <span>Task</span>
                            <span>Assignee</span>
                        </div>
                        <div style={{ minHeight: rowsHeight }}>
                            {rows.map((row) => (row.kind === "group" ? (
                                <button
                                    key={`g-${row.group.id}`}
                                    type="button"
                                    onClick={() => toggleGroup(row.group.id)}
                                    aria-expanded={!folded.has(row.group.id)}
                                    className="w-full flex items-center gap-1.5 px-2 text-left text-[12px] font-semibold text-white border-b border-line/60 hover:bg-surface2/40 cursor-pointer"
                                    style={{ height: GROUP_H }}
                                >
                                    <span className={`material-symbols-outlined text-[18px] text-muted transition-transform ${folded.has(row.group.id) ? "-rotate-90" : ""}`} aria-hidden="true">expand_more</span>
                                    {row.group.name}
                                    <span className="text-muted font-normal">({row.group.tasks.length})</span>
                                </button>
                            ) : (
                                <div key={row.task.id} className="flex items-center gap-2 px-3 border-b border-line/40" style={{ height: ROW_H }}>
                                    <StatusIcon task={row.task} />
                                    <button
                                        type="button"
                                        onClick={() => onOpenTask(row.task)}
                                        title={row.task.title}
                                        className={`flex-1 min-w-0 text-left text-[12px] truncate hover:underline cursor-pointer ${row.task.status === "done" ? "text-muted line-through" : "text-white"}`}
                                    >
                                        {row.task.title}
                                    </button>
                                    <span className="w-6 h-6 rounded-full overflow-hidden bg-surface2 border border-line flex items-center justify-center text-[10px] font-bold text-muted uppercase shrink-0" title={nameOf(row.task.assignee_id) || "Unassigned"}>
                                        {row.task.assignee_id
                                            ? <PersonPhoto userId={row.task.assignee_id} fallback={(nameOf(row.task.assignee_id) || "?").charAt(0)} />
                                            : <span className="material-symbols-outlined text-[14px]" aria-label="Unassigned">person</span>}
                                    </span>
                                </div>
                            )))}
                        </div>
                    </div>

                    <div className="overflow-x-auto flex-1">
                        <DayHeader start={start} view={view} />
                        <div className="relative" style={{ width, height: rowsHeight }}>
                            {/* Row bands and group rows */}
                            {rows.map((row) => (
                                <div
                                    key={`band-${row.kind}-${row.kind === "group" ? row.group.id : row.task.id}`}
                                    className={`absolute left-0 border-b ${row.kind === "group" ? "bg-surface2/30 border-line/60" : "border-line/40"}`}
                                    style={{ top: row.top, height: row.height, width }}
                                />
                            ))}
                            {/* A department's due date, across its rows */}
                            {isSplit && groups.map((group) => {
                                const groupRows = rows.filter((r) => r.group.id === group.id)
                                if (groupRows.length === 0) return null
                                const first = groupRows[0]
                                const last = groupRows[groupRows.length - 1]
                                const day = dayIndex(group.dueDate)
                                if (day === null || day < 0 || day > view.days - 1) return null
                                return (
                                    <div key={`due-${group.id}`} className="absolute w-0 border-l border-dashed border-soft/50" style={{ left: day * view.dayWidth + view.dayWidth / 2, top: first.top, height: last.top + last.height - first.top }} aria-hidden="true">
                                        <span className="absolute top-0.5 left-1 text-[9px] text-soft whitespace-nowrap">{group.name} due</span>
                                    </div>
                                )
                            })}
                            <VerticalLine day={dayIndex(now)} view={view} height={rowsHeight} className="border-accent-ink/80 text-accent-ink" />
                            <VerticalLine day={dayIndex(projectDueDate)} view={view} height={rowsHeight} className="border-red-400/70 text-red-400" label="deadline" />

                            <svg className="absolute inset-0 pointer-events-none" width={width} height={rowsHeight} aria-hidden="true">
                                <defs>
                                    {["holding", "normal"].map((kind) => (
                                        <marker key={kind} id={`timeline-arrow-${kind}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                                            <path d="M0,0 L8,4 L0,8 z" className={kind === "holding" ? "fill-red-400" : "fill-muted"} />
                                        </marker>
                                    ))}
                                </defs>
                                {arrows.map((arrow) => {
                                    const from = placed.get(arrow.fromId)
                                    const to = placed.get(arrow.toId)
                                    const x1 = (from.to + 1) * view.dayWidth - 3
                                    const x2 = to.from * view.dayWidth + 3
                                    const bend = Math.max(18, Math.abs(x2 - x1) / 2)
                                    // A waiting task that starts before its blocker ends: go round, not back over the bars
                                    const turn = to.y > from.y ? to.y - 16 : to.y + 16
                                    const d = x2 >= x1 + 16
                                        ? `M${x1},${from.y} C${x1 + bend},${from.y} ${x2 - bend},${to.y} ${x2},${to.y}`
                                        : `M${x1},${from.y} H${x1 + 8} V${turn} H${x2 - 8} V${to.y} H${x2}`
                                    return <path key={`${arrow.fromId}>${arrow.toId}`} d={d} fill="none" strokeWidth={arrow.isHolding ? 2 : 1.25}
                                        className={arrow.isHolding ? "stroke-red-400" : "stroke-muted opacity-70"} markerEnd={`url(#timeline-arrow-${arrow.isHolding ? "holding" : "normal"})`} />
                                })}
                            </svg>

                            {[...placed.entries()].map(([id, bar]) => {
                                const task = bar.row.task
                                const tone = task.status === "done" ? "done" : roles.get(id) || "normal"
                                const chip = task.status === "done" ? null : waitingLabel(task, tasks, departments)
                                const due = task.due_date ? `due ${shortDay(toDay(task.due_date))}` : "no due date"
                                return (
                                    <button
                                        key={id}
                                        type="button"
                                        onClick={() => onOpenTask(task)}
                                        title={`${task.title} · ${due}${chip ? ` · ${chip}` : ""}`}
                                        aria-label={`${task.title}, ${due}${chip ? `, ${chip}` : ""}`}
                                        className={`absolute flex items-center gap-1 overflow-hidden border px-1.5 text-left text-[11px] text-white hover:brightness-125 transition cursor-pointer ${BAR_TONES[tone]} ${bar.hasNoDueDate ? "border-dashed" : ""} ${bar.startsBefore ? "rounded-l-none border-l-0" : "rounded-l-md"} ${bar.endsAfter ? "rounded-r-none border-r-0" : "rounded-r-md"}`}
                                        style={{ left: bar.from * view.dayWidth + 3, width: Math.max(view.dayWidth - 6, (bar.to - bar.from + 1) * view.dayWidth - 6), top: bar.y - 13, height: 26 }}
                                    >
                                        {chip ? (
                                            <span className="flex items-center gap-1 px-1.5 py-px rounded-full bg-canvas/70 border border-amber-400/40 text-amber-300 text-[10px] whitespace-nowrap">
                                                <span className="material-symbols-outlined text-[12px]" aria-hidden="true">link</span>
                                                {chip}
                                            </span>
                                        ) : (
                                            <span className="truncate opacity-80">{task.title}</span>
                                        )}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </div>
                {outside > 0 && (
                    <p className="text-[11px] text-soft">
                        {outside === shownTaskRows ? "None of these tasks fall" : `${outside} of these tasks ${outside === 1 ? "falls" : "fall"}`} between {shortDay(start)} and {shortDay(end)}. Use ← and → or Month view to find {outside === 1 ? "it" : "them"}.
                    </p>
                )}
                <p className="text-[11px] text-muted">
                    Bars run from when a task was created to its due date (dashed: no due date). Arrows point from a task to the tasks waiting on it: <span className="text-red-400">red</span> when it holds them up.
                </p>
            </section>

            <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-md">
                <KeyDatesCard dates={keyDates({ tasks, departments, projectDueDate, now })} />
                <InsightsCard insights={timelineInsights({ tasks, departments, now })} />
            </div>
        </div>
    )
}
