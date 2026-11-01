import { useState } from "react"
import { CARD_CLASS, StatTile, SprintStatusChip, SprintTaskRow, BurndownChart } from "./SprintParts"
import { sprintTotals, daysLeftLabel, burndown, formatSprintDates } from "./sprintMath"

const BUTTON_CLASS = "inline-flex items-center gap-1.5 rounded-lg border border-[#2D3139] px-3 py-1.5 text-xs font-semibold text-[#c4c9b8] transition-colors hover:border-[#424934] hover:text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
const PRIMARY_CLASS = "inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary-color)] px-3 py-1.5 text-xs font-bold text-[#1C1F26] transition-colors hover:brightness-110 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"

// Open work first, then finished
const byOpenFirst = (a, b) => Number(a.status === "done") - Number(b.status === "done")

function TaskList({ tasks, emptyText, rowProps }) {
    if (tasks.length === 0) return <p className="rounded-xl border border-dashed border-[#2D3139] p-4 text-center text-xs text-[#8c947b]">{emptyText}</p>
    return <ul className="flex flex-col gap-2">{[...tasks].sort(byOpenFirst).map((task) => <SprintTaskRow key={task.id} task={task} {...rowProps(task)} />)}</ul>
}

export function SectionHeading({ icon, title, count = null, children = null }) {
    return (
        <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-[#8c947b]">
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{icon}</span>
                {title}{count !== null && <span className="text-[#5d6352]">({count})</span>}
            </h3>
            {children}
        </div>
    )
}

export function ActiveSprintCard({ sprint, tasks, canManage, onComplete, onEdit, rowProps }) {
    if (!sprint) {
        return (
            <div className={`${CARD_CLASS} text-center`}>
                <span className="material-symbols-outlined text-[32px] text-[#5d6352]" aria-hidden="true">directions_run</span>
                <p className="mt-2 text-sm font-semibold text-white">No sprint running</p>
                <p className="mt-1 text-xs text-[#8c947b]">
                    {canManage ? "Plan a sprint, add tasks to it, then start it." : "A project manager starts sprints. They'll show here."}
                </p>
            </div>
        )
    }
    const totals = sprintTotals(tasks)
    return (
        <div className={`${CARD_CLASS} relative overflow-hidden`}>
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[var(--primary-color)] to-sky-500" />
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2"><h2 className="truncate text-xl font-black text-white">{sprint.name}</h2><SprintStatusChip status="active" /></div>
                    <p className="mt-1 text-xs text-[#8c947b]">{formatSprintDates(sprint)} · {daysLeftLabel(sprint.ends_on)}</p>
                    {sprint.goal && <p className="mt-2 text-sm text-[#c4c9b8]"><span className="font-semibold text-white">Goal:</span> {sprint.goal}</p>}
                </div>
                {canManage && (
                    <div className="flex gap-2">
                        <button type="button" onClick={onEdit} className={BUTTON_CLASS}><span className="material-symbols-outlined text-[16px]">edit</span>Edit</button>
                        <button type="button" onClick={onComplete} className={PRIMARY_CLASS}><span className="material-symbols-outlined text-[16px]">flag</span>Complete sprint</button>
                    </div>
                )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile label="Progress" value={`${totals.percent}%`} />
                <StatTile label="Tasks done" value={`${totals.doneTasks}/${totals.totalTasks}`} />
                <StatTile label="Points done" value={`${totals.donePoints}/${totals.totalPoints}`} />
                <StatTile label="Committed" value={sprint.committed_tasks ?? "—"} hint={`tasks at start${sprint.committed_points ? ` · ${sprint.committed_points} pts` : ""}`} />
            </div>
            <div className="mt-4 rounded-xl border border-[#2D3139] bg-[#14161b] p-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#8c947b]">Burndown</p>
                <BurndownChart chart={burndown(sprint, tasks)} />
            </div>
            <div className="mt-4">
                <TaskList tasks={tasks} emptyText="No tasks in this sprint yet." rowProps={rowProps} />
            </div>
        </div>
    )
}

export function PlannedSprintCard({ sprint, tasks, canManage, canStart, onStart, onEdit, onDelete, rowProps }) {
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
    const totals = sprintTotals(tasks)
    return (
        <div className={CARD_CLASS}>
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2"><h4 className="truncate text-base font-bold text-white">{sprint.name}</h4><SprintStatusChip status="planned" /></div>
                    <p className="mt-1 text-xs text-[#8c947b]">{formatSprintDates(sprint)} · {totals.totalTasks} task{totals.totalTasks === 1 ? "" : "s"} · {totals.totalPoints} pts</p>
                    {sprint.goal && <p className="mt-1 text-sm text-[#c4c9b8]">{sprint.goal}</p>}
                </div>
                {canManage && (
                    <div className="flex flex-wrap gap-2">
                        {isConfirmingDelete ? (
                            <>
                                <span className="self-center text-xs text-[#c4c9b8]">Delete? Its tasks go back to the backlog.</span>
                                <button type="button" onClick={() => setIsConfirmingDelete(false)} className={BUTTON_CLASS}>Keep</button>
                                <button type="button" onClick={onDelete} className={`${BUTTON_CLASS} border-red-500/40 text-red-300 hover:text-red-200`}>Delete</button>
                            </>
                        ) : (
                            <>
                                <button type="button" onClick={() => setIsConfirmingDelete(true)} className={BUTTON_CLASS} aria-label={`Delete ${sprint.name}`}><span className="material-symbols-outlined text-[16px]">delete</span></button>
                                <button type="button" onClick={onEdit} className={BUTTON_CLASS}><span className="material-symbols-outlined text-[16px]">edit</span>Edit</button>
                                <button type="button" onClick={onStart} disabled={!canStart} title={canStart ? undefined : "Complete the active sprint first"} className={PRIMARY_CLASS}>
                                    <span className="material-symbols-outlined text-[16px]">play_arrow</span>Start
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>
            <div className="mt-4">
                <TaskList tasks={tasks} emptyText={canManage ? "Add tasks from the backlog below." : "No tasks planned yet."} rowProps={rowProps} />
            </div>
        </div>
    )
}

export function BacklogSection({ tasks, rowProps }) {
    return <TaskList tasks={tasks} emptyText="Nothing in the backlog. Every open task is in a sprint." rowProps={rowProps} />
}

function RetroNote({ label, text }) {
    if (!text) return null
    return (
        <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#8c947b]">{label}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-[#c4c9b8]">{text}</p>
        </div>
    )
}

export function PastSprints({ sprints, tasksBySprint }) {
    const [openId, setOpenId] = useState(null)
    if (sprints.length === 0) {
        return <p className="rounded-xl border border-dashed border-[#2D3139] p-4 text-center text-xs text-[#8c947b]">No finished sprints yet. Completed sprints and their retrospectives show up here.</p>
    }
    return (
        <ul className="flex flex-col gap-2">
            {sprints.map((sprint) => {
                const isOpen = openId === sprint.id
                const committed = sprint.committed_tasks || 0
                const percent = committed ? Math.round((100 * (sprint.completed_tasks || 0)) / committed) : 0
                const finished = tasksBySprint.get(sprint.id) || []
                const hasRetro = sprint.retro_went_well || sprint.retro_to_improve || sprint.retro_actions
                return (
                    <li key={sprint.id} className="rounded-xl border border-[#2D3139] bg-[#1C1F26]">
                        <button type="button" onClick={() => setOpenId(isOpen ? null : sprint.id)} aria-expanded={isOpen} className="flex w-full items-center gap-4 px-4 py-3 text-left cursor-pointer">
                            <span className="w-14 shrink-0 text-center">
                                <span className="block text-xl font-black text-white">{percent}%</span>
                                <span className="block text-[10px] uppercase tracking-wider text-[#8c947b]">done</span>
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold text-white">{sprint.name}</span>
                                <span className="block truncate text-xs text-[#8c947b]">
                                    {formatSprintDates(sprint)} · {sprint.completed_tasks ?? 0}/{committed} tasks · {sprint.completed_points ?? 0}/{sprint.committed_points ?? 0} pts
                                </span>
                            </span>
                            <span className={`material-symbols-outlined text-[20px] text-[#8c947b] transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true">expand_more</span>
                        </button>
                        {isOpen && (
                            <div className="space-y-4 border-t border-[#2D3139] px-4 py-4">
                                {sprint.goal && <p className="text-sm text-[#c4c9b8]"><span className="font-semibold text-white">Goal:</span> {sprint.goal}</p>}
                                <p className="text-xs text-[#8c947b]">
                                    Completed {sprint.completed_at ? new Date(sprint.completed_at).toLocaleString() : "—"}
                                    {committed > (sprint.completed_tasks || 0) && ` · ${committed - (sprint.completed_tasks || 0)} unfinished task(s) moved on`}
                                </p>
                                <div>
                                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-[#8c947b]">Finished in this sprint</p>
                                    {finished.length === 0
                                        ? <p className="text-xs text-[#8c947b]">No tasks were finished.</p>
                                        : <ul className="flex flex-col gap-1">{finished.map((t) => (
                                            <li key={t.id} className="flex items-center gap-2 text-sm text-[#c4c9b8]">
                                                <span className="material-symbols-outlined text-[16px] text-[#22c55e]" aria-hidden="true">check_circle</span>
                                                <span className="truncate">{t.title}</span>
                                                {t.story_points != null && <span className="text-[11px] text-[#8c947b]">{t.story_points} pts</span>}
                                            </li>
                                        ))}</ul>}
                                </div>
                                {hasRetro
                                    ? <div className="grid gap-4 sm:grid-cols-3">
                                        <RetroNote label="Went well" text={sprint.retro_went_well} />
                                        <RetroNote label="To improve" text={sprint.retro_to_improve} />
                                        <RetroNote label="Actions" text={sprint.retro_actions} />
                                    </div>
                                    : <p className="text-xs text-[#8c947b]">No retrospective notes.</p>}
                            </div>
                        )}
                    </li>
                )
            })}
        </ul>
    )
}

export { PRIMARY_CLASS }
