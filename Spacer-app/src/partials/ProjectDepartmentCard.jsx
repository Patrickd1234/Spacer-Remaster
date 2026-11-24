import Select from "../components/Select"

const fieldClass = "w-full bg-canvas border border-line rounded-lg px-3 py-2 text-[13px] text-white focus:outline-none focus:border-accent-ink/50 transition-all"
const tagClass = "shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider"

// One department on the Create Project form: which department, its lead and its
// due date. The lead department is outlined and tagged LEAD and can't be removed.
// An invited department (`isInvite`: the user can't create projects there) is
// tagged INVITE; its own lead picks who leads it when accepting.
export default function ProjectDepartmentCard({
    department, choices, leadOptions, isLead, isInvite = false, maxDate, onChange, onRemove,
}) {
    return (
        <div className={`rounded-xl border p-3.5 space-y-2.5 bg-panel ${isLead ? "border-accent-ink/70" : isInvite ? "border-dashed border-line-strong" : "border-line"}`}>
            <div className="flex items-center gap-2">
                <Select
                    aria-label={isLead ? "Lead department" : "Department"}
                    className="flex-1 min-w-0 bg-transparent border-none px-0 py-0 text-sm font-semibold text-white focus:outline-none"
                    value={department.teamSpaceId}
                    onChange={(e) => onChange({ teamSpaceId: e.target.value })}
                >
                    {choices.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </Select>
                {isLead && <span className={`${tagClass} bg-accent text-on-accent`}>LEAD</span>}
                {isInvite && <span className={`${tagClass} border border-line-strong text-soft`} title="You can't create projects here, so this department is invited">INVITE</span>}
                {!isLead && (
                    <button
                        type="button"
                        onClick={onRemove}
                        aria-label="Remove this department"
                        title="Remove this department"
                        className="material-symbols-outlined shrink-0 text-[18px] text-muted hover:text-red-400 transition-colors cursor-pointer"
                    >
                        close
                    </button>
                )}
            </div>
            <div className="grid grid-cols-2 gap-2.5">
                {isInvite ? (
                    <div className="space-y-1">
                        <span className="block text-[11px] text-muted">Department lead</span>
                        <p className="text-[11px] text-soft leading-snug py-1">Their lead picks it when they accept.</p>
                    </div>
                ) : (
                    <label className="space-y-1">
                        <span className="block text-[11px] text-muted">Department lead</span>
                        <Select className={fieldClass} value={department.leadId} onChange={(e) => onChange({ leadId: e.target.value })}>
                            <option value="">{leadOptions.length === 0 ? "No members yet" : "No lead"}</option>
                            {leadOptions.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                        </Select>
                    </label>
                )}
                <label className="space-y-1">
                    <span className="block text-[11px] text-muted">{isInvite ? "Proposed due date" : "Due"}</span>
                    <input
                        type="date"
                        className={`${fieldClass} [color-scheme:dark]`}
                        value={department.dueDate}
                        max={maxDate || undefined}
                        onChange={(e) => onChange({ dueDate: e.target.value })}
                    />
                </label>
            </div>
        </div>
    )
}
