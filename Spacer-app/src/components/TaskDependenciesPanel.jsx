import { useState } from "react"
import Select from "./Select"
import { blockableTasks, blockedCandidates, blockerEdges, dependencyState } from "../crossDepartment"

const fieldClass = "w-full bg-panel border border-line rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-ink/50 transition-colors disabled:opacity-60"
const STATE_WORDS = { late: "late", conflict: "due after it's needed", stalled: "waiting a while", on_schedule: "on schedule" }
const STATE_TONES = { late: "text-red-400", conflict: "text-red-400", stalled: "text-[#f59e0b]", on_schedule: "text-muted", done: "text-muted" }

const dueLabel = (t) => (t.due_date ? `due ${String(t.due_date).slice(0, 10)}` : "no due date")

function DependencyRow({ other, departmentName, state, canRemove, isBusy, onRemove }) {
    return (
        <li className="flex items-center gap-sm rounded-lg border border-line/60 bg-panel px-3 py-2">
            <div className="flex-1 min-w-0">
                <p className="text-[13px] text-white truncate">{other.title}</p>
                <p className="text-[11px] text-muted truncate">
                    {departmentName && `${departmentName} · `}{dueLabel(other)} · <span className={STATE_TONES[state]}>{state === "done" ? "done" : STATE_WORDS[state]}</span>
                </p>
            </div>
            {canRemove && (
                <button type="button" onClick={onRemove} disabled={isBusy} aria-label={`Remove the dependency on ${other.title}`} title="Remove" className="material-symbols-outlined text-[18px] text-muted hover:text-red-400 transition-colors disabled:opacity-40 cursor-pointer">
                    close
                </button>
            )}
        </li>
    )
}

function AddRow({ label, choices, optionLabel, isBusy, onAdd }) {
    const [pickedId, setPickedId] = useState("")
    if (choices.length === 0) return null
    return (
        <div className="flex gap-sm">
            <Select aria-label={label} className={fieldClass} value={pickedId} onChange={(e) => setPickedId(e.target.value)} disabled={isBusy}>
                <option value="">{label}</option>
                {choices.map((t) => <option key={t.id} value={t.id}>{optionLabel(t)}</option>)}
            </Select>
            <button
                type="button"
                disabled={!pickedId || isBusy}
                onClick={async () => { if (await onAdd(pickedId)) setPickedId("") }}
                className="px-md rounded-lg bg-accent text-on-accent text-xs font-bold hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
                Add
            </button>
        </div>
    )
}

/**
 * Task panel section: the task's department (on a Collab project) and its
 * dependencies, both ways: what it waits on and what waits on it, like Jira's
 * "is blocked by / blocks". `tasks` carry `blocked_by` (attachDependencies).
 * `departments`: { team_space_id, name }[], lead first (empty on a
 * one-department project). `canSetFor(task)`: rights on that task (its assignee
 * or creator, its department's lead, a project manager); a dependency can be
 * added or removed with rights on either of its tasks. The handlers resolve to
 * an error message, or null once saved.
 */
export default function TaskDependenciesPanel({ task, tasks, departments = [], canChangeDepartment, canSetFor, onDepartmentChange, onAddDependency, onRemoveDependency }) {
    const [isBusy, setIsBusy] = useState(false)
    const [error, setError] = useState(null)
    const leadId = departments[0]?.team_space_id
    const hasDepartments = departments.length > 1
    const nameOf = (t) => (hasDepartments ? departments.find((d) => String(d.team_space_id) === String(t.team_space_id ?? leadId))?.name || "" : "")
    const byId = new Map(tasks.map((t) => [String(t.id), t]))
    const now = new Date()
    const canHere = canSetFor(task)
    const stateOf = (waiting, blocker) => (blocker.status === "done" ? "done" : dependencyState(waiting, blocker, now))

    const waitsOn = blockerEdges(task).map((e) => byId.get(String(e.id))).filter(Boolean)
    const waitedOnBy = tasks.filter((t) => blockerEdges(t).some((e) => String(e.id) === String(task.id)))
    // With no rights here, only tasks you have rights on can be linked
    const withRights = (list) => (canHere ? list : list.filter(canSetFor))
    const blockerChoices = withRights(blockableTasks(tasks, task.id))
    const blockedChoices = withRights(blockedCandidates(tasks, task.id))
    const optionLabel = (t) => [t.title, nameOf(t), dueLabel(t)].filter(Boolean).join(" · ")

    const run = async (action) => {
        setIsBusy(true)
        setError(null)
        const message = await action()
        setIsBusy(false)
        if (message) setError(message)
        return !message
    }

    return (
        <div className="bg-raised p-md rounded-xl border border-line/20 space-y-md">
            {hasDepartments && (
                <div>
                    <h3 className="font-label-sm text-muted uppercase tracking-wider flex items-center gap-xs mb-xs">
                        <span className="material-symbols-outlined text-[14px]">groups</span> Department
                    </h3>
                    <Select aria-label="Task department" className={fieldClass} value={String(task.team_space_id ?? leadId)} disabled={!canChangeDepartment || isBusy} onChange={(e) => run(() => onDepartmentChange(e.target.value))}>
                        {departments.map((d) => <option key={d.team_space_id} value={d.team_space_id}>{d.name}</option>)}
                    </Select>
                </div>
            )}

            <div className={`space-y-sm ${hasDepartments ? "pt-md border-t border-line/30" : ""}`}>
                <h3 className="font-label-sm text-muted uppercase tracking-wider flex items-center gap-xs">
                    <span className="material-symbols-outlined text-[14px]">hourglass_top</span> Waiting on
                </h3>
                {waitsOn.length === 0 && <p className="text-[11px] text-muted">Nothing. This task can go ahead.</p>}
                <ul className="space-y-1.5">
                    {waitsOn.map((blocker) => (
                        <DependencyRow key={blocker.id} other={blocker} departmentName={nameOf(blocker)} state={stateOf(task, blocker)} isBusy={isBusy}
                            canRemove={canHere || canSetFor(blocker)} onRemove={() => run(() => onRemoveDependency(task.id, blocker.id))} />
                    ))}
                </ul>
                {task.status !== "done" && (
                    <AddRow label="Add a task this one waits on" choices={blockerChoices} optionLabel={optionLabel} isBusy={isBusy} onAdd={(id) => run(() => onAddDependency(task.id, id))} />
                )}
            </div>

            <div className="space-y-sm pt-md border-t border-line/30">
                <h3 className="font-label-sm text-muted uppercase tracking-wider flex items-center gap-xs">
                    <span className="material-symbols-outlined text-[14px]">block</span> Blocking
                </h3>
                {waitedOnBy.length === 0 && <p className="text-[11px] text-muted">No task waits on this one.</p>}
                <ul className="space-y-1.5">
                    {waitedOnBy.map((waiting) => (
                        <DependencyRow key={waiting.id} other={waiting} departmentName={nameOf(waiting)} state={task.status === "done" ? "done" : stateOf(waiting, task)} isBusy={isBusy}
                            canRemove={canHere || canSetFor(waiting)} onRemove={() => run(() => onRemoveDependency(waiting.id, task.id))} />
                    ))}
                </ul>
                {task.status !== "done" && (
                    <AddRow label="Add a task that waits on this one" choices={blockedChoices} optionLabel={optionLabel} isBusy={isBusy} onAdd={(id) => run(() => onAddDependency(id, task.id))} />
                )}
            </div>

            <p className="text-[11px] text-muted leading-relaxed">
                A task waited on holds the other up only when it&apos;s late, due after the waiting task, or has no due date and has been waited on for a while. Finishing it lets the waiting task go ahead.
            </p>
            {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
        </div>
    )
}
