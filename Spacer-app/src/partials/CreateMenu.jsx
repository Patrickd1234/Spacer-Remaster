import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase, getSessionUser } from "../supabase"
import { useRole } from "../RoleContext"
import { createdToast, failedToast } from "../createDepartment"
import { DEPARTMENT_CREATED_EVENT, TASK_CREATED_EVENT, MEETING_SAVED_EVENT } from "../appEvents"
import CreateDepartmentModal from "./CreateDepartmentModal"
import CreateProjectModal from "./CreateProjectModal"
import CreateTaskModal from "./CreateTaskModal"
import ScheduleMeetingModal from "../meetings/ScheduleMeetingModal"
import Toast from "../components/Toast"

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
    const { canAnywhere } = useRole()
    const navigate = useNavigate()
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

    const choose = (action) => {
        setIsOpen(false)
        if (action === "invite") navigate("/department")
        else setOpenModal(action)
    }

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
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-raised border border-line text-sm text-white hover:border-line-strong transition-colors cursor-pointer"
                >
                    <span className="material-symbols-outlined text-[18px] text-muted">add_circle</span>
                    Create
                    <span className={`material-symbols-outlined text-[18px] text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}>expand_more</span>
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
                <CreateTaskModal organizationId={organizationId} onClose={() => setOpenModal(null)} onCreated={handleTaskCreated} />
            )}
            {openModal === "project" && (
                <CreateProjectModal onClose={() => setOpenModal(null)} onCreated={() => setOpenModal(null)} />
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
