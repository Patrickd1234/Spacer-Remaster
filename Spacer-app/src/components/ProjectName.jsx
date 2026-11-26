import { useState } from "react";

export const PROJECT_NAME_MAX = 100;

// The project's name as its page heading (B-06). Managers can click it to
// rename the project: Enter or leaving the field saves, Escape cancels.
// onSave(name) resolves to an error message, or null on success.
export default function ProjectName({ name, canEdit, onSave }) {
    const [isEditing, setIsEditing] = useState(false);
    const [draft, setDraft] = useState(name);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);

    const headingClass = "font-headline-xl text-2xl text-primary leading-tight shrink-0";

    const startEditing = () => {
        setDraft(name);
        setError(null);
        setIsEditing(true);
    };

    const cancel = () => {
        setIsEditing(false);
        setError(null);
    };

    const save = async () => {
        // Enter saves, then the field blurs as it closes: save once
        if (saving) return;
        const next = draft.trim();
        if (next === name) return cancel();
        if (!next) return setError("A project needs a name.");
        setSaving(true);
        setError(null);
        const message = await onSave(next);
        setSaving(false);
        if (message) setError(message);
        else setIsEditing(false);
    };

    if (isEditing) {
        return (
            <div className="flex items-center gap-2 shrink-0">
                <input
                    type="text"
                    autoFocus
                    disabled={saving}
                    value={draft}
                    maxLength={PROJECT_NAME_MAX}
                    onChange={(e) => setDraft(e.target.value)}
                    onBlur={save}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") save();
                        if (e.key === "Escape") cancel();
                    }}
                    aria-label="Project name"
                    className="bg-canvas border border-line rounded-md px-2 py-1 text-xl text-white font-headline-xl focus:outline-none focus:border-accent-ink/50 disabled:opacity-60"
                />
                {error && <span role="alert" className="text-xs text-red-400">{error}</span>}
            </div>
        );
    }

    if (!canEdit) return <h2 className={headingClass}>{name}</h2>;
    return (
        <h2 className={headingClass}>
            <button
                type="button"
                title="Rename the project"
                onClick={startEditing}
                className="group inline-flex items-center gap-2 cursor-pointer text-left"
            >
                {name}
                <span className="material-symbols-outlined text-[18px] text-muted opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity" aria-hidden="true">edit</span>
            </button>
        </h2>
    );
}
