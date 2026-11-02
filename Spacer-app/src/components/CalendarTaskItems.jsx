import { DateBadge } from "../general/GeneralParts"

// Tasks on the shared calendar views (personal Calendar and a project's Calendar tab).
// Items come from taskItem() in generalFormat.

export function TaskChip({ task, onOpen }) {
    const isDone = task.status === "done"
    return (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpen(task) }}
            title={`Task: ${task.title}`}
            className={`w-full text-left px-1.5 py-1 rounded-md border text-[11px] leading-tight truncate cursor-pointer flex items-center gap-1 ${isDone ? "bg-green-500/10 text-green-400 border-green-500/30 line-through" : "bg-accent/10 text-accent-ink border-accent-ink/30"}`}
        >
            <span className="material-symbols-outlined text-[12px] shrink-0">{isDone ? "task_alt" : "radio_button_unchecked"}</span>
            <span className="truncate">{task.title}</span>
        </button>
    )
}

export function TaskRow({ item, onOpen }) {
    return (
        <button type="button" onClick={() => onOpen(item.task)} className="w-full text-left flex items-center gap-3 p-2 rounded-lg hover:bg-raised cursor-pointer">
            <DateBadge event={item} />
            <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium truncate ${item.task.status === "done" ? "text-muted line-through" : "text-white"}`}>{item.title}</p>
                <p className="text-[11px] text-muted">Task due</p>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium bg-accent/10 text-accent-ink border-accent-ink/30">Task</span>
        </button>
    )
}
