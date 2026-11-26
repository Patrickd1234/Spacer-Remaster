import { useState } from "react"
import PanelSection, { TickBox, AddLine } from "./PanelSection"
import { TaskKeyText } from "../TaskKeyBar"
import PersonPhoto from "../../avatars/PersonPhoto"
import { formatTaskDeadline } from "../../components/deadlineLabel"

// Real subtasks: tasks of their own (own assignee, due date, board card),
// listed under their parent. Ticking one moves it to Done; clicking its title
// opens it in the panel.
export default function TaskSubtasks({ subtasks, canAdd, canToggle, nameOf, onAdd, onToggle, onOpen }) {
    const [isBusy, setIsBusy] = useState(false)
    const [error, setError] = useState(null)
    const done = subtasks.filter((t) => t.status === "done").length

    const run = async (action) => {
        setIsBusy(true)
        setError(null)
        const message = await action()
        setIsBusy(false)
        if (message) setError(message)
        return !message
    }

    if (subtasks.length === 0 && !canAdd) return null

    return (
        <PanelSection id="task-subtasks" icon="account_tree" title="Subtasks" count={subtasks.length > 0 ? `${done}/${subtasks.length}` : null}>
            {subtasks.length > 0 && (
                <>
                    <div className="h-1 rounded-full bg-surface2 overflow-hidden" aria-hidden="true">
                        <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${(done / subtasks.length) * 100}%` }} />
                    </div>
                    <ul className="divide-y divide-line/50 border border-line/60 rounded-lg">
                        {subtasks.map((sub) => {
                            const isDone = sub.status === "done"
                            const due = sub.due_date ? formatTaskDeadline(sub.due_date) : null
                            return (
                                <li key={sub.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-surface2/40 transition-colors">
                                    <TickBox isDone={isDone} disabled={!canToggle || isBusy} label={`${isDone ? "Reopen" : "Finish"} ${sub.title}`} onToggle={() => run(() => onToggle(sub, !isDone))} />
                                    <TaskKeyText task={sub} className="shrink-0" />
                                    <button type="button" onClick={() => onOpen(sub)} className={`flex-1 min-w-0 text-left text-[13px] truncate cursor-pointer hover:underline ${isDone ? "text-muted line-through" : "text-white"}`}>
                                        {sub.title}
                                    </button>
                                    {due && <span className="text-[11px] text-muted shrink-0 hidden sm:inline">{due}</span>}
                                    {sub.assignee_id && (
                                        <span title={nameOf(sub.assignee_id) || "Assigned"} className="w-5 h-5 rounded-full overflow-hidden bg-surface2 border border-line flex items-center justify-center text-[9px] font-bold text-muted uppercase shrink-0">
                                            <PersonPhoto userId={sub.assignee_id} fallback={(nameOf(sub.assignee_id) || "?").charAt(0)} />
                                        </span>
                                    )}
                                </li>
                            )
                        })}
                    </ul>
                </>
            )}
            {canAdd && <AddLine label="New subtask" placeholder="Add a subtask" isBusy={isBusy} onAdd={(title) => run(() => onAdd(title))} />}
            {error && <p role="alert" className="text-xs text-red-400">{error}</p>}
        </PanelSection>
    )
}
