import { useCallback, useEffect, useMemo, useState } from "react"
import { Panel, PanelMessage } from "../components/DashboardParts"
import { PrimaryButton, SecondaryButton, ErrorNote } from "../general/GeneralParts"
import { sprintTotals, daysLeft, burndownSeries, velocityHistory, nextSprintDefaults, parseDay, dateRange, pointsLabel } from "./sprintMath"
import {
    fetchSprints, fetchCanEditProject, createSprint, updateSprint, deleteSprint,
    startSprint, completeSprint, setTaskSprint, setTaskPoints, sprintErrorMessage,
} from "./sprintData"
import { BurndownChart, VelocityChart } from "./SprintCharts"
import {
    StatusPill, TaskLine, TasksByStatus, SprintFormModal,
    CompleteSprintDialog, Figure, HistoryItem,
} from "./SprintParts"

const VELOCITY_BARS = 8

function daysLeftLabel(sprint) {
    const left = daysLeft(sprint)
    if (left > 1) return `${left} days left`
    if (left === 1) return "1 day left"
    if (left === 0) return "Last day"
    return `Ended ${-left} day${left === -1 ? "" : "s"} ago`
}

function IconButton({ icon, label, onClick, disabled = false }) {
    return (
        <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label} className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-muted hover:text-white hover:bg-line disabled:opacity-40 cursor-pointer disabled:cursor-default">
            <span className="material-symbols-outlined text-[16px]">{icon}</span>
        </button>
    )
}

function ActiveSprint({ sprint, tasks, canManage, renderTask, onEdit, onComplete }) {
    const totals = sprintTotals(tasks)
    const unit = totals.usesPoints ? "pts" : "tasks"
    const today = parseDay(sprint.ends_on) < new Date() ? parseDay(sprint.ends_on) : new Date()
    return (
        <section className="bg-panel border border-accent-ink/25 rounded-xl p-5 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2"><h3 className="text-xl font-semibold text-white truncate">{sprint.name}</h3><StatusPill status="active" /></div>
                    <p className="text-xs text-muted">{dateRange(sprint)} · {daysLeftLabel(sprint)}</p>
                    {sprint.goal && <p className="text-sm text-soft pt-1 flex gap-1.5"><span className="material-symbols-outlined text-[16px] text-accent-ink">flag</span>{sprint.goal}</p>}
                </div>
                {canManage && (
                    <div className="flex gap-2">
                        <SecondaryButton icon="edit" onClick={() => onEdit(sprint)}>Edit</SecondaryButton>
                        <PrimaryButton icon="flag" onClick={() => onComplete(sprint)}>Complete sprint</PrimaryButton>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-lg border border-line bg-raised px-3 py-2.5">
                    <p className="text-[11px] text-muted">Progress</p>
                    <p className="text-lg font-semibold text-white">{totals.percent}%</p>
                    <div className="mt-1.5 h-1.5 rounded-full bg-line overflow-hidden" role="progressbar" aria-valuenow={totals.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Sprint progress">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${totals.percent}%` }} />
                    </div>
                </div>
                <Figure label="Done" value={`${totals.done} ${unit}`} sub={`of ${totals.total} ${unit}`} />
                <Figure label="Remaining" value={`${totals.total - totals.done} ${unit}`} sub={sprint.committed_points != null && totals.usesPoints ? `${sprint.committed_points} pts committed at start` : null} />
                <Figure label="Tasks done" value={`${totals.doneTasks} / ${totals.totalTasks}`} sub={totals.unestimated > 0 ? `${totals.unestimated} not estimated` : null} />
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
                <div className="xl:col-span-2 space-y-2">
                    <h4 className="text-sm font-semibold text-white">Burndown</h4>
                    {tasks.length === 0
                        ? <p className="text-xs text-muted py-6">Add tasks to see the burndown.</p>
                        : <BurndownChart series={burndownSeries(sprint, tasks, today)} unit={unit} />}
                </div>
                <div className="xl:col-span-3 space-y-2">
                    <h4 className="text-sm font-semibold text-white">Sprint backlog</h4>
                    <TasksByStatus tasks={tasks} renderTask={renderTask} />
                </div>
            </div>
        </section>
    )
}

function PlannedSprint({ sprint, tasks, velocity, canManage, canStart, renderTask, onStart, onEdit, onDelete }) {
    const totals = sprintTotals(tasks)
    const overCapacity = velocity != null && totals.usesPoints && totals.total > velocity
    return (
        <section className="rounded-xl border border-line bg-panel p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="flex items-center gap-2"><h4 className="text-[15px] font-semibold text-white truncate">{sprint.name}</h4><StatusPill status="planned" /></div>
                    <p className="text-xs text-muted">{dateRange(sprint)}</p>
                </div>
                {canManage && (
                    <div className="flex items-center gap-1">
                        <IconButton icon="edit" label={`Edit ${sprint.name}`} onClick={() => onEdit(sprint)} />
                        <IconButton icon="delete" label={`Delete ${sprint.name}`} onClick={() => onDelete(sprint)} />
                        <PrimaryButton icon="play_arrow" onClick={() => onStart(sprint)} disabled={!canStart} title={canStart ? undefined : "Complete the active sprint first"}>Start</PrimaryButton>
                    </div>
                )}
            </div>
            {sprint.goal && <p className="text-sm text-soft">{sprint.goal}</p>}
            <p className={`text-xs flex items-center gap-1.5 ${overCapacity ? "text-amber-300" : "text-muted"}`}>
                {overCapacity && <span className="material-symbols-outlined text-[14px]">warning</span>}
                {pointsLabel(totals)} planned
                {velocity != null && ` · recent velocity ${velocity} pts`}
                {overCapacity && " (more than the team usually finishes)"}
            </p>
            <div className="space-y-1.5">
                {tasks.length === 0 ? <p className="text-xs text-faint py-2">No tasks yet. Add some from the backlog.</p> : tasks.map(renderTask)}
            </div>
        </section>
    )
}

// The Sprint tab: the active sprint, planning (backlog and upcoming sprints) and history.
// tasks / onTasksChange are the project page's task list and its setter.
export default function SprintTab({ projectId, tasks, onTasksChange, canManage, members, onOpenTask }) {
    const [sprints, setSprints] = useState([])
    const [status, setStatus] = useState("loading")
    const [canEstimate, setCanEstimate] = useState(false)
    const [form, setForm] = useState(null) // { sprint } to edit, { sprint: null } to create
    const [completing, setCompleting] = useState(null)
    const [actionError, setActionError] = useState("")

    const load = useCallback(async () => {
        const [result, access] = await Promise.all([fetchSprints(projectId), fetchCanEditProject(projectId)])
        setSprints(result.data)
        setCanEstimate(access.data)
        setStatus(result.error ? "error" : "ready")
    }, [projectId])

    useEffect(() => {
        let active = true
        Promise.all([fetchSprints(projectId), fetchCanEditProject(projectId)]).then(([result, access]) => {
            if (!active) return
            setSprints(result.data)
            setCanEstimate(access.data)
            setStatus(result.error ? "error" : "ready")
        })
        return () => { active = false }
    }, [projectId])

    const activeSprint = sprints.find((s) => s.status === "active") || null
    const planned = sprints.filter((s) => s.status === "planned")
    const openSprints = sprints.filter((s) => s.status !== "completed")
    const velocity = useMemo(() => velocityHistory(sprints), [sprints])
    const nameOf = useMemo(() => new Map((members || []).map((m) => [m.user_id, m.user?.name || m.user?.email])), [members])
    const tasksIn = (sprintId) => tasks.filter((t) => t.sprint_id === sprintId)
    const backlog = tasks.filter((t) => !t.sprint_id && t.status !== "done")

    const patchTask = (taskId, fields) => onTasksChange((prev) => prev.map((t) => (t.id === taskId ? { ...t, ...fields } : t)))

    const handlePoints = async (task, points) => {
        setActionError("")
        patchTask(task.id, { story_points: points })
        const { error } = await setTaskPoints(task.id, points)
        if (error) {
            patchTask(task.id, { story_points: task.story_points })
            setActionError("Couldn't save the estimate.")
        }
    }

    const moveTask = async (task, sprintId) => {
        setActionError("")
        patchTask(task.id, { sprint_id: sprintId })
        const { error } = await setTaskSprint(task.id, sprintId)
        if (error) {
            patchTask(task.id, { sprint_id: task.sprint_id })
            setActionError(sprintErrorMessage(error, "Couldn't move the task."))
        }
    }

    const saveSprint = async (sprint, values) => {
        const { data, error } = sprint ? await updateSprint(sprint.id, values) : await createSprint(projectId, values)
        if (error) return sprintErrorMessage(error, "Couldn't save the sprint. Please try again.")
        setSprints((prev) => (sprint ? prev.map((s) => (s.id === data.id ? data : s)) : [...prev, data]))
        setForm(null)
        return null
    }

    const handleDelete = async (sprint) => {
        if (!window.confirm(`Delete ${sprint.name}? Its tasks go back to the backlog.`)) return
        setActionError("")
        const { error } = await deleteSprint(sprint.id)
        if (error) return setActionError("Couldn't delete the sprint.")
        setSprints((prev) => prev.filter((s) => s.id !== sprint.id))
        onTasksChange((prev) => prev.map((t) => (t.sprint_id === sprint.id ? { ...t, sprint_id: null } : t)))
    }

    const handleStart = async (sprint) => {
        setActionError("")
        const { data, error } = await startSprint(sprint.id)
        if (error) return setActionError(sprintErrorMessage(error, "Couldn't start the sprint."))
        setSprints((prev) => prev.map((s) => (s.id === data.id ? data : s)))
    }

    const handleComplete = async (sprint, options) => {
        const { data, error } = await completeSprint(sprint.id, options)
        if (error) return sprintErrorMessage(error, "Couldn't complete the sprint. Please try again.")
        setSprints((prev) => prev.map((s) => (s.id === data.id ? data : s)))
        onTasksChange((prev) => prev.map((t) => (t.sprint_id === sprint.id && t.status !== "done" ? { ...t, sprint_id: options.carryOverTo } : t)))
        setCompleting(null)
        return null
    }

    const sprintTask = (task) => (
        <TaskLine
            key={task.id}
            task={task}
            assignee={nameOf.get(task.assignee_id)}
            canEstimate={canEstimate}
            onPoints={handlePoints}
            onOpen={onOpenTask}
            action={canManage && task.status !== "done" ? <IconButton icon="remove_circle_outline" label="Move back to the backlog" onClick={() => moveTask(task, null)} /> : null}
        />
    )

    const backlogTask = (task) => (
        <TaskLine
            key={task.id}
            task={task}
            assignee={nameOf.get(task.assignee_id)}
            canEstimate={canEstimate}
            onPoints={handlePoints}
            onOpen={onOpenTask}
            action={canManage && openSprints.length > 0 ? (
                <select
                    aria-label={`Add ${task.title} to a sprint`}
                    value=""
                    onChange={(e) => moveTask(task, e.target.value)}
                    className="shrink-0 w-[92px] bg-field border border-line rounded-md px-1.5 py-0.5 text-xs text-soft focus:outline-none focus:border-accent-ink cursor-pointer"
                >
                    <option value="" disabled>Add to…</option>
                    {openSprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
            ) : null}
        />
    )

    if (status === "loading") return <p className="text-sm text-muted py-8">Loading sprints…</p>
    if (status === "error") return <PanelMessage icon="error" title="Couldn't load sprints" text="Check your connection and try again." onRetry={load} />

    const newSprintButton = canManage && <PrimaryButton icon="add" onClick={() => setForm({ sprint: null })}>New sprint</PrimaryButton>

    return (
        <div className="space-y-6" id="section-sprint">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-semibold text-white">Sprints</h2>
                    <p className="text-sm text-muted">Time-boxed goals: plan from the backlog, track the burndown, review and improve.</p>
                </div>
                {newSprintButton}
            </div>
            {actionError && <ErrorNote>{actionError}</ErrorNote>}

            {activeSprint ? (
                <ActiveSprint sprint={activeSprint} tasks={tasksIn(activeSprint.id)} canManage={canManage} renderTask={sprintTask} onEdit={(s) => setForm({ sprint: s })} onComplete={setCompleting} />
            ) : (
                <section className="rounded-xl border border-dashed border-line p-6 text-center">
                    <span className="material-symbols-outlined text-[28px] text-muted">directions_run</span>
                    <p className="text-sm font-semibold text-white mt-1">No sprint is running</p>
                    <p className="text-xs text-muted max-w-md mx-auto mt-1">
                        {planned.length > 0
                            ? `Start ${planned[0].name} when the team is ready${canManage ? "" : " (a project manager starts sprints)"}.`
                            : canManage ? "Create a sprint, give it a goal, and pull tasks in from the backlog." : "A project manager plans and starts sprints."}
                    </p>
                </section>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                <Panel title={`Backlog (${backlog.length})`}>
                    <p className="text-xs text-muted -mt-2">Open tasks not in a sprint. {canEstimate ? "Estimate them in story points." : ""}</p>
                    <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1">
                        {backlog.length === 0 ? <p className="text-xs text-faint py-3">The backlog is empty.</p> : backlog.map(backlogTask)}
                    </div>
                </Panel>
                <div className="space-y-3">
                    <h3 className="text-[15px] font-semibold text-white">Upcoming sprints</h3>
                    {planned.length === 0
                        ? <p className="text-xs text-muted">{canManage ? "None planned. Use New sprint to plan the next one." : "None planned yet."}</p>
                        : planned.map((s) => (
                            <PlannedSprint
                                key={s.id}
                                sprint={s}
                                tasks={tasksIn(s.id)}
                                velocity={velocity.average}
                                canManage={canManage}
                                canStart={!activeSprint}
                                renderTask={sprintTask}
                                onStart={handleStart}
                                onEdit={(sp) => setForm({ sprint: sp })}
                                onDelete={handleDelete}
                            />
                        ))}
                </div>
            </div>

            {velocity.sprints.length > 0 && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                    <Panel title="Velocity" action={velocity.average != null && <span className="text-xs text-muted">Average of the last 3: <span className="text-white font-semibold">{velocity.average} pts</span></span>}>
                        <p className="text-xs text-muted -mt-2">Story points completed per sprint.</p>
                        <VelocityChart sprints={velocity.sprints.slice(-VELOCITY_BARS)} />
                    </Panel>
                    <Panel title={`Completed sprints (${velocity.sprints.length})`}>
                        <div className="space-y-1.5">
                            {[...velocity.sprints].reverse().map((s) => <HistoryItem key={s.id} sprint={s} />)}
                        </div>
                    </Panel>
                </div>
            )}

            {form && (
                <SprintFormModal
                    sprint={form.sprint}
                    defaults={nextSprintDefaults(sprints)}
                    onSubmit={(values) => saveSprint(form.sprint, values)}
                    onClose={() => setForm(null)}
                />
            )}
            {completing && (
                <CompleteSprintDialog
                    sprint={completing}
                    tasks={tasksIn(completing.id)}
                    plannedSprints={planned}
                    onSubmit={(options) => handleComplete(completing, options)}
                    onClose={() => setCompleting(null)}
                />
            )}
        </div>
    )
}
