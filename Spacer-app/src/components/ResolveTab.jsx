import { useEffect, useState } from "react"
const NOTICE_MS = 6000
import { summarizeDepartments, delayCulprits, culpritHeadline } from "../crossDepartment"
import { projectBlockers, departmentNextSteps, closeReadiness } from "../resolveView"
import { nudgeDepartment, closeProject, addProjectNote, fetchProjectNotes } from "../crossDepartmentData"
import { Heading, BlockerRow, NextSteps, ClosePanel } from "./ResolveParts"
import TakeActionPanel from "./TakeActionPanel"

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`

// The project's notes, reloaded after one is added
function useProjectNotes(projectId) {
    const [state, setState] = useState({ notes: [], error: null })
    const [version, setVersion] = useState(0)
    useEffect(() => {
        let active = true
        fetchProjectNotes(projectId).then(({ data, error }) => { if (active) setState({ notes: data, error }) })
        return () => { active = false }
    }, [projectId, version])
    return { ...state, reload: () => setVersion((v) => v + 1) }
}

// What's holding the project up, in one line (the department behind it on a
// Collab project; otherwise the most urgent blocker), or null
function headlineFor({ isSplit, departments, tasks, blockers, now }) {
    if (isSplit) {
        const summaries = summarizeDepartments({ departments, tasks, now })
        const culprit = delayCulprits(summaries)[0]
        return culprit ? culpritHeadline(culprit, summaries, tasks, now) : null
    }
    const late = blockers.find((b) => b.due.isOverdue)
    return late ? { title: `“${late.task.title}” is holding up the project.`, detail: `${late.due.text}, and ${plural(late.waitingCount, "task")} ${late.waitingCount === 1 ? "waits" : "wait"} on it.` } : null
}

/**
 * The Resolve tab (design screen 6): what's holding the project up, the
 * blocking tasks with actions, each department's next step (Collab projects),
 * Take action (nudge, reassign, adjust a deadline, add a note), and Close
 * project, open only once every task is done.
 * `tasks` carry `blocked_by`; `departments`: the project's (lead first;
 * one entry or none on a one-department project).
 */
export default function ResolveTab({
    projectId, project, departments, invitedDepartments = [], tasks, people, canManage, canNudge, canComplete,
    canReassign = () => false, canChangeDueDate = () => false,
    onCompleteTask, onOpenTask, onShowDepartmentTasks, onGoToDepartments, onStatusChanged,
}) {
    const [busyId, setBusyId] = useState(null)
    const [notice, setNotice] = useState(null)
    const [closeError, setCloseError] = useState(null)
    const [isClosing, setIsClosing] = useState(false)
    const notes = useProjectNotes(projectId)
    // A notice goes after a few seconds
    useEffect(() => {
        if (!notice) return undefined
        const id = setTimeout(() => setNotice(null), NOTICE_MS)
        return () => clearTimeout(id)
    }, [notice])
    const now = new Date()
    const isSplit = departments.length > 1
    const shownDepartments = isSplit ? departments : []
    const blockers = projectBlockers(tasks, shownDepartments, now)
    const summaries = isSplit ? summarizeDepartments({ departments, tasks, now }) : []
    const steps = departmentNextSteps(summaries, blockers)
    const readiness = closeReadiness(tasks, invitedDepartments, blockers)
    const headline = headlineFor({ isSplit, departments, tasks, blockers, now })
    const nameOf = (id) => people.find((p) => String(p.id) === String(id))?.name
    const departmentById = (id) => departments.find((d) => String(d.team_space_id) === String(id))

    const nudge = async (teamSpaceId) => {
        const department = departmentById(teamSpaceId)
        setBusyId(String(teamSpaceId))
        const { error } = await nudgeDepartment(projectId, teamSpaceId)
        setBusyId(null)
        const result = error ? { isError: true, text: error } : { isError: false, text: `${department?.name || "The department"}'s lead got an in-app reminder.` }
        setNotice(result)
        return result
    }
    const complete = async (task) => {
        setBusyId(String(task.id))
        const message = await onCompleteTask(task)
        setBusyId(null)
        setNotice(message ? { isError: true, text: message } : { isError: false, text: `“${task.title}” is done. The tasks waiting on it can go ahead.` })
        // Its row is gone: keep keyboard focus in the list
        if (!message) document.getElementById("resolve-blockers")?.focus()
    }
    const close = async (reopen) => {
        setIsClosing(true)
        setCloseError(null)
        const { error } = await closeProject(projectId, { reopen })
        setIsClosing(false)
        if (error) { setCloseError(error); return false }
        onStatusChanged(reopen ? "active" : "closed")
        return true
    }
    const addNote = async (text) => {
        const { error } = await addProjectNote(projectId, text)
        if (error) return { isError: true, text: error }
        notes.reload()
        return { isError: false, text: "Note saved." }
    }
    const openTaskById = (id, control) => {
        const task = tasks.find((t) => String(t.id) === String(id))
        if (task) onOpenTask(task, control)
    }

    const openTasks = tasks.filter((t) => t.status !== "done").sort((a, b) => String(a.title).localeCompare(String(b.title)))
    const asChoices = (list) => list.map((t) => ({ id: t.id, label: t.title }))
    const nudgeable = departments.filter((d) => d.lead_id).map((d) => ({ id: d.team_space_id, name: d.name }))

    return (
        <div className="space-y-lg">
            {headline && (
                <div className="rounded-xl border border-amber-400/30 bg-amber-500/[0.07] p-md flex items-center gap-md">
                    <span className="material-symbols-outlined text-[22px] text-amber-400" aria-hidden="true">error</span>
                    <div>
                        <p className="text-sm font-semibold text-white">{headline.title}</p>
                        <p className="text-xs text-soft mt-0.5">{headline.detail}</p>
                    </div>
                </div>
            )}
            {notice && <p role="status" className={`text-xs ${notice.isError ? "text-red-400" : "text-accent-ink"}`}>{notice.text}</p>}

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-lg items-start">
                <div className="space-y-lg min-w-0">
                    <section aria-label="Project blockers">
                        <Heading id="resolve-blockers" title={`Project blockers (${blockers.length})`} subtitle="Tasks other tasks are waiting on, most urgent first." />
                        {blockers.length === 0 ? (
                            <p className="rounded-xl border border-line bg-panel p-md text-xs text-muted">No task is waiting on another one.</p>
                        ) : (
                            <ul className="rounded-xl border border-line bg-panel">
                                {blockers.map((blocker) => {
                                    const department = isSplit ? departmentById(blocker.departmentId) : null
                                    return (
                                        <BlockerRow
                                            key={blocker.task.id}
                                            blocker={blocker}
                                            assigneeName={nameOf(blocker.task.assignee_id)}
                                            canComplete={canComplete}
                                            isBusy={busyId === String(blocker.task.id)}
                                            onComplete={() => complete(blocker.task)}
                                            onOpen={() => onOpenTask(blocker.task)}
                                            menu={[
                                                { label: "Open task", icon: "open_in_new", onClick: () => onOpenTask(blocker.task) },
                                                { label: "Reassign", icon: "group", disabled: !canReassign(blocker.task), title: canReassign(blocker.task) ? undefined : "Only the project's managers and the task's assignee can reassign it", onClick: () => onOpenTask(blocker.task, "assignee") },
                                                { label: "Adjust due date", icon: "calendar_month", disabled: !canChangeDueDate(blocker.task), title: canChangeDueDate(blocker.task) ? undefined : "Only the project's managers and the task's department lead can change its due date", onClick: () => onOpenTask(blocker.task, "due") },
                                                ...(department ? [{ label: `Nudge ${department.name}`, icon: "notifications", disabled: !canNudge || !department.lead_id, onClick: () => nudge(department.team_space_id) }] : []),
                                            ]}
                                        />
                                    )
                                })}
                            </ul>
                        )}
                    </section>

                    {isSplit && (
                        <section aria-label="Department status and next steps">
                            <Heading title="Department status & next steps" />
                            <NextSteps steps={steps} canNudge={canNudge} busyId={busyId} onNudge={(step) => nudge(step.id)} onView={(step) => onShowDepartmentTasks(step.id)} />
                        </section>
                    )}
                </div>

                <TakeActionPanel
                    departments={nudgeable}
                    reassignable={asChoices(openTasks.filter(canReassign))}
                    movable={asChoices(openTasks.filter(canChangeDueDate))}
                    canNudge={canNudge}
                    notes={notes.notes}
                    notesError={notes.error}
                    onNudge={nudge}
                    onOpenTask={openTaskById}
                    onAddNote={addNote}
                    departmentsHint={isSplit && onGoToDepartments && (
                        <button type="button" onClick={onGoToDepartments} className="text-[11px] text-muted hover:text-white underline cursor-pointer">
                            A department&apos;s due date is changed on the Departments tab.
                        </button>
                    )}
                />
            </div>

            <ClosePanel
                status={project.status}
                closedAt={project.closed_at}
                closedByName={nameOf(project.closed_by)}
                openCount={openTasks.length}
                readiness={readiness}
                canManage={canManage}
                isBusy={isClosing}
                error={closeError}
                onClose={() => close(false)}
                onReopen={() => close(true)}
            />
        </div>
    )
}
