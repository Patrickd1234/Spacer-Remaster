import { useEffect, useRef, useState } from "react"
import Select from "../components/Select"
import MemberPicker from "./createProject/MemberPicker"
import { selectedMemberIds, toggleMember } from "../newProject"

const fieldClass = "w-full bg-canvas border border-line rounded-lg px-3 py-2 text-[13px] text-white focus:outline-none focus:border-accent-ink/50 transition-all"
const tagClass = "shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider"
const Required = () => <span className="text-red-400" aria-hidden="true">*</span>

// The ⋮ menu: change the department, or remove it (not the lead department)
function DepartmentMenu({ canRemove, onChange, onRemove }) {
    const [isOpen, setIsOpen] = useState(false)
    const ref = useRef(null)
    useEffect(() => {
        if (!isOpen) return undefined
        const close = (e) => { if (!ref.current?.contains(e.target)) setIsOpen(false) }
        const escape = (e) => { if (e.key === "Escape") { e.stopPropagation(); setIsOpen(false) } }
        document.addEventListener("mousedown", close)
        document.addEventListener("keydown", escape, true)
        return () => {
            document.removeEventListener("mousedown", close)
            document.removeEventListener("keydown", escape, true)
        }
    }, [isOpen])
    const pick = (action) => { setIsOpen(false); action() }
    return (
        <div ref={ref} className="relative">
            <button type="button" onClick={() => setIsOpen((v) => !v)} aria-expanded={isOpen} aria-label="Department options" className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-white hover:bg-line transition-colors cursor-pointer">
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">more_vert</span>
            </button>
            {isOpen && (
                <div className="absolute right-0 top-8 z-20 w-48 rounded-lg border border-line bg-surface1 shadow-xl py-1">
                    <button type="button" onClick={() => pick(onChange)} className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-soft hover:text-white hover:bg-line/60 cursor-pointer">
                        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">edit_square</span>
                        Change department
                    </button>
                    {canRemove && (
                        <button type="button" onClick={() => pick(onRemove)} className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-red-400 hover:bg-red-500/10 cursor-pointer">
                            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">delete</span>
                            Remove department
                        </button>
                    )}
                </div>
            )}
        </div>
    )
}

// One department on the Create Project form (design screen 1). Collapsed: its
// name and how many people are picked. Expanded: its lead, due date and the
// member picker. The lead department is tagged LEAD and can't be removed.
// An invited department (`isInvite`: the user can't create projects there) is
// tagged INVITE: its own lead picks who leads it and confirms the proposed
// members when accepting.
// `department`: { teamSpaceId, leadId (resolved), dueDate, memberIds, isInvite }.
export default function ProjectDepartmentCard({
    department, name, choices, leadOptions, people, isLoadingPeople, isLead, isExpanded,
    maxDate, onToggle, onChange, onRemove,
}) {
    const [isChanging, setIsChanging] = useState(false)
    const isInvite = Boolean(department.isInvite)
    const count = selectedMemberIds(department).length
    const bodyId = `department-${department.teamSpaceId}`

    const title = isChanging ? (
        <Select
            aria-label={isLead ? "Lead department" : "Department"}
            className="flex-1 min-w-0 bg-canvas border border-line rounded-lg px-2 py-1 text-sm font-semibold text-white focus:outline-none"
            value={department.teamSpaceId}
            onChange={(e) => { onChange({ teamSpaceId: e.target.value }); setIsChanging(false) }}
        >
            {choices.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </Select>
    ) : (
        <button type="button" onClick={onToggle} aria-expanded={isExpanded} aria-controls={bodyId} className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer">
            <span className="w-7 h-7 rounded-md bg-surface2 border border-line flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[16px] text-soft" aria-hidden="true">workspaces</span>
            </span>
            <span className="text-sm font-semibold text-white truncate">{name}</span>
            {isLead && <span className={`${tagClass} bg-accent text-on-accent`}>LEAD</span>}
            {isInvite && <span className={`${tagClass} border border-line-strong text-soft`} title="You can't create projects here, so this department is invited">INVITE</span>}
        </button>
    )

    return (
        <div className={`rounded-xl border bg-panel ${isInvite ? "border-dashed border-line-strong" : "border-line"}`}>
            <div className="flex items-center gap-2 px-3.5 py-2.5">
                {title}
                {!isExpanded && !isChanging && <span className="text-[12px] text-muted shrink-0">{count} member{count === 1 ? "" : "s"}</span>}
                {isExpanded || isChanging
                    ? <DepartmentMenu canRemove={!isLead} onChange={() => setIsChanging(true)} onRemove={onRemove} />
                    : (
                        <button type="button" onClick={onToggle} aria-label={`Show ${name}`} className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-white cursor-pointer">
                            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">expand_more</span>
                        </button>
                    )}
            </div>
            {isExpanded && (
                <div id={bodyId} className="px-3.5 pb-3.5 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {isInvite ? (
                            <div className="space-y-1">
                                <span className="block text-[11px] text-muted">Department lead</span>
                                <p className="text-[11px] text-soft leading-snug py-1">Their lead picks it when they accept.</p>
                            </div>
                        ) : (
                            <label className="space-y-1">
                                <span className="block text-[11px] text-muted">Department lead <Required /></span>
                                <Select className={fieldClass} value={department.leadId || ""} onChange={(e) => onChange({ leadId: e.target.value })}>
                                    {leadOptions.length === 0 && <option value="">No members yet</option>}
                                    {leadOptions.length > 0 && !department.leadId && <option value="">Pick a lead</option>}
                                    {leadOptions.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                                </Select>
                            </label>
                        )}
                        <label className="space-y-1">
                            <span className="block text-[11px] text-muted">{isInvite ? "Proposed due date" : "Due date"} <Required /></span>
                            <input
                                type="date"
                                className={`${fieldClass} [color-scheme:dark]`}
                                value={department.dueDate || ""}
                                max={maxDate || undefined}
                                onChange={(e) => onChange({ dueDate: e.target.value })}
                            />
                        </label>
                    </div>
                    <div className="space-y-1.5">
                        <p className="text-[12px] font-semibold text-white">
                            {isInvite ? "Propose members" : "Select members"} ({count})
                        </p>
                        {isInvite && <p className="text-[11px] text-muted">{name}&apos;s lead confirms or changes these when accepting.</p>}
                        <MemberPicker
                            departmentName={name}
                            people={people}
                            selectedIds={department.memberIds || []}
                            leadId={isInvite ? null : department.leadId}
                            isLoading={isLoadingPeople}
                            onToggle={(userId) => onChange({ memberIds: toggleMember(department.memberIds, userId) })}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
