import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase, getSessionUser } from "../supabase"
import { createdToast, failedToast } from "../createDepartment"
import { DEPARTMENT_CREATED_EVENT, TASK_CREATED_EVENT } from "../appEvents"
import CreateDepartmentModal from "./CreateDepartmentModal"
import CreateProjectModal from "./CreateProjectModal"
import CreateTaskModal from "./CreateTaskModal"
import Toast from "../components/Toast"

const SUPER_ADMIN_ITEMS = [
    { action: "department", icon: "domain_add", label: "Create Department" },
    { action: "project", icon: "create_new_folder", label: "Create a Project" },
    { action: "invite", icon: "person_add", label: "Invite Member" },
]
const MEMBER_ITEMS = [
    { action: "task", icon: "add_task", label: "Create a Task" },
    { action: "meeting", icon: "event", label: "Schedule meeting" },
]

// Header "Create" dropdown. Super admins: department, project, invite.
// Everyone else: a task, or a meeting (scheduled on the calendar page).
export default function CreateMenu({ isSuperAdmin }) {
    const navigate = useNavigate()
    const menuRef = useRef(null)
    const [isOpen, setIsOpen] = useState(false)
    const [openModal, setOpenModal] = useState(null) // "department" | "project" | "task" | null
    const [organizationId, setOrganizationId] = useState(null)
    const [toast, setToast] = useState(null)
    const closeToast = useCallback(() => setToast(null), [])

    useEffect(() => {
        let active = true
        getSessionUser().then(async (user) => {
            if (!user) return
            const { data, error } = await supabase.from("users").select("organization_id").eq("id", user.id).maybeSingle()
            if (error) console.error("Loading organization failed:", error)
            if (active) setOrganizationId(data?.organization_id ?? null)
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
        else if (action === "meeting") navigate("/calendar")
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

    const items = isSuperAdmin ? SUPER_ADMIN_ITEMS : MEMBER_ITEMS

    return (
        <>
            <div className="relative" ref={menuRef}>
                <button
                    type="button"
                    onClick={() => setIsOpen((open) => !open)}
                    aria-haspopup="menu"
                    aria-expanded={isOpen}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#191c21] border border-[#2D3139] text-sm text-white hover:border-[#3d424d] transition-colors cursor-pointer"
                >
                    <span className="material-symbols-outlined text-[18px] text-[#8c947b]">add_circle</span>
                    Create
                    <span className={`material-symbols-outlined text-[18px] text-[#8c947b] transition-transform ${isOpen ? "rotate-180" : ""}`}>expand_more</span>
                </button>
                {isOpen && (
                    <div role="menu" className="absolute right-0 mt-2 w-52 bg-[#191c21] border border-[#2D3139] rounded-xl shadow-xl p-1 z-50">
                        {items.map(({ action, icon, label }) => (
                            <button
                                key={action}
                                type="button"
                                role="menuitem"
                                onClick={() => choose(action)}
                                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-[#c2caae] hover:text-white hover:bg-[#252a33] transition-colors cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[18px] text-[#8c947b]">{icon}</span>
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
            <Toast toast={toast} onClose={closeToast} />
        </>
    )
}
