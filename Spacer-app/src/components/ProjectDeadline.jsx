import { useState } from "react";
import { describeDeadline } from "./deadlineLabel";

const TONE_CLASS = {
    normal: "border-line text-soft",
    warn: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    danger: "border-red-500/40 bg-red-500/10 text-red-400",
};

// The project's deadline beside its name. Managers can set, change or clear it;
// everyone else only sees it, and nothing shows when there's no deadline.
// onSave(dateOrNull) resolves to an error message, or null on success.
export default function ProjectDeadline({ dueDate, canEdit, onSave }) {
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const deadline = describeDeadline(dueDate);
    if (!deadline && !canEdit) return null;

    const save = async (nextDate) => {
        setSaving(true);
        setError(null);
        const message = await onSave(nextDate || null);
        setSaving(false);
        if (message) setError(message);
        else setIsEditing(false);
    };

    if (isEditing) {
        return (
            <div className="flex items-center gap-2">
                <input
                    type="date"
                    autoFocus
                    disabled={saving}
                    defaultValue={dueDate ? dueDate.slice(0, 10) : ""}
                    onChange={(e) => e.target.value && save(e.target.value)}
                    onKeyDown={(e) => e.key === "Escape" && setIsEditing(false)}
                    aria-label="Project deadline"
                    className="bg-canvas border border-line rounded-md px-2 py-1 text-xs text-white focus:outline-none focus:border-accent-ink/50 [color-scheme:dark]"
                />
                {dueDate && (
                    <button type="button" disabled={saving} onClick={() => save(null)} className="text-xs text-muted hover:text-red-400 transition-colors cursor-pointer disabled:opacity-50">
                        Remove
                    </button>
                )}
                <button type="button" disabled={saving} onClick={() => { setIsEditing(false); setError(null); }} className="text-xs text-muted hover:text-white transition-colors cursor-pointer disabled:opacity-50">
                    Cancel
                </button>
                {error && <span className="text-xs text-red-400">{error}</span>}
            </div>
        );
    }

    const chipClass = deadline ? TONE_CLASS[deadline.tone] : "border-dashed border-line text-muted";
    const content = (
        <>
            <span className="material-symbols-outlined text-[14px]">event</span>
            {deadline ? deadline.label : "Set deadline"}
        </>
    );

    if (!canEdit) {
        return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${chipClass}`}>{content}</span>;
    }
    return (
        <button
            type="button"
            title={deadline ? "Change the deadline" : "Add a deadline"}
            onClick={() => setIsEditing(true)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium hover:border-accent-ink/50 transition-colors cursor-pointer ${chipClass}`}
        >
            {content}
        </button>
    );
}
