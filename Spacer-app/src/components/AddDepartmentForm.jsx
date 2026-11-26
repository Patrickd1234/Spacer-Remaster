import { useEffect, useState } from "react"
import Select from "./Select"
import { useRole } from "../RoleContext"
import { addProjectDepartment, fetchOrganizationDepartments } from "../crossDepartmentData"
import { fetchDepartmentPeople } from "../departmentInvitesData"

const fieldClass = "w-full bg-canvas border border-line rounded-lg px-3 py-2 text-[13px] text-white focus:outline-none focus:border-accent-ink/50 transition-all"
const buttonClass = "px-md py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer"

// The form, once a department is picked: its lead (only where you can create
// projects; elsewhere it's invited and its own lead picks) and its due date
function AddForm({ choices, projectId, projectDueDate, onAdded, onCancel }) {
    const { can } = useRole()
    const [teamSpaceId, setTeamSpaceId] = useState(choices[0]?.id ?? "")
    const [people, setPeople] = useState(null)
    const [leadId, setLeadId] = useState("")
    const [dueDate, setDueDate] = useState(projectDueDate || "")
    const [error, setError] = useState(null)
    const [isSaving, setIsSaving] = useState(false)
    const isDirect = Boolean(teamSpaceId) && can("project.create", teamSpaceId)
    const name = choices.find((c) => String(c.id) === String(teamSpaceId))?.name || "The department"

    useEffect(() => {
        if (!isDirect) return undefined
        let active = true
        fetchDepartmentPeople(teamSpaceId).then(({ data }) => { if (active) setPeople(data) })
        return () => { active = false }
    }, [isDirect, teamSpaceId])

    const add = async () => {
        setIsSaving(true)
        setError(null)
        const { status, error: addError } = await addProjectDepartment({ projectId, teamSpaceId, leadId: isDirect ? leadId : null, dueDate })
        setIsSaving(false)
        if (addError) { setError(addError); return }
        onAdded(status === "invited" ? `${name} was invited. It joins once its lead accepts.` : `${name} joined the project.`)
    }

    return (
        <div className="rounded-xl border border-line bg-panel p-md space-y-sm">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-sm">
                <label className="space-y-1">
                    <span className="block text-[11px] text-muted">Department</span>
                    <Select className={fieldClass} value={teamSpaceId} onChange={(e) => { setTeamSpaceId(e.target.value); setLeadId(""); setPeople(null) }}>
                        {choices.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                    </Select>
                </label>
                <label className="space-y-1">
                    <span className="block text-[11px] text-muted">Department lead</span>
                    {isDirect ? (
                        <Select className={fieldClass} value={leadId} onChange={(e) => setLeadId(e.target.value)} disabled={people === null}>
                            <option value="">{people === null ? "Loading people…" : "No lead"}</option>
                            {(people || []).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                        </Select>
                    ) : (
                        <p className="text-[11px] text-soft py-2">Invited: their lead picks it when they accept.</p>
                    )}
                </label>
                <label className="space-y-1">
                    <span className="block text-[11px] text-muted">{isDirect ? "Due" : "Proposed due date"}</span>
                    <input type="date" className={`${fieldClass} [color-scheme:dark]`} value={dueDate} max={projectDueDate || undefined} onChange={(e) => setDueDate(e.target.value)} />
                </label>
            </div>
            {error && <p role="alert" className="text-[11px] text-red-400">{error}</p>}
            <div className="flex gap-sm justify-end">
                <button type="button" onClick={onCancel} disabled={isSaving} className={`${buttonClass} border border-line text-soft hover:text-white hover:bg-line`}>Cancel</button>
                <button type="button" onClick={add} disabled={isSaving || !teamSpaceId} className={`${buttonClass} bg-accent text-on-accent hover:bg-accent-hover`}>
                    {isSaving ? "Adding…" : isDirect ? "Add department" : "Send invite"}
                </button>
            </div>
        </div>
    )
}

/**
 * Project managers bring another department onto an existing project.
 * `onProjectIds`: departments already on it (joined or invited, lead included).
 */
export default function AddDepartmentForm({ projectId, projectDueDate, onProjectIds, onAdded }) {
    const [isOpen, setIsOpen] = useState(false)
    const [departments, setDepartments] = useState(null)
    useEffect(() => {
        if (!isOpen || departments) return undefined
        let active = true
        fetchOrganizationDepartments().then(({ data }) => { if (active) setDepartments(data) })
        return () => { active = false }
    }, [isOpen, departments])

    const taken = new Set(onProjectIds.map(String))
    const choices = (departments || []).filter((d) => !taken.has(String(d.id)))

    if (!isOpen) {
        return (
            <button type="button" onClick={() => setIsOpen(true)} className="w-full py-2.5 rounded-xl border border-dashed border-line text-accent-ink text-xs font-bold hover:bg-accent/5 hover:border-accent-ink/50 transition-colors cursor-pointer">
                + Add a department
            </button>
        )
    }
    if (departments === null) return <p className="text-xs text-muted">Loading departments…</p>
    if (choices.length === 0) {
        return (
            <p className="text-xs text-muted">
                Every department of your organization is already on this project. <button type="button" onClick={() => setIsOpen(false)} className="underline cursor-pointer">Close</button>
            </p>
        )
    }
    return <AddForm choices={choices} projectId={projectId} projectDueDate={projectDueDate} onAdded={(message) => { setIsOpen(false); onAdded(message) }} onCancel={() => setIsOpen(false)} />
}
