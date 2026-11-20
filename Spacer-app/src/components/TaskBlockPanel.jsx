import { useState } from "react"
import Select from "./Select"
import { blockableTasks } from "../crossDepartment"

const fieldClass = "w-full bg-panel border border-line rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-ink/50 transition-colors disabled:opacity-60"

// Task panel section for cross-department projects (design screen 3): the task's
// department, and whether it is waiting on another department's task.
// `departments`: { team_space_id, name }[], lead department first.
// The handlers resolve to an error message, or null once saved.
export default function TaskBlockPanel({ task, tasks, departments, canChangeDepartment, canBlock, onDepartmentChange, onBlockSave }) {
    const leadId = departments[0]?.team_space_id
    const taskDepartmentId = String(task.team_space_id ?? leadId)
    const nameOf = (id) => departments.find((d) => String(d.team_space_id) === String(id))?.name || "another department"
    const blocker = task.blocked_by_task_id ? tasks.find((t) => String(t.id) === String(task.blocked_by_task_id)) : null
    const blockerDepartmentId = blocker ? String(blocker.team_space_id ?? leadId) : ""

    const [waitingOnId, setWaitingOnId] = useState(blockerDepartmentId)
    const [blockerId, setBlockerId] = useState(blocker ? String(blocker.id) : "")
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState(null)

    const otherDepartments = departments.filter((d) => String(d.team_space_id) !== taskDepartmentId)
    const choices = waitingOnId ? blockableTasks(tasks, task.id, waitingOnId, leadId) : []
    const isDone = task.status === "done"
    const isChanged = blockerId !== (blocker ? String(blocker.id) : "")

    const run = async (action) => {
        setSaving(true)
        setError(null)
        const message = await action()
        setSaving(false)
        if (message) setError(message)
    }

    return (
        <div className="bg-raised p-md rounded-xl border border-line/20 space-y-md">
            <div>
                <h3 className="font-label-sm text-muted uppercase tracking-wider flex items-center gap-xs mb-xs">
                    <span className="material-symbols-outlined text-[14px]">groups</span> Department
                </h3>
                <Select
                    aria-label="Task department"
                    className={fieldClass}
                    value={taskDepartmentId}
                    disabled={!canChangeDepartment || saving}
                    onChange={(e) => run(() => onDepartmentChange(e.target.value))}
                >
                    {departments.map((d) => <option key={d.team_space_id} value={d.team_space_id}>{d.name}</option>)}
                </Select>
            </div>

            {!isDone && otherDepartments.length > 0 && (
                <div className="pt-md border-t border-line/30 space-y-sm">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#f59e0b]">Waiting on another department</p>
                    <Select
                        aria-label="Department this task is waiting on"
                        className={`${fieldClass} ${waitingOnId ? "border-[#f59e0b]/60" : ""}`}
                        value={waitingOnId}
                        disabled={!canBlock || saving}
                        onChange={(e) => { setWaitingOnId(e.target.value); setBlockerId("") }}
                    >
                        <option value="">Not waiting on anyone</option>
                        {otherDepartments.map((d) => <option key={d.team_space_id} value={d.team_space_id}>{d.name}</option>)}
                    </Select>

                    {waitingOnId && (
                        <>
                            <label className="block text-xs text-muted">Blocked by task</label>
                            <Select
                                aria-label="Blocking task"
                                className={fieldClass}
                                value={blockerId}
                                disabled={!canBlock || saving}
                                onChange={(e) => setBlockerId(e.target.value)}
                            >
                                <option value="">{choices.length === 0 ? `${nameOf(waitingOnId)} has no open tasks to wait on` : "Pick the task you're waiting on"}</option>
                                {choices.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                            </Select>
                            <p className="text-[11px] leading-relaxed rounded-lg border border-[#f59e0b]/30 bg-[#f59e0b]/10 text-soft p-sm">
                                {nameOf(waitingOnId)}&apos;s lead gets notified. The task shows Blocked, and the delay is counted against {nameOf(waitingOnId)}, not {nameOf(taskDepartmentId)}, until the blocking task is done.
                            </p>
                        </>
                    )}

                    {canBlock ? (
                        <div className="flex justify-between gap-sm pt-xs">
                            <button
                                type="button"
                                disabled={saving || !blocker}
                                onClick={() => run(async () => {
                                    const message = await onBlockSave(null)
                                    if (!message) { setWaitingOnId(""); setBlockerId("") }
                                    return message
                                })}
                                className="px-md py-1.5 rounded-lg border border-line text-xs font-bold text-soft hover:text-white hover:bg-line transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                            >
                                Clear block
                            </button>
                            <button
                                type="button"
                                disabled={saving || !blockerId || !isChanged}
                                onClick={() => run(() => onBlockSave(blockerId))}
                                className="px-md py-1.5 rounded-lg bg-accent text-on-accent text-xs font-bold hover:bg-accent-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                            >
                                {saving ? "Saving…" : "Save"}
                            </button>
                        </div>
                    ) : (
                        <p className="text-[11px] text-muted">Only the task&apos;s owner, its department lead or an admin can set or clear a block.</p>
                    )}
                </div>
            )}
            {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
    )
}
