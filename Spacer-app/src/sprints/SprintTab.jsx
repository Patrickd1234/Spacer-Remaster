import { useEffect, useState } from "react"
import { ErrorNote } from "../general/GeneralParts"
import { groupSprints, sprintTotals, suggestedSprintDates, nextSprintName } from "./sprintMath"
import { fetchSprints, createSprint, updateSprint, deleteSprint, startSprint, completeSprint, setTaskSprint, setTaskPoints } from "./sprintData"
import { SprintFormModal, CompleteSprintModal } from "./SprintModals"
import { SectionHeading, ActiveSprintCard, PlannedSprintCard, BacklogSection, PastSprints, PRIMARY_CLASS } from "./SprintSections"

// The project's Sprint tab: the running sprint with its burndown, planned
// sprints, the backlog and finished sprints with their retrospectives.
// tasks / onTasksChange are the project page's task list and its setter, so
// the board and this tab stay in step. canManage mirrors can_manage_project;
// the database enforces it either way.
export default function SprintTab({ projectId, tasks, canManage, onTasksChange }) {
    const [sprints, setSprints] = useState([])
    const [status, setStatus] = useState("loading")
    const [attempt, setAttempt] = useState(0)
    const [actionError, setActionError] = useState("")
    const [busyTaskId, setBusyTaskId] = useState(null)
    // { sprint: null } plans a new one; { sprint } edits it
    const [editing, setEditing] = useState(null)
    const [isCompleting, setIsCompleting] = useState(false)

    useEffect(() => {
        if (!projectId) return undefined
        let active = true
        fetchSprints(projectId).then(({ data, error }) => {
            if (!active) return
            setSprints(data || [])
            setStatus(error ? "error" : "ready")
        })
        return () => { active = false }
    }, [projectId, attempt])

    const { active, planned, completed } = groupSprints(sprints)
    const tasksBySprint = new Map()
    tasks.forEach((t) => {
        if (t.sprint_id) tasksBySprint.set(t.sprint_id, [...(tasksBySprint.get(t.sprint_id) || []), t])
    })
    const backlog = tasks.filter((t) => !t.sprint_id && t.status !== "done")
    const activeTasks = active ? tasksBySprint.get(active.id) || [] : []
    const openSprints = [active, ...planned].filter(Boolean)

    const patchTasks = (match, fields) => onTasksChange((prev) => prev.map((t) => (match(t) ? { ...t, ...fields } : t)))
    const replaceSprint = (row) => setSprints((prev) => (prev.some((s) => s.id === row.id) ? prev.map((s) => (s.id === row.id ? row : s)) : [...prev, row]))
    const fail = (error) => {
        setActionError(error?.message || "Something went wrong. Try again.")
        return error?.message || "Something went wrong. Try again."
    }

    // Managers move tasks between the backlog and unfinished sprints
    const rowProps = (task) => ({
        isBusy: busyTaskId === task.id,
        moveOptions: canManage && task.status !== "done"
            ? [...(task.sprint_id ? [{ value: "", label: "Backlog" }] : []), ...openSprints.filter((s) => s.id !== task.sprint_id).map((s) => ({ value: s.id, label: s.name }))]
            : [],
        onMove: async (sprintId) => {
            setBusyTaskId(task.id)
            setActionError("")
            const { error } = await setTaskSprint(task.id, sprintId)
            setBusyTaskId(null)
            if (error) return fail(error)
            patchTasks((t) => t.id === task.id, { sprint_id: sprintId })
        },
        onPoints: async (points) => {
            setBusyTaskId(task.id)
            setActionError("")
            const { error } = await setTaskPoints(task.id, points)
            setBusyTaskId(null)
            if (error) return fail(error)
            patchTasks((t) => t.id === task.id, { story_points: points })
        },
    })

    const handleSave = async (fields) => {
        const { data, error } = editing?.sprint ? await updateSprint(editing.sprint.id, fields) : await createSprint(projectId, fields)
        if (error) return error.message
        replaceSprint(data)
        setEditing(null)
        return null
    }

    const handleStart = async (sprint) => {
        setActionError("")
        const { data, error } = await startSprint(sprint.id)
        if (error) return fail(error)
        replaceSprint(data)
    }

    const handleDelete = async (sprint) => {
        setActionError("")
        const { error } = await deleteSprint(sprint.id)
        if (error) return fail(error)
        setSprints((prev) => prev.filter((s) => s.id !== sprint.id))
        patchTasks((t) => t.sprint_id === sprint.id, { sprint_id: null })
    }

    const handleComplete = async (form) => {
        const { data, error } = await completeSprint(active.id, form)
        if (error) return error.message
        replaceSprint(data)
        patchTasks((t) => t.sprint_id === active.id && t.status !== "done", { sprint_id: form.carryOverTo || null })
        setIsCompleting(false)
        return null
    }

    if (status === "loading") return <p className="py-10 text-center text-sm text-[#8c947b]">Loading sprints…</p>
    if (status === "error") {
        return (
            <div className="py-10 flex justify-center">
                <ErrorNote onRetry={() => { setStatus("loading"); setAttempt((n) => n + 1) }}>Couldn't load sprints.</ErrorNote>
            </div>
        )
    }

    return (
        <div className="mx-auto flex max-w-5xl flex-col gap-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-black text-white">Sprints</h2>
                    <p className="text-sm text-[#8c947b]">Plan time-boxed work, track it day by day, and look back on finished sprints.</p>
                </div>
                {canManage && (
                    <button type="button" onClick={() => setEditing({ sprint: null })} className={PRIMARY_CLASS}>
                        <span className="material-symbols-outlined text-[16px]">add</span>Plan sprint
                    </button>
                )}
            </div>

            {actionError && <ErrorNote>{actionError}</ErrorNote>}

            <section aria-label="Active sprint">
                <ActiveSprintCard sprint={active} tasks={activeTasks} canManage={canManage} onEdit={() => setEditing({ sprint: active })} onComplete={() => setIsCompleting(true)} rowProps={rowProps} />
            </section>

            {(planned.length > 0 || canManage) && (
                <section>
                    <SectionHeading icon="event_upcoming" title="Planned" count={planned.length} />
                    {planned.length === 0
                        ? <p className="rounded-xl border border-dashed border-[#2D3139] p-4 text-center text-xs text-[#8c947b]">No planned sprints. Use “Plan sprint” to add the next one.</p>
                        : <div className="flex flex-col gap-3">{planned.map((sprint) => (
                            <PlannedSprintCard
                                key={sprint.id}
                                sprint={sprint}
                                tasks={tasksBySprint.get(sprint.id) || []}
                                canManage={canManage}
                                canStart={!active}
                                onStart={() => handleStart(sprint)}
                                onEdit={() => setEditing({ sprint })}
                                onDelete={() => handleDelete(sprint)}
                                rowProps={rowProps}
                            />
                        ))}</div>}
                </section>
            )}

            <section>
                <SectionHeading icon="inventory_2" title="Backlog" count={backlog.length} />
                <BacklogSection tasks={backlog} rowProps={rowProps} />
            </section>

            <section>
                <SectionHeading icon="history" title="Past sprints" count={completed.length} />
                <PastSprints sprints={completed} tasksBySprint={tasksBySprint} />
            </section>

            {editing && (
                <SprintFormModal
                    sprint={editing.sprint}
                    defaults={{ name: nextSprintName(sprints), ...suggestedSprintDates(sprints) }}
                    onSave={handleSave}
                    onClose={() => setEditing(null)}
                />
            )}
            {isCompleting && active && (
                <CompleteSprintModal
                    sprint={active}
                    totals={sprintTotals(activeTasks)}
                    plannedSprints={planned}
                    onComplete={handleComplete}
                    onClose={() => setIsCompleting(false)}
                />
            )}
        </div>
    )
}
