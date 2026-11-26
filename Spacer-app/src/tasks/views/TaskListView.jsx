import { useState } from "react"
import Select from "../../components/Select"
import PersonPhoto from "../../avatars/PersonPhoto"
import { TaskKeyText } from "../TaskKeyBar"
import QuickAddTask from "./QuickAddTask"

// The List view: tasks in groups (status, assignee, priority, department or
// none), each row editable where it sits like a ClickUp list or a Jira list:
// status, assignee, due date and priority. Tick rows to change several at
// once (the bulk bar). Clicking a title opens the task panel.
// Every on… handler resolves to a message to show, or null.

const PRIORITIES = [
    { value: "urgent", label: "Urgent", tone: "text-red-400" },
    { value: "high", label: "High", tone: "text-amber-400" },
    { value: "medium", label: "Medium", tone: "text-sky-400" },
    { value: "low", label: "Low", tone: "text-soft" },
]
const NO_PRIORITY = ""
const cellSelect = "w-full min-h-[30px] bg-transparent hover:bg-surface2/70 border border-transparent hover:border-line rounded-md px-1.5 py-0.5 text-[12px] text-left transition-colors focus:outline-none focus-visible:border-accent-ink/60 disabled:hover:bg-transparent disabled:hover:border-transparent disabled:cursor-default"

const dayKey = (value) => String(value || "").slice(0, 10)
const todayKey = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function TickBox({ checked, indeterminate = false, onChange, label }) {
    return (
        <input
            type="checkbox"
            aria-label={label}
            checked={checked}
            ref={(el) => { if (el) el.indeterminate = indeterminate }}
            onChange={onChange}
            className="w-4 h-4 rounded border-line-strong bg-field text-accent focus:ring-accent-ink/40 cursor-pointer"
        />
    )
}

function TaskRow({ task, ctx }) {
    const { columns, columnKeyOf, people, departmentName, parentOf, isCrossDepartment, isSelected, can, handlers } = ctx
    const run = async (action) => {
        const message = await action()
        if (message) handlers.onNotice(message)
    }
    const canEdit = can.edit(task)
    const isDone = task.status === "done"
    const due = dayKey(task.due_date)
    const isOverdue = !isDone && due && due < todayKey()
    const assignee = people.find((p) => p.id === task.assignee_id)
    const choices = task.assignee_id && !assignee ? [{ id: task.assignee_id, name: "Someone" }, ...people] : people
    const priority = PRIORITIES.find((p) => p.value === task.priority)
    const parent = parentOf(task)

    return (
        <tr className={`group/row border-t border-line/50 transition-colors ${isSelected ? "bg-accent/[0.07]" : "hover:bg-surface2/30"}`}>
            <td className="w-9 pl-3 pr-1 py-1.5 align-middle">
                <TickBox checked={isSelected} onChange={() => handlers.onToggleSelect(task.id)} label={`Select ${task.title}`} />
            </td>
            <td className="hidden lg:table-cell w-24 px-2 py-1.5 align-middle whitespace-nowrap"><TaskKeyText task={task} /></td>
            <td className="px-2 py-1.5 align-middle min-w-[12rem]">
                <button type="button" onClick={() => handlers.onOpen(task)} className="block max-w-full text-left cursor-pointer group/title">
                    <span className={`block text-[13px] font-medium truncate group-hover/title:underline ${isDone ? "text-muted line-through" : "text-white"}`}>{task.title}</span>
                    {parent && <span className="block text-[11px] text-muted truncate">↳ {parent.title}</span>}
                </button>
            </td>
            <td className="w-36 px-1 py-1.5 align-middle">
                <Select
                    value={columnKeyOf(task)}
                    disabled={!can.move}
                    aria-label={`Status of ${task.title}`}
                    onChange={(e) => {
                        const column = columns.find((c) => c.key === e.target.value)
                        if (column) run(() => handlers.onMove(task, column))
                    }}
                    className={`${cellSelect} text-soft`}
                >
                    {columns.map((c) => <option key={c.key} value={c.key}>{c.name}</option>)}
                </Select>
            </td>
            <td className="w-44 px-1 py-1.5 align-middle">
                <div className="flex items-center gap-1.5">
                    {task.assignee_id && (
                        <span className="w-5 h-5 rounded-full overflow-hidden bg-surface2 border border-line flex items-center justify-center text-[9px] font-bold text-muted uppercase shrink-0 ml-1">
                            <PersonPhoto userId={task.assignee_id} fallback={(assignee?.name || "?").charAt(0)} />
                        </span>
                    )}
                    <div className="flex-1 min-w-0">
                        <Select
                            value={task.assignee_id || ""}
                            disabled={!canEdit}
                            aria-label={`Assignee of ${task.title}`}
                            onChange={(e) => run(() => handlers.onSave(task, { assignee_id: e.target.value || null }))}
                            className={`${cellSelect} ${task.assignee_id ? "text-soft" : "text-muted"}`}
                        >
                            <option value="">Unassigned</option>
                            {choices.map((p) => <option key={p.id} value={p.id}>{p.name || "Someone"}</option>)}
                        </Select>
                    </div>
                </div>
            </td>
            <td className="w-36 px-1 py-1.5 align-middle">
                <input
                    type="date"
                    value={due}
                    disabled={!can.editDeadline(task)}
                    aria-label={`Due date of ${task.title}`}
                    onChange={(e) => run(() => handlers.onDeadline(task, e.target.value || null))}
                    className={`w-full min-h-[30px] bg-transparent hover:bg-surface2/70 border border-transparent hover:border-line rounded-md px-1.5 py-0.5 text-[12px] focus:outline-none focus:border-accent-ink/60 disabled:hover:bg-transparent disabled:hover:border-transparent ${isOverdue ? "text-red-400 font-semibold" : due ? "text-soft" : "text-muted"}`}
                />
            </td>
            <td className="hidden md:table-cell w-28 px-1 py-1.5 align-middle">
                <Select
                    value={priority?.value ?? NO_PRIORITY}
                    disabled={!canEdit}
                    aria-label={`Priority of ${task.title}`}
                    onChange={(e) => e.target.value && run(() => handlers.onSave(task, { priority: e.target.value }))}
                    className={`${cellSelect} ${priority?.tone || "text-muted"} font-medium`}
                >
                    {!priority && <option value={NO_PRIORITY}>None</option>}
                    {PRIORITIES.map((p) => <option key={p.value} value={p.value} className={p.tone}>{p.label}</option>)}
                </Select>
            </td>
            {isCrossDepartment && (
                <td className="hidden xl:table-cell w-36 px-2 py-1.5 align-middle text-[12px] text-muted truncate">{departmentName(task)}</td>
            )}
        </tr>
    )
}

export default function TaskListView({ groups, isGrouped, selectedIds, canQuickAdd, onQuickAdd, onToggleMany, ...ctx }) {
    const [collapsed, setCollapsed] = useState(() => new Set())
    const toggleGroup = (key) => setCollapsed((prev) => {
        const next = new Set(prev)
        if (next.has(key)) next.delete(key)
        else next.add(key)
        return next
    })
    const total = groups.reduce((n, g) => n + g.tasks.length, 0)
    const columnCount = ctx.isCrossDepartment ? 8 : 7

    // The Tasks tab says why when there are none to show
    if (total === 0 && !canQuickAdd) return null

    return (
        <div className="mt-md rounded-xl border border-line bg-panel overflow-x-auto">
            <table className="w-full min-w-[640px] text-left border-collapse">
                <thead className="sticky top-0 z-10 bg-panel">
                    <tr className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                        <th scope="col" className="w-9 pl-3 pr-1 py-2"><span className="sr-only">Selected</span></th>
                        <th scope="col" className="hidden lg:table-cell px-2 py-2">Key</th>
                        <th scope="col" className="px-2 py-2">Task</th>
                        <th scope="col" className="px-2.5 py-2">Status</th>
                        <th scope="col" className="px-2.5 py-2">Assignee</th>
                        <th scope="col" className="px-2.5 py-2">Due</th>
                        <th scope="col" className="hidden md:table-cell px-2.5 py-2">Priority</th>
                        {ctx.isCrossDepartment && <th scope="col" className="hidden xl:table-cell px-2 py-2">Department</th>}
                    </tr>
                </thead>
                {groups.map((group) => {
                    const isCollapsed = collapsed.has(group.key)
                    const ids = group.tasks.map((t) => t.id)
                    const pickedHere = ids.filter((id) => selectedIds.has(id)).length
                    return (
                        <tbody key={group.key}>
                            {isGrouped && (
                                <tr className="border-t border-line bg-raised/50">
                                    <td className="w-9 pl-3 pr-1 py-1.5">
                                        {ids.length > 0 && (
                                            <TickBox
                                                checked={pickedHere === ids.length}
                                                indeterminate={pickedHere > 0 && pickedHere < ids.length}
                                                onChange={() => onToggleMany(ids, pickedHere < ids.length)}
                                                label={`Select every task in ${group.label}`}
                                            />
                                        )}
                                    </td>
                                    <td colSpan={columnCount - 1} className="px-2 py-1.5">
                                        <button type="button" aria-expanded={!isCollapsed} onClick={() => toggleGroup(group.key)} className="flex items-center gap-1.5 text-[12px] font-semibold text-white cursor-pointer">
                                            <span className={`material-symbols-outlined text-[18px] text-muted transition-transform ${isCollapsed ? "-rotate-90" : ""}`} aria-hidden="true">expand_more</span>
                                            {group.label}
                                            <span className="text-muted font-medium tabular-nums">{group.tasks.length}</span>
                                        </button>
                                    </td>
                                </tr>
                            )}
                            {!isCollapsed && group.tasks.map((task) => (
                                <TaskRow key={task.id} task={task} ctx={{ ...ctx, isSelected: selectedIds.has(task.id) }} />
                            ))}
                            {!isCollapsed && canQuickAdd && (
                                <tr className="border-t border-line/50">
                                    <td />
                                    <td colSpan={columnCount - 1} className="px-1 py-1">
                                        <QuickAddTask label={isGrouped ? `Add to ${group.label}` : "Add task"} onAdd={(title) => onQuickAdd(title, group.defaults)} className="max-w-md" />
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    )
                })}
            </table>
        </div>
    )
}
