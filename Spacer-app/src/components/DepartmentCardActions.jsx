import { useEffect, useState } from "react"
import Select from "./Select"
import { setDepartmentSignOff, updateProjectDepartment, removeProjectDepartment } from "../crossDepartmentData"
import { fetchDepartmentPeople } from "../departmentInvitesData"

const fieldClass = "w-full bg-canvas border border-line rounded-lg px-3 py-2 text-[12px] text-white focus:outline-none focus:border-accent-ink/50 transition-all"
const linkClass = "text-[11px] font-semibold hover:underline disabled:opacity-50 cursor-pointer"
const buttonClass = "px-md py-1 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-50 cursor-pointer"

// Change a department's lead (managers only) and due date (managers or its lead)
function EditForm({ projectId, summary, projectDueDate, canChangeLead, onDone, onCancel }) {
    const [people, setPeople] = useState(null)
    const [leadId, setLeadId] = useState(summary.lead_id || "")
    const [dueDate, setDueDate] = useState(summary.due_date || "")
    const [error, setError] = useState(null)
    const [isSaving, setIsSaving] = useState(false)
    useEffect(() => {
        if (!canChangeLead) return undefined
        let active = true
        fetchDepartmentPeople(summary.team_space_id).then(({ data }) => { if (active) setPeople(data) })
        return () => { active = false }
    }, [canChangeLead, summary.team_space_id])

    const save = async () => {
        const changes = {
            ...(canChangeLead && leadId !== (summary.lead_id || "") ? { lead_id: leadId || null } : {}),
            ...(dueDate !== (summary.due_date || "") ? { due_date: dueDate || null } : {}),
        }
        if (Object.keys(changes).length === 0) { onCancel(); return }
        setIsSaving(true)
        const { error: saveError } = await updateProjectDepartment(projectId, summary.team_space_id, changes)
        setIsSaving(false)
        if (saveError) setError(saveError)
        else onDone(`${summary.name} updated.`)
    }

    return (
        <div className="mt-md pt-md border-t border-line/40 space-y-sm">
            {canChangeLead && (
                <label className="block space-y-1">
                    <span className="block text-[11px] text-muted">Department lead</span>
                    <Select className={fieldClass} value={leadId} onChange={(e) => setLeadId(e.target.value)} disabled={people === null}>
                        <option value="">{people === null ? "Loading people…" : "No lead"}</option>
                        {(people || []).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                    </Select>
                </label>
            )}
            <label className="block space-y-1">
                <span className="block text-[11px] text-muted">Due</span>
                <input type="date" className={`${fieldClass} [color-scheme:dark]`} value={dueDate} max={projectDueDate || undefined} onChange={(e) => setDueDate(e.target.value)} />
            </label>
            {error && <p role="alert" className="text-[11px] text-red-400">{error}</p>}
            <div className="flex gap-sm">
                <button type="button" onClick={onCancel} disabled={isSaving} className={`${buttonClass} border border-line text-soft hover:text-white hover:bg-line`}>Cancel</button>
                <button type="button" onClick={save} disabled={isSaving} className={`${buttonClass} bg-accent text-on-accent hover:bg-accent-hover`}>{isSaving ? "Saving…" : "Save"}</button>
            </div>
        </div>
    )
}

// A yes/no step before something that's hard to take back
function Confirm({ text, actionLabel, isDanger = false, isBusy, onConfirm, onCancel }) {
    return (
        <div className="mt-md pt-md border-t border-line/40 space-y-sm">
            <p className="text-[11px] text-soft leading-relaxed">{text}</p>
            <div className="flex gap-sm">
                <button type="button" onClick={onCancel} disabled={isBusy} className={`${buttonClass} border border-line text-soft hover:text-white hover:bg-line`}>Back</button>
                <button type="button" onClick={onConfirm} disabled={isBusy} className={`${buttonClass} ${isDanger ? "border border-red-400/60 text-red-400 hover:bg-red-500/10" : "bg-accent text-on-accent hover:bg-accent-hover"}`}>
                    {actionLabel}
                </button>
            </div>
        </div>
    )
}

/**
 * The actions under one department card: edit (lead: managers; due date:
 * managers or the department's lead), remove (managers, not the lead
 * department; its tasks move to the lead department), sign off (managers or
 * the department's lead; asks first when tasks are still open).
 * `onChanged(message)` after a save; `leadDepartmentName` for the remove text.
 */
export default function DepartmentCardActions({ projectId, projectDueDate, summary, canManage, isLead, leadDepartmentName, onChanged }) {
    const [mode, setMode] = useState(null) // null | "edit" | "remove" | "signoff"
    const [isBusy, setIsBusy] = useState(false)
    const [error, setError] = useState(null)
    const canEdit = canManage || isLead
    const canSignOff = canManage || isLead
    const canRemove = canManage && !summary.is_lead_department

    const run = async (action, message) => {
        setIsBusy(true)
        setError(null)
        const { error: actionError } = await action()
        setIsBusy(false)
        if (actionError) { setError(actionError); return }
        setMode(null)
        onChanged(message)
    }
    const signOff = (isSignedOff) => run(() => setDepartmentSignOff(projectId, summary.team_space_id, isSignedOff), isSignedOff ? `${summary.name}'s part is signed off.` : `${summary.name}'s sign-off was undone.`)
    const remove = () => run(() => removeProjectDepartment(projectId, summary.team_space_id), `${summary.name} was removed. Its tasks are now ${leadDepartmentName}'s.`)

    if (!canEdit && !canRemove) return null
    if (mode === "edit") {
        return <EditForm projectId={projectId} summary={summary} projectDueDate={projectDueDate} canChangeLead={canManage} onDone={(message) => { setMode(null); onChanged(message) }} onCancel={() => setMode(null)} />
    }
    if (mode === "remove") {
        const tasksLine = summary.total > 0 ? ` Its ${summary.total} task${summary.total === 1 ? "" : "s"} move to ${leadDepartmentName}.` : ""
        return <Confirm text={`Remove ${summary.name} from this project?${tasksLine} Its people keep any tasks assigned to them.`} actionLabel={isBusy ? "Removing…" : "Remove department"} isDanger isBusy={isBusy} onConfirm={remove} onCancel={() => setMode(null)} />
    }
    if (mode === "signoff") {
        return <Confirm text={`${summary.name} still has ${summary.remaining} open task${summary.remaining === 1 ? "" : "s"}. Sign its part off anyway? It will show as Done.`} actionLabel={isBusy ? "Signing off…" : "Sign off"} isBusy={isBusy} onConfirm={() => signOff(true)} onCancel={() => setMode(null)} />
    }

    // A finished part needs no sign-off; one with open tasks asks first
    const showSignOff = canSignOff && (summary.signedOff || summary.status !== "done")
    return (
        <div className="mt-md flex items-center gap-md flex-wrap">
            {showSignOff && (
                <button type="button" disabled={isBusy} onClick={() => (summary.signedOff ? signOff(false) : summary.remaining > 0 ? setMode("signoff") : signOff(true))} className={`${linkClass} text-accent-ink`}>
                    {summary.signedOff ? "Undo sign-off" : "Sign off this part"}
                </button>
            )}
            {canEdit && <button type="button" onClick={() => setMode("edit")} className={`${linkClass} text-soft`}>{canManage ? "Edit" : "Change due date"}</button>}
            {canRemove && <button type="button" onClick={() => setMode("remove")} className={`${linkClass} text-red-400`}>Remove</button>}
            {error && <p role="alert" className="w-full text-[11px] text-red-400">{error}</p>}
        </div>
    )
}
