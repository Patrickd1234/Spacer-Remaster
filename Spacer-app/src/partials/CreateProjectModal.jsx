import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "react-router-dom"
import { getSessionUser } from "../supabase"
import Select from "../components/Select"
import { useRole } from "../RoleContext"
import { addableDepartments, departmentLeadOptions, applyDepartmentChange, resolveDepartmentLead } from "../projectDepartments"
import {
    normalizeDepartments, newProjectProblem, createProjectArgs, applyDeadlineChange, departmentPeople, DESCRIPTION_MAX,
} from "../newProject"
import { createProject, fetchOrganizationDepartments } from "../crossDepartmentData"
import { announceProjectCreated } from "../appEvents"
import ProjectDepartmentCard from "./ProjectDepartmentCard"
import useOrganizationPeople, { asLeadRows } from "./createProject/useOrganizationPeople"

const fieldClass = "w-full bg-canvas border border-line rounded-lg px-3 py-2 text-[13px] text-white focus:outline-none focus:border-accent-ink/50 transition-all placeholder:text-muted/50"
const nameOfTeam = (teamSpaces, id) => teamSpaces.find((t) => String(t.id) === String(id))?.name || "Department"
const Required = () => <span className="text-red-400" aria-hidden="true">*</span>
const FieldLabel = ({ htmlFor, children }) => <label htmlFor={htmlFor} className="block text-[12px] text-soft mb-1.5">{children}</label>
const SectionTitle = ({ icon, title, subtitle }) => (
    <div className="flex items-start gap-2 mb-md">
        <span className="material-symbols-outlined text-[18px] text-accent-ink mt-px" aria-hidden="true">{icon}</span>
        <div>
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            {subtitle && <p className="text-[11px] text-muted mt-0.5">{subtitle}</p>}
        </div>
    </div>
)

// Every department of the organization, the ones the user may create projects
// in (the others can only be invited), and who the user is
function useOrganizationDepartments() {
    const { can } = useRole()
    const [teamSpaces, setTeamSpaces] = useState([])
    const [sessionUserId, setSessionUserId] = useState(null)
    useEffect(() => {
        let active = true
        Promise.all([getSessionUser(), fetchOrganizationDepartments()]).then(([user, { data }]) => {
            if (!active) return
            setSessionUserId(user?.id ?? null)
            setTeamSpaces(data)
        })
        return () => { active = false }
    }, [])
    return { teamSpaces, creatableTeamSpaces: teamSpaces.filter((t) => can("project.create", t.id)), sessionUserId }
}

// Create Project (design doc "Project Creation & Cross-Department Workflow",
// screen 1). Project details on the left; on the right the departments, each
// with its lead, due date and the people picked to work on it. Only those
// people (plus the departments' managers) can open the project
// (20261128090000_project_member_access). The first department leads; one the
// user can't create projects in is invited and joins once its lead accepts.
// Everything is saved in one transaction (create_project()), then the new
// project opens.
export default function CreateProjectModal({ onClose }) {
    const navigate = useNavigate()
    const { teamSpaces, creatableTeamSpaces, sessionUserId } = useOrganizationDepartments()
    const people = useOrganizationPeople()
    const [name, setName] = useState("")
    const [description, setDescription] = useState("")
    const [deadline, setDeadline] = useState("")
    const [pickedProjectLeadId, setProjectLeadId] = useState("")
    const [picked, setPicked] = useState([])
    const [expandedId, setExpandedId] = useState(null)
    const [error, setError] = useState(null)
    const [saving, setSaving] = useState(false)
    const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false)
    const dialogRef = useRef(null)

    const creatableIds = new Set(creatableTeamSpaces.map((t) => String(t.id)))
    const leadRows = asLeadRows(people.memberships, people.usersById)
    const leadChoices = (teamId) => departmentLeadOptions(leadRows, teamId)
    const departments = normalizeDepartments(picked, creatableTeamSpaces, teamSpaces).map((d, index) => {
        const isInvite = index > 0 && !creatableIds.has(String(d.teamSpaceId))
        const choices = leadChoices(d.teamSpaceId)
        return {
            ...d,
            isInvite,
            leadId: isInvite ? "" : resolveDepartmentLead(d.leadId, choices),
            hasPeople: choices.options.length > 0,
        }
    })
    const pickedIds = departments.map((d) => d.teamSpaceId)
    const leadTeamId = pickedIds[0] ?? ""
    const nameOf = (id) => nameOfTeam(teamSpaces, id)
    const shownExpandedId = expandedId ?? leadTeamId

    // Project lead: someone in the lead department; you by default, else the first person
    const projectLeads = leadChoices(leadTeamId).options
    const projectLeadId = projectLeads.some((u) => u.id === pickedProjectLeadId)
        ? pickedProjectLeadId
        : projectLeads.some((u) => u.id === sessionUserId) ? sessionUserId : projectLeads[0]?.id ?? ""

    const isDirty = Boolean(name.trim() || description.trim() || deadline || picked.length > 0)
    const requestClose = () => {
        if (saving) return
        if (isDirty) setIsConfirmingDiscard(true)
        else onClose()
    }
    // Focus starts on the name and goes back where it was when the form closes
    useEffect(() => {
        const opener = document.activeElement
        dialogRef.current?.querySelector("#proj-name")?.focus()
        return () => { if (opener instanceof HTMLElement) opener.focus() }
    }, [])
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape") { requestClose(); return }
            if (e.key !== "Tab" || !dialogRef.current) return
            // Keep Tab inside the dialog
            const focusable = [...dialogRef.current.querySelectorAll("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex='-1'])")]
            if (focusable.length === 0) return
            const first = focusable[0]
            const last = focusable[focusable.length - 1]
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
        }
        document.addEventListener("keydown", onKey)
        return () => document.removeEventListener("keydown", onKey)
    })

    const update = (index, changes) => setPicked(departments.map((d, i) => (i === index ? applyDepartmentChange(d, changes) : d)))
    const remove = (index) => setPicked(departments.filter((_, i) => i !== index))
    // The lead department must be one you can create projects in; the others can be any
    const choicesFor = (index, teamId) => addableDepartments(index === 0 ? creatableTeamSpaces : teamSpaces, leadTeamId, pickedIds.slice(1), teamId)
    const nextDepartment = addableDepartments(teamSpaces, leadTeamId, pickedIds.slice(1))[0]
    const addDepartment = () => {
        if (!nextDepartment) return
        setPicked([...departments, { teamSpaceId: nextDepartment.id, dueDate: deadline, memberIds: [] }])
        setExpandedId(nextDepartment.id)
    }
    // Department dates that followed the deadline (or no longer fit) move with it
    const changeDeadline = (value) => {
        setPicked(applyDeadlineChange(departments, deadline, value))
        setDeadline(value)
    }

    const submit = async () => {
        setError(null)
        const problem = newProjectProblem({ name, deadline, projectLeadId, description, departments, nameOf })
        if (problem) { setError(problem); return }
        setSaving(true)
        const { data, error: createError } = await createProject(createProjectArgs({ name, deadline, projectLeadId, description, departments }))
        setSaving(false)
        if (createError) { setError(createError); return }
        // Invited departments aren't on it until they accept
        announceProjectCreated(data.project, departments.filter((d, i) => i > 0 && !d.isInvite).map((d) => d.teamSpaceId))
        onClose()
        if (data.project?.id) navigate(`/project_page/${data.project.id}`)
    }

    const invitedNames = departments.filter((d) => d.isInvite).map((d) => nameOf(d.teamSpaceId))

    const projectDetails = (
        <section aria-labelledby="create-project-details">
            <SectionTitle icon="folder_open" title={<span id="create-project-details">Project details</span>} />
            <div className="space-y-md">
                <div>
                    <FieldLabel htmlFor="proj-name">Project name <Required /></FieldLabel>
                    <input id="proj-name" className={fieldClass} placeholder="e.g. Q4 Customer Onboarding Revamp" type="text" maxLength={200} value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                    <FieldLabel htmlFor="proj-lead">Project lead <Required /></FieldLabel>
                    <Select id="proj-lead" className={fieldClass} value={projectLeadId} onChange={(e) => setProjectLeadId(e.target.value)}>
                        {projectLeads.length === 0 && <option value="">{people.isLoading ? "Loading people…" : `No one in ${nameOf(leadTeamId)} yet`}</option>}
                        {projectLeads.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                    </Select>
                    <p className="text-[11px] text-muted mt-1.5">From {nameOf(leadTeamId)}, the lead department.</p>
                </div>
                <div>
                    <FieldLabel htmlFor="deadline">Overall deadline <Required /></FieldLabel>
                    <input id="deadline" className={`${fieldClass} [color-scheme:dark]`} type="date" value={deadline} onChange={(e) => changeDeadline(e.target.value)} />
                    <p className="text-[11px] text-muted mt-1.5">All department due dates must be on or before this date.</p>
                </div>
                <div>
                    <FieldLabel htmlFor="proj-description">Description <span className="text-muted">(optional)</span></FieldLabel>
                    <textarea
                        id="proj-description"
                        rows={4}
                        maxLength={DESCRIPTION_MAX}
                        className={`${fieldClass} resize-none`}
                        placeholder="What is this project for?"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        aria-describedby="proj-description-count"
                    />
                    <p id="proj-description-count" className="text-[11px] text-muted text-right mt-1">{description.length}/{DESCRIPTION_MAX}</p>
                </div>
            </div>
        </section>
    )

    const departmentList = (
        <section aria-labelledby="create-project-departments">
            <SectionTitle
                icon="stacks"
                title={<span id="create-project-departments">Departments ({departments.length})</span>}
                subtitle="Add departments, set a lead, and select the members who will work on this project."
            />
            {people.error && <p role="alert" className="text-[11px] text-red-400 mb-sm">{people.error}</p>}
            <div className="space-y-sm">
                {departments.map((dept, index) => (
                    <ProjectDepartmentCard
                        key={`${index}-${dept.teamSpaceId}`}
                        department={dept}
                        name={nameOf(dept.teamSpaceId)}
                        // Its own pick plus any department not already on the project
                        choices={choicesFor(index, dept.teamSpaceId)}
                        leadOptions={leadChoices(dept.teamSpaceId).options}
                        people={departmentPeople(people.memberships, people.usersById, dept.teamSpaceId)}
                        isLoadingPeople={people.isLoading}
                        isLead={index === 0}
                        isExpanded={String(shownExpandedId) === String(dept.teamSpaceId)}
                        maxDate={deadline}
                        onToggle={() => setExpandedId(String(shownExpandedId) === String(dept.teamSpaceId) ? "" : dept.teamSpaceId)}
                        onChange={(changes) => {
                            update(index, changes)
                            if ("teamSpaceId" in changes) setExpandedId(changes.teamSpaceId)
                        }}
                        onRemove={() => remove(index)}
                    />
                ))}
                {departments.length === 0 && (
                    <p className="text-[12px] text-muted rounded-xl border border-line bg-panel p-md">
                        You can only create projects in a department where you&apos;re a team lead or admin.
                    </p>
                )}
                <button
                    type="button"
                    onClick={addDepartment}
                    disabled={!nextDepartment}
                    title={nextDepartment ? "Add a department that will work on this project" : "Every department is already on it"}
                    className="w-full py-2.5 rounded-xl border border-line text-accent-ink text-[12px] font-semibold hover:bg-accent/5 hover:border-accent-ink/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-1"
                >
                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">add</span>
                    Add department
                </button>
                {invitedNames.length > 0 && (
                    <p className="text-[11px] text-muted">{invitedNames.join(", ")} will be invited and join once their lead accepts.</p>
                )}
            </div>
        </section>
    )

    const footer = isConfirmingDiscard ? (
        <div className="px-lg py-md border-t border-line flex items-center gap-md flex-wrap">
            <p className="flex-1 text-[12px] text-soft">Discard this project? What you&apos;ve entered won&apos;t be saved.</p>
            <button type="button" onClick={() => setIsConfirmingDiscard(false)} className="px-md py-2 border border-line rounded-lg text-xs font-semibold text-soft hover:text-white hover:bg-line transition-all cursor-pointer">Keep editing</button>
            <button type="button" onClick={onClose} className="px-md py-2 border border-red-400/60 rounded-lg text-xs font-semibold text-red-400 hover:bg-red-500/10 transition-all cursor-pointer">Discard</button>
        </div>
    ) : (
        <div className="px-lg py-md border-t border-line flex items-center gap-md flex-wrap">
            <p className="flex-1 min-w-[220px] flex items-center gap-2 text-[12px] text-muted">
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">info</span>
                Only selected members from the added departments will be able to see and work on this project.
            </p>
            <button type="button" className="px-md py-2 border border-line rounded-lg text-xs font-semibold text-soft hover:text-white hover:bg-line transition-all cursor-pointer" onClick={requestClose}>
                Cancel
            </button>
            <button type="button" className="px-md py-2 bg-accent text-on-accent rounded-lg text-xs font-bold hover:bg-accent-hover transition-all disabled:opacity-50 cursor-pointer" onClick={submit} disabled={saving || departments.length === 0}>
                {saving ? "Creating…" : "Create Project"}
            </button>
        </div>
    )

    // Opened on <body>, above everything: from the header (a lower layer than the
    // sidebar) it would otherwise sit under the sidebar
    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-md bg-black/60 backdrop-blur-sm" onClick={requestClose}>
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="create-project-title" className="bg-raised rounded-xl border border-line w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <div className="px-lg pt-lg pb-md flex justify-between items-start border-b border-line/40">
                    <div>
                        <h2 id="create-project-title" className="text-xl text-white font-bold">Create Project</h2>
                        <p className="text-[12px] text-muted mt-1">Set up a cross-department project, assign a lead, add members, and define timelines.</p>
                    </div>
                    <button type="button" aria-label="Close" className="text-muted hover:text-white transition-colors cursor-pointer" onClick={requestClose}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                <div className="overflow-y-auto grid grid-cols-1 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
                    <div className="p-lg md:border-r border-line/40">{projectDetails}</div>
                    <div className="p-lg">{departmentList}</div>
                </div>

                {error && <p role="alert" className="px-lg pt-sm text-[12px] text-red-400">{error}</p>}
                {footer}
            </div>
        </div>,
        document.body
    )
}
