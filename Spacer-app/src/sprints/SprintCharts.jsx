import { useState } from "react"
import { parseDay } from "./sprintMath"

// Burndown and velocity charts. The two series colors were checked with the
// dataviz palette validator on the panel surface in both modes (#14161b dark,
// #ffffff light): lightness band, chroma, colorblind separation and 3:1 contrast
// pass. Neutrals follow the app palette; SVG attributes cannot read CSS
// variables, so those are set through style.
const REMAINING = "#72a318" // the lime accent, stepped down to read as a line
const IDEAL = "#3987e5"
const SURFACE = "rgb(var(--c-panel))"
const GRID = "rgb(var(--c-line))"
const MUTED = "rgb(var(--c-muted))"
const FG = "rgb(var(--c-fg))"

const W = 600
const H = 220
const PAD = { top: 14, right: 56, bottom: 26, left: 34 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

const shortDate = (day) => parseDay(day).toLocaleDateString([], { month: "short", day: "numeric" })

// 0, half and top, rounded to whole numbers
function yTicks(max) {
    const top = Math.max(1, Math.ceil(max))
    return [...new Set([0, Math.round(top / 2), top])]
}

function Tooltip({ leftPct, children }) {
    // Flip to the left of the pointer past the middle so it never leaves the card
    const style = leftPct > 50 ? { right: `${100 - leftPct + 2}%` } : { left: `${leftPct + 2}%` }
    return (
        <div role="status" className="pointer-events-none absolute top-2 z-10 rounded-lg border border-line bg-surface1 px-3 py-2 text-xs shadow-xl" style={style}>
            {children}
        </div>
    )
}

function LineKey({ color }) {
    return <span className="inline-block w-4 h-0.5 rounded-full" style={{ backgroundColor: color }} />
}

function DataTable({ caption, headers, rows }) {
    return (
        <details className="text-xs text-muted">
            <summary className="cursor-pointer hover:text-white w-fit">Show as table</summary>
            <table className="mt-2 w-full text-left">
                <caption className="sr-only">{caption}</caption>
                <thead><tr>{headers.map((h) => <th key={h} className="py-1 pr-4 font-medium">{h}</th>)}</tr></thead>
                <tbody className="text-soft tabular-nums">
                    {rows.map((row, r) => <tr key={r} className="border-t border-line">{row.map((cell, i) => <td key={i} className="py-1 pr-4">{cell}</td>)}</tr>)}
                </tbody>
            </table>
        </details>
    )
}

// series: [{ day, ideal, remaining }] from burndownSeries; unit: "pts" | "tasks"
export function BurndownChart({ series, unit }) {
    const [active, setActive] = useState(null)
    const max = Math.max(1, ...series.map((d) => Math.max(d.ideal, d.remaining ?? 0)))
    const x = (i) => PAD.left + (series.length === 1 ? PLOT_W / 2 : (i / (series.length - 1)) * PLOT_W)
    const y = (v) => PAD.top + PLOT_H - (v / max) * PLOT_H
    const line = (key) => series.map((d, i) => (d[key] == null ? null : `${x(i)},${y(d[key])}`)).filter(Boolean).join(" ")
    const lastActual = series.reduce((last, d, i) => (d.remaining == null ? last : i), -1)
    const xLabels = [...new Set([0, Math.floor((series.length - 1) / 2), series.length - 1])]

    const indexAt = (e) => {
        const rect = e.currentTarget.getBoundingClientRect()
        const vx = ((e.clientX - rect.left) / rect.width) * W
        const i = Math.round(((vx - PAD.left) / PLOT_W) * (series.length - 1))
        return Math.min(series.length - 1, Math.max(0, i))
    }
    const handleKey = (e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return
        e.preventDefault()
        const step = e.key === "ArrowLeft" ? -1 : 1
        setActive((i) => Math.min(series.length - 1, Math.max(0, (i ?? lastActual) + step)))
    }
    const point = active == null ? null : series[active]

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-4 text-xs text-soft">
                <span className="flex items-center gap-1.5"><LineKey color={REMAINING} />Remaining</span>
                <span className="flex items-center gap-1.5"><LineKey color={IDEAL} />Ideal</span>
            </div>
            <div className="relative">
                <svg
                    viewBox={`0 0 ${W} ${H}`}
                    className="w-full h-auto touch-none outline-none focus-visible:ring-1 focus-visible:ring-accent-ink/50 rounded"
                    role="img"
                    aria-label={`Burndown in ${unit}. Use the arrow keys to read each day.`}
                    tabIndex={0}
                    onPointerMove={(e) => setActive(indexAt(e))}
                    onPointerLeave={() => setActive(null)}
                    onFocus={() => setActive(lastActual >= 0 ? lastActual : 0)}
                    onBlur={() => setActive(null)}
                    onKeyDown={handleKey}
                >
                    {yTicks(max).map((t) => (
                        <g key={t}>
                            <line x1={PAD.left} x2={PAD.left + PLOT_W} y1={y(t)} y2={y(t)} style={{ stroke: GRID }} strokeWidth="1" />
                            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" style={{ fill: MUTED }} className="tabular-nums">{t}</text>
                        </g>
                    ))}
                    {xLabels.map((i) => (
                        <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === series.length - 1 ? "end" : "middle"} fontSize="11" style={{ fill: MUTED }}>
                            {shortDate(series[i].day)}
                        </text>
                    ))}
                    {point && <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + PLOT_H} style={{ stroke: MUTED }} strokeWidth="1" />}
                    <polyline points={line("ideal")} fill="none" stroke={IDEAL} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                    <polyline points={line("remaining")} fill="none" stroke={REMAINING} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                    {lastActual >= 0 && (
                        <>
                            <circle cx={x(lastActual)} cy={y(series[lastActual].remaining)} r="5" fill={REMAINING} style={{ stroke: SURFACE }} strokeWidth="2" />
                            <text x={x(lastActual) + 9} y={y(series[lastActual].remaining) + 4} fontSize="12" fontWeight="600" style={{ fill: FG }}>
                                {series[lastActual].remaining} left
                            </text>
                        </>
                    )}
                </svg>
                {point && (
                    <Tooltip leftPct={(x(active) / W) * 100}>
                        <p className="text-muted mb-1">{shortDate(point.day)}</p>
                        <p className="flex items-center gap-2"><LineKey color={REMAINING} /><span className="font-semibold text-white tabular-nums">{point.remaining ?? "—"}</span><span className="text-muted">remaining</span></p>
                        <p className="flex items-center gap-2"><LineKey color={IDEAL} /><span className="font-semibold text-white tabular-nums">{point.ideal}</span><span className="text-muted">ideal</span></p>
                    </Tooltip>
                )}
            </div>
            <DataTable
                caption={`Burndown in ${unit}`}
                headers={["Day", `Remaining (${unit})`, `Ideal (${unit})`]}
                rows={series.map((d) => [shortDate(d.day), d.remaining ?? "—", d.ideal])}
            />
        </div>
    )
}

const BAR_MAX = 24
const BAR_RADIUS = 4

// Column with a rounded top and a square base
function columnPath(cx, top, bottom, width) {
    const r = Math.min(BAR_RADIUS, width / 2, bottom - top)
    const l = cx - width / 2
    const rgt = cx + width / 2
    return `M${l},${bottom} L${l},${top + r} Q${l},${top} ${l + r},${top} L${rgt - r},${top} Q${rgt},${top} ${rgt},${top + r} L${rgt},${bottom} Z`
}

// sprints: completed sprints oldest first (velocityHistory().sprints)
export function VelocityChart({ sprints }) {
    const [active, setActive] = useState(null)
    const max = Math.max(1, ...sprints.map((s) => s.completed_points ?? 0))
    const band = PLOT_W / sprints.length
    const width = Math.min(BAR_MAX, band * 0.6)
    const cx = (i) => PAD.left + band * i + band / 2
    const y = (v) => PAD.top + PLOT_H - (v / max) * PLOT_H
    const base = PAD.top + PLOT_H
    const point = active == null ? null : sprints[active]

    return (
        <div className="space-y-2">
            <div className="relative">
                <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Completed story points per sprint">
                    {yTicks(max).map((t) => (
                        <g key={t}>
                            <line x1={PAD.left} x2={PAD.left + PLOT_W} y1={y(t)} y2={y(t)} style={{ stroke: GRID }} strokeWidth="1" />
                            <text x={PAD.left - 8} y={y(t) + 4} textAnchor="end" fontSize="11" style={{ fill: MUTED }}>{t}</text>
                        </g>
                    ))}
                    {sprints.map((s, i) => {
                        const value = s.completed_points ?? 0
                        const top = value === 0 ? base - 1 : y(value)
                        return (
                            <g
                                key={s.id}
                                tabIndex={0}
                                role="img"
                                aria-label={`${s.name}: ${value} of ${s.committed_points ?? 0} committed points`}
                                className="cursor-default outline-none"
                                onPointerEnter={() => setActive(i)}
                                onPointerLeave={() => setActive(null)}
                                onFocus={() => setActive(i)}
                                onBlur={() => setActive(null)}
                            >
                                {/* Hit area: the whole band, not just the painted column */}
                                <rect x={cx(i) - band / 2} y={PAD.top} width={band} height={PLOT_H} fill="transparent" />
                                <path d={columnPath(cx(i), top, base, width)} fill={REMAINING} opacity={active == null || active === i ? 1 : 0.55} />
                                <text x={cx(i)} y={top - 6} textAnchor="middle" fontSize="11" fontWeight="600" style={{ fill: FG }}>{value}</text>
                                <text x={cx(i)} y={H - 6} textAnchor="middle" fontSize="11" style={{ fill: MUTED }}>{s.name.length > 12 ? `${s.name.slice(0, 11)}…` : s.name}</text>
                            </g>
                        )
                    })}
                </svg>
                {point && (
                    <Tooltip leftPct={(cx(active) / W) * 100}>
                        <p className="text-muted mb-1">{point.name}</p>
                        <p><span className="font-semibold text-white tabular-nums">{point.completed_points ?? 0}</span> <span className="text-muted">pts completed</span></p>
                        <p><span className="font-semibold text-white tabular-nums">{point.committed_points ?? 0}</span> <span className="text-muted">pts committed</span></p>
                    </Tooltip>
                )}
            </div>
            <DataTable
                caption="Velocity per sprint"
                headers={["Sprint", "Completed (pts)", "Committed (pts)", "Tasks done"]}
                rows={sprints.map((s) => [s.name, s.completed_points ?? 0, s.committed_points ?? 0, `${s.completed_tasks ?? 0} / ${s.committed_tasks ?? 0}`])}
            />
        </div>
    )
}
