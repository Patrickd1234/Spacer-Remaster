import { useEffect, useState } from "react"
import Select from "../../components/Select"
import TaskDeadline from "../../components/TaskDeadline"
import PersonPhoto from "../../avatars/PersonPhoto"
import AwayBadge from "../../availability/AwayBadge"
import { fetchAssignablePeople } from "../taskPanelData"

// The task panel's details column: status, priority, assignee, due date,
// points and when it was made. Each control saves on change; a failed save
// shows its message under the row and the value goes back.

const PRIORITIES = [
    { value: "low", label: "Low", tone: "text-soft" },
    { value: "medium", label: "Medium", tone: "text-sky-400" },
    { value: "high", label: "High", tone: "text-amber-400" },
    { value: "urgent", label: "Urgent", tone: "text-red-400" },
]
const UNASSIGNED = ""
const controlClass = "w-full min-h-[34px] bg-transparent hover:bg-surface2/60 border border-transparent hover:border-line rounded-md px-2 py-1 text-[13px] text-white text-left transition-colors focus:outline-none focus-visible:border-accent-ink/60 disabled:hover:bg-transparent disabled:hover:border-transparent disabled:cursor-default"

function Row({ label, htmlFor, error, children }) {
    return (
        <div className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-2 py-1">
            <label htmlFor={htmlFor} className="text-[12px] text-muted pt-2">{label}</label>
            <div className="min-w-0">
                {children}
                {error && <p role="alert" className="text-[11px] text-red-400 px-2 pt-0.5">{error}</p>}
            </div>
        </div>
    )
}

// People who can take the task, loaded for its department and project
function useAssignablePeople(projectId, teamSpaceId) {
    const [state, setState] = useState({ key: "", people: [] })
    const key = `${projectId}|${teamSpaceId}`
    useEffect(() => {
        let active = true
        fetchAssignablePeople(projectId, teamSpaceId).then(({ data }) => { if (active) setState({ key, people: data }) })
        return () => { active = false }
    }, [projectId, teamSpaceId, key])
    return state.key === key ? state.people : []
}

export default function TaskProperties({
    task, columns, columnKey, departmentId, people, awayPeriods, statusNote = null,
    canEdit, canMove, canEditDeadline, onMove, onSave, onDeadlineSave,
}) {
    const [errors, setErrors] = useState({})
    const assignable = useAssignablePeople(task.project_id, departmentId)
    const nameOf = (id) => people.find((p) => p.id === id)?.name
    const assignee = task.assignee_id ? { id: task.assignee_id, name: nameOf(task.assignee_id) || "Someone" } : null
    // The current assignee stays listed even when no longer in the department
    const choices = assignee && !assignable.some((p) => p.id === assignee.id) ? [assignee, ...assignable] : assignable
    const creator = nameOf(task.created_by)

    const run = async (field, save) => {
        setErrors((prev) => ({ ...prev, [field]: null }))
        const message = await save()
        if (message) setErrors((prev) => ({ ...prev, [field]: message }))
    }

    const priority = PRIORITIES.find((p) => p.value === task.priority) || PRIORITIES[1]

    return (
        <section aria-label="Task details" className="space-y-0.5">
            <Row label="Status" htmlFor="task-status" error={errors.status}>
                <Select
                    id="task-status"
                    value={columnKey}
                    disabled={!canMove}
                    onChange={(e) => {
                        const column = columns.find((c) => c.key === e.target.value)
                        if (column) run("status", () => onMove(column))
                    }}
                    className={controlClass}
                >
                    {columns.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
                </Select>
                {statusNote && (
                    <p className="flex items-center gap-1 px-2 pt-1 text-[11px] font-medium text-amber-300">
                        <span className="material-symbols-outlined text-[13px]" aria-hidden="true">schedule</span>
                        {statusNote}
                    </p>
                )}
            </Row>

            <Row label="Priority" htmlFor="task-priority" error={errors.priority}>
                <Select
                    id="task-priority"
                    value={priority.value}
                    disabled={!canEdit}
                    onChange={(e) => run("priority", () => onSave({ priority: e.target.value }))}
                    className={`${controlClass} ${priority.tone} font-medium`}
                >
                    {PRIORITIES.map((p) => <option key={p.value} value={p.value} className={p.tone}>{p.label}</option>)}
                </Select>
            </Row>

            <Row label="Assignee" htmlFor="task-assignee" error={errors.assignee}>
                <div className="flex items-center gap-2">
                    {assignee && (
                        <span className="w-6 h-6 rounded-full overflow-hidden bg-surface2 border border-line flex items-center justify-center text-[10px] font-bold text-muted uppercase shrink-0 ml-2">
                            <PersonPhoto userId={assignee.id} fallback={assignee.name.charAt(0)} />
                        </span>
                    )}
                    <div className="flex-1 min-w-0">
                        <Select
                            id="task-assignee"
                            value={task.assignee_id || UNASSIGNED}
                            disabled={!canEdit}
                            onChange={(e) => run("assignee", () => onSave({ assignee_id: e.target.value || null }))}
                            className={controlClass}
                        >
                            <option value={UNASSIGNED}>Unassigned</option>
                            {choices.map((p) => <option key={p.id} value={p.id}>{p.name || "Someone"}</option>)}
                        </Select>
                    </div>
                </div>
                {assignee && <div className="px-2"><AwayBadge person={awayPeriods?.get(assignee.id)} /></div>}
            </Row>

            <Row label="Due date">
                <div id="task-due-date" className="px-2">
                    <TaskDeadline key={task.id} dueDate={task.due_date} canEdit={canEditDeadline} onSave={onDeadlineSave} />
                </div>
            </Row>

            {task.story_points != null && (
                <Row label="Points">
                    <p className="text-[13px] text-white px-2 pt-2">{task.story_points}</p>
                </Row>
            )}

            <Row label="Created">
                <p className="text-[12px] text-soft px-2 pt-2">
                    {new Date(task.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    {creator && <span className="text-muted"> by {creator}</span>}
                </p>
            </Row>
        </section>
    )
}
