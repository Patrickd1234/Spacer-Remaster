import { useCallback, useEffect, useRef, useState } from "react"
import { useMatch, useNavigate } from "react-router-dom"
import { supabase, getSessionUser } from "../supabase"
import { useRole } from "../RoleContext"
import { createdToast, failedToast } from "../createDepartment"
import { DEPARTMENT_CREATED_EVENT, TASK_CREATED_EVENT, MEETING_SAVED_EVENT, OPEN_CREATE_EVENT } from "../appEvents"
import CreateDepartmentModal from "./CreateDepartmentModal"
import CreateProjectModal from "./CreateProjectModal"
import CreateTaskModal from "./CreateTaskModal"
import ScheduleMeetingModal from "../meetings/ScheduleMeetingModal"
import Toast from "../components/Toast"
import { fetchProjectDepartments } from "../crossDepartmentData"

// The open project, preselected in the task form's pickers: its department and,
// on a cross-department project, its departments. Null if it can't be loaded.
async function loadProjectContext(projectId) {
    const [{ data: project, error }, { data: departments }] = await Promise.all([
        supabase.from("project_spaces").select("id, team_space_id").eq("id", projectId).maybeSingle(),
        fetchProjectDepartments(projectId),
    ])
    if (error || !project) {
        if (error) console.error("Loading the open project for a new task failed:", error)
        return null
    }
    // Invited departments (not answered yet) can't hold tasks
    const working = departments.filter((d) => d.status !== "invited")
    return { projectId: project.id, teamSpaceId: project.team_space_id, departments: working.length > 1 ? working : [] }
}

const SUPER_ADMIN_ITEMS = [
    { action: "task", icon: "add_task", label: "Create a Task" },
    { action: "department", icon: "domain_add", label: "Create Department" },
    { action: "project", icon: "create_new_folder", label: "Create a Project" },
    { action: "meeting", icon: "event", label: "Schedule meeting" },
    { action: "invite", icon: "person_add", label: "Invite Member" },
]
const MEMBER_ITEMS = [
    { action: "task", icon: "add_task", label: "Create a Task" },
    { action: "meeting", icon: "event", label: "Schedule meeting" },
]

const PROJECT_ITEM = SUPER_ADMIN_ITEMS.find((item) => item.action === "project")

// Header "Create" dropdown, the app-wide place to create a task.
// Super admins: task, department, project, meeting, invite.
// Everyone else: a task or a meeting, plus a project for team leads and
// admins, who may create them in their departments.
export default function CreateMenu({ isSuperAdmin }) {
    const { canAnywhere, departments } = useRole()
    const navigate = useNavigate()
    // On a project page, "Create a Task" starts with that project picked
    const openProjectId = useMatch("/project_page/:project_id")?.params.project_id ?? null
    const [projectContext, setProjectContext] = useState(null)
    const menuRef = useRef(null)
    const [isOpen, setIsOpen] = useState(false)
    const [openModal, setOpenModal] = useState(null) // "department" | "project" | "task" | "meeting" | null
    const [organizationId, setOrganizationId] = useState(null)
    const [userId, setUserId] = useState(null)
    const [toast, setToast] = useState(null)
    const closeToast = useCallback(() => setToast(null), [])

    useEffect(() => {
        let active = true
        getSessionUser().then(async (user) => {
            if (!user) return
            const { data, error } = await supabase.from("users").select("organization_id").eq("id", user.id).maybeSingle()
            if (error) console.error("Loading organization failed:", error)
            if (!active) return
            setUserId(user.id)
            setOrganizationId(data?.organization_id ?? null)
        })
        return () => { active = false }
    }, [])

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (menuRef.current && !menuRef.current.contains(e.target)) setIsOpen(false)
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    const choose = async (action) => {
        setIsOpen(false)
        if (action === "invite") navigate("/department")
        else {
            // Elsewhere (or if the project can't be loaded) the form asks for department and project
            setProjectContext(action === "task" && openProjectId ? await loadProjectContext(openProjectId) : null)
            setOpenModal(action)
        }
    }
    // The command palette and the C shortcut open a form here
    useEffect(() => {
        const onRequest = (e) => {
            const action = e.detail?.action
            if (["task", "project", "meeting"].includes(action)) choose(action)
        }
        window.addEventListener(OPEN_CREATE_EVENT, onRequest)
        return () => window.removeEventListener(OPEN_CREATE_EVENT, onRequest)
    })

    // New tasks on a cross-department project go to your department there, else the lead one
    const projectDepartments = projectContext?.departments ?? []
    const defaultDepartmentId = projectDepartments.find((d) => departments.some((m) => String(m.team_space_id) === String(d.team_space_id)))?.team_space_id
        ?? projectDepartments[0]?.team_space_id ?? ""

    const handleCreated = ({ department, failedEmails }) => {
        setOpenModal(null)
        setToast(createdToast(failedEmails))
        window.dispatchEvent(new CustomEvent(DEPARTMENT_CREATED_EVENT, { detail: department }))
    }

    const handleTaskCreated = (task) => {
        setToast({ type: "success", title: "Task created", message: task?.title })
        window.dispatchEvent(new CustomEvent(TASK_CREATED_EVENT, { detail: task }))
    }

    const handleMeetingSaved = (meeting, { hasGuestListError }) => {
        setOpenModal(null)
        setToast(hasGuestListError
            ? { type: "error", title: "Meeting scheduled", message: "Some invitations didn't go through. Open the meeting to check its guest list." }
            : { type: "success", title: "Meeting scheduled", message: meeting?.title })
        window.dispatchEvent(new CustomEvent(MEETING_SAVED_EVENT, { detail: meeting }))
    }

    const items = isSuperAdmin
        ? SUPER_ADMIN_ITEMS
        : canAnywhere("project.create") ? [MEMBER_ITEMS[0], PROJECT_ITEM, ...MEMBER_ITEMS.slice(1)] : MEMBER_ITEMS

    return (
        <>
            <div className="relative" ref={menuRef}>
                <button
                    type="button"
                    onClick={() => setIsOpen((open) => !open)}
                    aria-haspopup="menu"
                    aria-expanded={isOpen}
                    aria-label="Create"
                    className="flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-lg bg-raised border border-line text-sm text-white hover:border-line-strong transition-colors cursor-pointer"
                >
                    <span className="material-symbols-outlined text-[18px] text-muted" aria-hidden="true">add_circle</span>
                    <span className="hidden sm:inline">Create</span>
                    <span className={`hidden sm:inline material-symbols-outlined text-[18px] text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden="true">expand_more</span>
                </button>
                {isOpen && (
                    <div role="menu" className="font-body-md absolute right-0 mt-2 w-52 bg-raised border border-line rounded-xl shadow-xl p-1 z-50">
                        {items.map(({ action, icon, label }) => (
                            <button
                                key={action}
                                type="button"
                                role="menuitem"
                                onClick={() => choose(action)}
                                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-soft hover:text-white hover:bg-surface2 transition-colors cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[18px] text-muted">{icon}</span>
                                {label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {openModal === "department" && (
                <CreateDepartmentModal
                    organizationId={organizationId}
                    canAssignPeople
                    onClose={() => setOpenModal(null)}
                    onCreated={handleCreated}
                    onFailed={() => setToast(failedToast)}
                />
            )}
            {openModal === "task" && (
                <CreateTaskModal
                    organizationId={organizationId}
                    initialProjectId={projectContext?.projectId}
                    initialTeamSpaceId={projectContext?.teamSpaceId}
                    departments={projectDepartments}
                    defaultDepartmentId={defaultDepartmentId}
                    onClose={() => setOpenModal(null)}
                    onCreated={handleTaskCreated}
                />
            )}
            {openModal === "project" && (
                // The form closes itself once everything saved; it stays open to show a
                // partly failed create. The sidebar hears PROJECT_CREATED_EVENT.
                <CreateProjectModal onClose={() => setOpenModal(null)} />
            )}
            {openModal === "meeting" && (
                <ScheduleMeetingModal
                    organizer={userId && organizationId ? { id: userId, organization_id: organizationId } : null}
                    onClose={() => setOpenModal(null)}
                    onSaved={handleMeetingSaved}
                />
            )}
            <Toast toast={toast} onClose={closeToast} />
        </>
    )
}
