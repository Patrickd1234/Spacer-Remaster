import { openWaits } from "../waiting"

function ActionButton({ icon, label, onClick, isPrimary = false, disabled = false, title }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border text-[12px] text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${isPrimary
                ? "border-accent-ink/60 text-white hover:bg-accent/10"
                : "border-line text-soft hover:text-white hover:bg-surface2"}`}
        >
            <span className={`material-symbols-outlined text-[17px] ${isPrimary ? "text-accent-ink" : "text-muted"}`} aria-hidden="true">{icon}</span>
            {label}
        </button>
    )
}

/**
 * The task panel's dependency box and actions (design screens 03 and 05).
 * While the task waits on open work: "Blocking this task" with each task waited
 * on, its department, the note, and the automatic-unblock rule. Otherwise
 * "Blocked by: No blockers yet". Then Mark as waiting, Add dependency, Change
 * assignee and Adjust due date. `can`: { markWaiting, addDependency,
 * changeAssignee, adjustDueDate }.
 */
export default function TaskWaitingSection({ task, tasks, departments, can, onOpenTask, onMarkWaiting, onAddDependency, onChangeAssignee, onAdjustDueDate }) {
    const waits = openWaits(task, tasks, departments)
    const isDone = task.status === "done"
    const departmentWord = (w) => w.departmentName || "the other task"

    return (
        <section aria-label="Dependencies and actions" className="space-y-3 pt-4 mt-3 border-t border-line">
            {waits.length > 0 ? (
                <div className="rounded-xl border border-amber-400/40 bg-amber-500/[0.06] p-3 space-y-2.5">
                    <p className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-300">
                        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">info</span>
                        Blocking this task
                    </p>
                    <ul className="space-y-2">
                        {waits.map((w) => (
                            <li key={w.blocker.id} className="rounded-lg border border-line bg-panel px-2.5 py-2">
                                <div className="flex items-start gap-2">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[12px] text-white leading-snug">{w.blocker.title}</p>
                                        {w.departmentName && <p className="text-[11px] text-muted">{w.departmentName}</p>}
                                    </div>
                                    <button type="button" onClick={() => onOpenTask(w.blocker)} aria-label={`Open ${w.blocker.title}`} title="Open this task" className="text-muted hover:text-white cursor-pointer">
                                        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">open_in_new</span>
                                    </button>
                                </div>
                                {w.note && <p className="mt-1.5 text-[11px] text-soft italic leading-snug">“{w.note}”</p>}
                            </li>
                        ))}
                    </ul>
                    <p className="text-[11px] text-muted leading-relaxed">
                        This task is waiting on the completion of the {waits.length === 1 ? "task" : "tasks"} above
                        {waits.length === 1 && waits[0].departmentName ? ` (${departmentWord(waits[0])})` : ""}.
                        It will be automatically unblocked once {waits.length === 1 ? "it's" : "they're all"} marked as Done.
                    </p>
                </div>
            ) : (
                <div className="rounded-xl border border-line p-3 space-y-2">
                    <p className="flex items-center gap-1.5 text-[12px] font-semibold text-white">
                        <span className="material-symbols-outlined text-[16px] text-muted" aria-hidden="true">info</span>
                        Blocked by
                    </p>
                    <p className="flex items-center justify-center gap-1.5 rounded-lg border border-line bg-panel py-2 text-[11px] text-muted">
                        <span className="material-symbols-outlined text-[14px]" aria-hidden="true">schedule</span>
                        No blockers yet
                    </p>
                </div>
            )}

            <div className="space-y-1.5">
                <ActionButton icon="schedule" label="Mark as waiting" isPrimary onClick={onMarkWaiting}
                    disabled={!can.markWaiting || isDone}
                    title={isDone ? "This task is done" : can.markWaiting ? undefined : "There's no open task it could wait on, or you can't change this task"} />
                <ActionButton icon="link" label="Add dependency" onClick={onAddDependency}
                    disabled={!can.addDependency || isDone}
                    title={isDone ? "This task is done" : can.addDependency ? undefined : "There's no open task it could wait on, or only its assignee or creator, its department's lead or a project manager can add one"} />
                <ActionButton icon="person" label="Change assignee" onClick={onChangeAssignee} disabled={!can.changeAssignee} />
                <ActionButton icon="calendar_today" label="Adjust due date" onClick={onAdjustDueDate} disabled={!can.adjustDueDate} />
            </div>
        </section>
    )
}
