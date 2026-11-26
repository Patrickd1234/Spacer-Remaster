import PanelSection, { TickBox, AddLine } from "./PanelSection"
import { parseSubtasks } from "../../taskStatus"

// The checklist: quick to-do items inside one task (tasks.sub_tasks, stored as
// JSON). Ticking items still moves the task: all ticked is Done, some is Doing.
// onChange(items) saves the whole list.
const newItemId = () => (crypto.randomUUID?.() || Math.random().toString(36).slice(2, 11))
const itemText = (item) => item.title ?? item.text ?? ""

export default function TaskChecklist({ raw, canEdit, onChange }) {
    const items = parseSubtasks(raw)
    const done = items.filter((item) => item.done).length
    if (items.length === 0 && !canEdit) return null

    return (
        <PanelSection id="task-checklist" icon="checklist" title="Checklist" count={items.length > 0 ? `${done}/${items.length}` : null}>
            {items.length > 0 && (
                <ul className="space-y-0.5">
                    {items.map((item) => (
                        <li key={item.id ?? itemText(item)} className="group/item flex items-center gap-2.5 rounded-md px-1 py-1 hover:bg-surface2/40">
                            <TickBox
                                isDone={Boolean(item.done)}
                                disabled={!canEdit}
                                label={`${item.done ? "Untick" : "Tick"} ${itemText(item)}`}
                                onToggle={() => onChange(items.map((i) => (i === item ? { ...i, done: !i.done } : i)))}
                            />
                            <span className={`flex-1 min-w-0 text-[13px] break-words ${item.done ? "text-muted line-through" : "text-soft"}`}>{itemText(item)}</span>
                            {canEdit && (
                                <button
                                    type="button"
                                    onClick={() => onChange(items.filter((i) => i !== item))}
                                    aria-label={`Remove ${itemText(item)}`}
                                    className="material-symbols-outlined text-[16px] text-muted hover:text-red-400 opacity-0 group-hover/item:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
                                >
                                    close
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            {canEdit && (
                <AddLine
                    label="New checklist item"
                    placeholder="Add an item"
                    onAdd={async (title) => { await onChange([...items, { id: newItemId(), title, done: false }]); return true }}
                />
            )}
        </PanelSection>
    )
}
