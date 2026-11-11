import { useState } from "react";
import { formatTaskDeadline } from "./deadlineLabel";

// The Deadline value in the task panel. Project managers and admins can set,
// change or clear it; everyone else only sees it. The database enforces the
// same rule (tasks_guard_due_date).
// onSave(dateOrNull) resolves to an error message, or null on success.
export default function TaskDeadline({ dueDate, canEdit, onSave }) {
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const label = formatTaskDeadline(dueDate);

    const save = async (nextDate) => {
        setSaving(true);
        setError(null);
        const message = await onSave(nextDate || null);
        setSaving(false);
        if (message) setError(message);
        else setIsEditing(false);
    };

    const cancel = () => {
        setIsEditing(false);
        setError(null);
    };

    if (isEditing) {
        return (
            <div className="flex flex-wrap items-center gap-2 mt-1">
                <input
                    type="date"
                    autoFocus
                    disabled={saving}
                    defaultValue={dueDate ? dueDate.slice(0, 10) : ""}
                    onChange={(e) => e.target.value && save(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && cancel()}
                    aria-label="Task deadline"
                    className="bg-canvas border border-line rounded-md px-2 py-1 text-xs text-white focus:outline-none focus:border-accent-ink/50"
                />
                {dueDate && (
                    <button type="button" disabled={saving} onClick={() => save(null)} className="text-xs text-muted hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50">
                        Remove
                    </button>
                )}
                <button type="button" disabled={saving} onClick={cancel} className="text-xs text-muted hover:text-white transition-colors cursor-pointer disabled:opacity-50">
                    Cancel
                </button>
                {error && <p role="alert" className="basis-full text-xs text-red-400">{error}</p>}
            </div>
        );
    }

    if (!canEdit) {
        return (
            <p className="text-sm text-white font-semibold mt-1">
                {label || <span className="italic opacity-70">No deadline</span>}
            </p>
        );
    }

    return (
        <button
            type="button"
            title={label ? "Change the deadline" : "Add a deadline"}
            onClick={() => setIsEditing(true)}
            className="group mt-1 flex items-center gap-1.5 text-left text-sm text-white font-semibold cursor-pointer hover:text-accent-ink transition-colors"
        >
            {label || <span className="italic opacity-70">Set a deadline</span>}
            <span className="material-symbols-outlined text-[14px] text-muted group-hover:text-accent-ink transition-colors">edit</span>
        </button>
    );
}
