import { useEffect, useState } from "react"
import { fetchDepartmentScorecard } from "../departmentScorecardData"
import PlanetLoader from "./PlanetLoader"

const percent = (rate) => (rate === null ? "–" : `${Math.round(rate * 100)}%`)
const days = (n) => `${n} day${n === 1 ? "" : "s"}`

/**
 * Reports page: each department across every project, worst first. How much
 * it is holding other departments up right now, how long others have waited
 * on it, and its own open, overdue and on-time work. `refreshKey` reloads it.
 */
export default function DepartmentScorecard({ refreshKey = 0, style, className = "" }) {
    const [state, setState] = useState({ rows: [], error: null, isLoaded: false })
    useEffect(() => {
        let active = true
        fetchDepartmentScorecard().then((result) => { if (active) setState({ ...result, isLoaded: true }) })
        return () => { active = false }
    }, [refreshKey])

    return (
        <div style={style} className={`bg-panel border border-line rounded-2xl p-6 md:p-8 shadow-sm ${className}`}>
            <div className="flex items-center gap-3 pb-5 border-b border-line/60">
                <div className="w-8 h-8 rounded-xl bg-accent/10 text-accent-ink flex items-center justify-center">
                    <span className="material-symbols-outlined text-[19px]">lan</span>
                </div>
                <div>
                    <h2 className="text-lg font-bold text-white">Department Scorecard</h2>
                    <p className="text-xs text-muted mt-0.5">Who is holding whom up across every project, and how each department keeps to its dates</p>
                </div>
            </div>

            {!state.isLoaded && (
                <div className="flex justify-center py-10"><PlanetLoader className="text-3xl text-accent-ink" /></div>
            )}
            {state.isLoaded && state.error && <p className="text-xs text-red-400 mt-4">{state.error}</p>}
            {state.isLoaded && !state.error && state.rows.length === 0 && <p className="text-xs text-muted mt-4">No department has project tasks yet.</p>}
            {state.isLoaded && !state.error && state.rows.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-left text-xs">
                        <thead>
                            <tr className="text-[11px] uppercase tracking-wider text-muted">
                                <th scope="col" className="py-2 pr-4 font-semibold">Department</th>
                                <th scope="col" className="py-2 px-3 font-semibold" title="Open waits where this department's late, conflicting or stalled task keeps another department waiting">Holding others up</th>
                                <th scope="col" className="py-2 px-3 font-semibold" title="Days other departments have waited on its tasks, finished and ongoing waits">Others waited</th>
                                <th scope="col" className="py-2 px-3 font-semibold" title="Its open tasks kept waiting by another department">Held up</th>
                                <th scope="col" className="py-2 px-3 font-semibold">Open</th>
                                <th scope="col" className="py-2 px-3 font-semibold">Overdue</th>
                                <th scope="col" className="py-2 pl-3 font-semibold" title="Finished tasks with a due date that were done by it. Only tasks finished since completion times were recorded count.">On time</th>
                            </tr>
                        </thead>
                        <tbody>
                            {state.rows.map((row) => (
                                <tr key={row.id} className="border-t border-line/50">
                                    <th scope="row" className="py-2.5 pr-4 font-semibold text-white whitespace-nowrap">{row.name}</th>
                                    <td className={`py-2.5 px-3 font-bold ${row.holdingUpNow > 0 ? "text-red-400" : "text-muted"}`}>
                                        {row.holdingUpNow > 0 ? `${row.holdingUpNow} task${row.holdingUpNow === 1 ? "" : "s"}` : "None"}
                                    </td>
                                    <td className="py-2.5 px-3 text-soft whitespace-nowrap">{row.othersWaitedDays > 0 ? days(row.othersWaitedDays) : "–"}</td>
                                    <td className={`py-2.5 px-3 ${row.heldUpNow > 0 ? "text-amber-400 font-semibold" : "text-muted"}`}>{row.heldUpNow || "–"}</td>
                                    <td className="py-2.5 px-3 text-soft">{row.open}</td>
                                    <td className={`py-2.5 px-3 ${row.overdue > 0 ? "text-red-400 font-semibold" : "text-muted"}`}>{row.overdue}</td>
                                    <td className="py-2.5 pl-3 text-soft">{percent(row.onTimeRate)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
