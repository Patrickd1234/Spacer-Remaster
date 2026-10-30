import { useState } from "react"
import CreateTaskModal from "../partials/CreateTaskModal"
import { parseSubtasks } from "../taskStatus"
import { dayKey } from "../general/generalFormat"

// Side drawers for the personal Calendar page: one day's schedule, and a task's details

const subtaskLabel = (st) => st.title || st.text || ""
const newSubtaskId = () => Math.random().toString(36).substring(2, 9)

function SubtaskProgress({ task }) {
    const subtasks = parseSubtasks(task.sub_tasks)
    if (subtasks.length === 0) return null
    const done = subtasks.filter((st) => st.done).length
    return (
        <div className="mt-2">
            <div className="flex items-center justify-between text-[10px] text-[#8c947b] mb-1 font-medium">
                <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[12px]">format_list_bulleted</span>
                    Sub-tasks
                </span>
                <span>{done}/{subtasks.length}</span>
            </div>
            <div className="w-full bg-[#16181e] rounded-full h-1 overflow-hidden">
                <div className="bg-[#aff82a] h-full transition-all duration-300" style={{ width: `${(done / subtasks.length) * 100}%` }} />
            </div>
        </div>
    )
}

function ScheduleItem({ item, onOpenTask, onOpenEvent }) {
    const isTask = item.kind === "task"
    const time = item.starts_at ? new Date(item.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "All Day"
    return (
        <button
            type="button"
            onClick={() => (isTask ? onOpenTask(item.task) : onOpenEvent(item))}
            className="w-full text-left bg-[#1C1F26] p-4 rounded-xl border border-[#2D3139] flex flex-col gap-2 cursor-pointer hover:border-[#424934] transition-all"
        >
            <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded flex items-center gap-1 ${isTask ? "bg-[#aff82a]/20 text-[#aff82a]" : "bg-purple-500/20 text-purple-400"}`}>
                    <span className="material-symbols-outlined text-[12px]">{isTask ? "task" : "event"}</span>
                    {isTask ? "Task" : "Event"}
                </span>
                <span className="text-xs text-[#8c947b] font-medium">{time}</span>
            </div>
            <h3 className="text-sm font-bold text-white mt-1">{item.title}</h3>
            {item.description && <p className="text-xs text-[#8c947b] line-clamp-2">{item.description}</p>}
            {isTask && <SubtaskProgress task={item.task} />}
        </button>
    )
}

// items: calendar items for this day (events, and tasks wrapped as { kind: "task", task })
export function DayScheduleDrawer({ date, items, organizationId, canAddEvent, onAddEvent, onTaskCreated, onOpenTask, onOpenEvent, onClose }) {
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [isAddingTask, setIsAddingTask] = useState(false)

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-lg bg-[#191c21] border-l border-[#2D3139] shadow-2xl h-full flex flex-col text-white" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between p-6 border-b border-[#2D3139] bg-[#181a20] shrink-0">
                    <div>
                        <h2 className="text-lg font-bold text-white">
                            Schedule for {date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })}
                        </h2>
                        <p className="text-xs text-[#8c947b] mt-0.5">Tasks and events scheduled for this day</p>
                    </div>
                    <div className="flex items-center gap-2 relative">
                        <button
                            type="button"
                            className="text-[#8c947b] hover:text-white bg-[#1e2025] hover:bg-[#2D3139] w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer border border-[#2D3139]"
                            onClick={() => setIsMenuOpen((open) => !open)}
                            aria-label="Add item"
                            aria-expanded={isMenuOpen}
                        >
                            <span className="material-symbols-outlined text-[18px]">add</span>
                        </button>
                        {isMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)} />
                                <div className="absolute right-0 top-full mt-1 w-44 bg-[#1c1f26] border border-[#2D3139] rounded-xl shadow-2xl z-50 overflow-hidden">
                                    <button
                                        type="button"
                                        className="w-full text-left px-4 py-2.5 hover:bg-[#2D3139] transition-colors flex items-center gap-2 text-xs font-medium text-white cursor-pointer"
                                        onClick={() => { setIsMenuOpen(false); setIsAddingTask(true) }}
                                    >
                                        <span className="material-symbols-outlined text-[16px] text-[#aff82a]">task</span> Add Task
                                    </button>
                                    {canAddEvent && (
                                        <button
                                            type="button"
                                            className="w-full text-left px-4 py-2.5 hover:bg-[#2D3139] transition-colors flex items-center gap-2 text-xs font-medium text-white cursor-pointer"
                                            onClick={() => { setIsMenuOpen(false); onAddEvent() }}
                                        >
                                            <span className="material-symbols-outlined text-[16px] text-purple-400">event</span> Add Event
                                        </button>
                                    )}
                                </div>
                            </>
                        )}
                        <button type="button" aria-label="Close" className="text-[#8c947b] hover:text-white w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#2D3139] transition-colors cursor-pointer" onClick={onClose}>
                            <span className="material-symbols-outlined text-[20px]">close</span>
                        </button>
                    </div>
                </div>

                <div className="p-6 overflow-y-auto flex-1 space-y-4">
                    {isAddingTask ? (
                        <div className="h-full flex flex-col">
                            <button type="button" onClick={() => setIsAddingTask(false)} className="mb-4 text-xs font-medium text-[#8c947b] hover:text-white flex items-center gap-1 cursor-pointer w-fit">
                                <span className="material-symbols-outlined text-[14px]">arrow_back</span> Back to day schedule
                            </button>
                            <CreateTaskModal
                                organizationId={organizationId}
                                initialStatus="todo"
                                initialDate={`${dayKey(date)}T09:00`}
                                isInline={true}
                                onClose={() => setIsAddingTask(false)}
                                onCreated={(task) => { onTaskCreated(task); setIsAddingTask(false) }}
                            />
                        </div>
                    ) : items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center text-[#8c947b] space-y-2">
                            <span className="material-symbols-outlined text-4xl">calendar_today</span>
                            <p className="text-sm font-medium text-white">Nothing scheduled for this day</p>
                            <p className="text-xs">Click the "+" button above to add a task{canAddEvent ? " or event" : ""}.</p>
                        </div>
                    ) : (
                        items.map((item) => <ScheduleItem key={item.id} item={item} onOpenTask={onOpenTask} onOpenEvent={onOpenEvent} />)
                    )}
                </div>
            </div>
        </div>
    )
}

export function TaskDetailsDrawer({ task, onClose, onSubtasksChange, onStatusChange, onPriorityChange }) {
    const [newSubtaskTitle, setNewSubtaskTitle] = useState("")
    const subtasks = parseSubtasks(task.sub_tasks)

    const toggleSubtask = (id) => onSubtasksChange(task.id, subtasks.map((st) => (st.id === id ? { ...st, done: !st.done } : st)))
    const deleteSubtask = (id) => onSubtasksChange(task.id, subtasks.filter((st) => st.id !== id))
    const addSubtask = (e) => {
        e.preventDefault()
        if (!newSubtaskTitle.trim()) return
        onSubtasksChange(task.id, [...subtasks, { id: newSubtaskId(), title: newSubtaskTitle.trim(), done: false }])
        setNewSubtaskTitle("")
    }

    return (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="w-full max-w-md bg-[#191c21] border-l border-[#2D3139] p-6 flex flex-col justify-between h-full text-white" onClick={(e) => e.stopPropagation()}>
                <div>
                    <div className="flex items-center justify-between pb-4 border-b border-[#2D3139] mb-6">
                        <h3 className="font-bold text-lg text-white">Task Details</h3>
                        <button type="button" aria-label="Close" onClick={onClose} className="text-[#8c947b] hover:text-white cursor-pointer">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>
                    <h2 className="text-xl font-bold text-white mb-2">{task.title}</h2>
                    <p className="text-sm text-[#8c947b] mb-4">{task.description || "No description provided."}</p>

                    <div className="mb-6 space-y-3">
                        <h4 className="text-xs font-semibold text-[#8c947b] uppercase tracking-wider flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px]">format_list_bulleted</span>
                            Sub-tasks
                        </h4>
                        <div className="bg-[#181a20] p-4 rounded-xl border border-[#2D3139] space-y-2">
                            {subtasks.length === 0 ? (
                                <p className="text-[11px] text-[#8c947b] italic">No sub-tasks added yet.</p>
                            ) : (
                                <div className="space-y-1">
                                    {subtasks.map((st) => (
                                        <div key={st.id} className="flex items-center justify-between group py-0.5">
                                            <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-white flex-1">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleSubtask(st.id)}
                                                    className={`check-btn ${!st.done ? "!bg-[#111318] !shadow-none !border !border-[#2D3139] hover:!bg-[#2D3139]" : ""} !p-0 !w-3.5 !h-3.5 !rounded flex items-center justify-center shrink-0`}
                                                    title={st.done ? "Mark as incomplete" : "Mark as done"}
                                                >
                                                    <svg className={`check-icon transition-opacity ${!st.done ? "opacity-0" : "opacity-100"} !w-2.5 !h-2.5`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </button>
                                                <span className={st.done ? "line-through text-[#8c947b]" : ""}>{subtaskLabel(st)}</span>
                                            </label>
                                            <button
                                                type="button"
                                                aria-label={`Delete ${subtaskLabel(st)}`}
                                                onClick={() => deleteSubtask(st.id)}
                                                className="opacity-0 group-hover:opacity-100 text-[#8c947b] hover:text-red-400 w-5 h-5 rounded flex items-center justify-center transition-all cursor-pointer"
                                            >
                                                <span className="material-symbols-outlined text-[14px]">delete</span>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <form onSubmit={addSubtask} className="flex gap-2 pt-2 border-t border-[#2D3139] mt-2">
                                <input
                                    type="text"
                                    placeholder="Add sub-task..."
                                    value={newSubtaskTitle}
                                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                                    className="flex-1 bg-[#111318] border border-[#2D3139] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#aff82a] transition-all placeholder-[#8c947b]"
                                />
                                <button type="submit" className="px-3 bg-[#5b644d] text-white rounded-lg text-[11px] font-semibold hover:bg-[#6c765c] transition-all cursor-pointer flex items-center justify-center gap-1">
                                    <span className="material-symbols-outlined text-[14px]">add</span>
                                    Add
                                </button>
                            </form>
                        </div>
                    </div>

                    <div className="space-y-4 text-xs">
                        <div className="flex items-center justify-between py-2 border-b border-[#2D3139]">
                            <span className="text-[#8c947b]">Status</span>
                            <select
                                value={task.status || "todo"}
                                onChange={(e) => onStatusChange(task.id, e.target.value)}
                                className="bg-[#181a20] border border-[#2D3139] text-white font-bold text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#aff82a] uppercase cursor-pointer"
                            >
                                <option value="todo" className="bg-[#191c21]">Backlog / To Do</option>
                                <option value="in_progress" className="bg-[#191c21]">Doing / In Progress</option>
                                <option value="done" className="bg-[#191c21]">Done</option>
                            </select>
                        </div>
                        <div className="flex items-center justify-between py-2 border-b border-[#2D3139]">
                            <span className="text-[#8c947b]">Priority</span>
                            <select
                                value={task.priority || "medium"}
                                onChange={(e) => onPriorityChange(task.id, e.target.value)}
                                className="bg-[#181a20] border border-[#2D3139] text-[#aff82a] font-bold text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#aff82a] uppercase cursor-pointer"
                            >
                                <option value="low" className="bg-[#191c21] text-white">Low</option>
                                <option value="medium" className="bg-[#191c21] text-white">Medium</option>
                                <option value="high" className="bg-[#191c21] text-amber-400">High</option>
                                <option value="urgent" className="bg-[#191c21] text-red-400">Urgent</option>
                            </select>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-[#2D3139]">
                            <span className="text-[#8c947b]">Due Date</span>
                            <span className="font-semibold text-white">{task.due_date ? new Date(task.due_date).toLocaleDateString() : "—"}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
