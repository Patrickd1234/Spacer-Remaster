import { useEffect, useRef, useState } from "react"
import { useRole } from "../RoleContext"

const ADMIN_ROLES = ["admin", "super_admin", "superadmin"]

// Shared department picker for users in more than one department. Reads and
// sets the choice in RoleContext, so every screen using it stays in sync.
// variant: "page" (inline, Department page) | "sidebar" (full width, compact)
export default function DepartmentSwitcher({ variant = "page" }) {
    const { departments, activeDepartment, setActiveDepartment } = useRole()
    const [isOpen, setIsOpen] = useState(false)
    const [focusIndex, setFocusIndex] = useState(-1)
    const rootRef = useRef(null)
    const optionRefs = useRef([])

    // Close on outside click or Escape
    useEffect(() => {
        if (!isOpen) return undefined
        const handlePointer = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target)) setIsOpen(false)
        }
        const handleKey = (e) => {
            if (e.key === "Escape") setIsOpen(false)
        }
        document.addEventListener("mousedown", handlePointer)
        document.addEventListener("keydown", handleKey)
        return () => {
            document.removeEventListener("mousedown", handlePointer)
            document.removeEventListener("keydown", handleKey)
        }
    }, [isOpen])

    // Move keyboard focus to the highlighted option
    useEffect(() => {
        if (isOpen && focusIndex >= 0) optionRefs.current[focusIndex]?.focus()
    }, [isOpen, focusIndex])

    if (!departments || departments.length < 2) return null

    const activeId = activeDepartment ? String(activeDepartment.team_space_id) : null
    const activeIndex = Math.max(0, departments.findIndex((d) => String(d.team_space_id) === activeId))
    const isSidebar = variant === "sidebar"

    const open = () => {
        setFocusIndex(activeIndex)
        setIsOpen(true)
    }

    const choose = (dept) => {
        setActiveDepartment(dept.team_space_id)
        setIsOpen(false)
    }

    const handleListKeyDown = (e) => {
        if (e.key === "ArrowDown") {
            e.preventDefault()
            setFocusIndex((i) => (i + 1) % departments.length)
        } else if (e.key === "ArrowUp") {
            e.preventDefault()
            setFocusIndex((i) => (i - 1 + departments.length) % departments.length)
        } else if (e.key === "Tab") {
            setIsOpen(false)
        }
    }

    const handleButtonKeyDown = (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault()
            open()
        }
    }

    return (
        <div ref={rootRef} className={`relative ${isSidebar ? "w-full" : "inline-block"}`}>
            <button
                type="button"
                onClick={() => (isOpen ? setIsOpen(false) : open())}
                onKeyDown={handleButtonKeyDown}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                aria-label={`Department: ${activeDepartment?.name || "choose"}`}
                className={`group flex items-center gap-2 rounded-xl border bg-[#0F1115] text-left transition-all duration-200 cursor-pointer ${
                    isSidebar ? "w-full px-2.5 py-2" : "px-3 py-2 min-w-[220px]"
                } ${
                    isOpen
                        ? "border-[var(--primary-color)] ring-2 ring-[rgba(var(--primary-color-rgb),0.2)]"
                        : "border-[#2D3139] hover:border-[#424934] hover:bg-[#14161b]"
                }`}
            >
                <span className={`flex items-center justify-center rounded-lg bg-[rgba(var(--primary-color-rgb),0.12)] text-[var(--primary-color)] shrink-0 ${isSidebar ? "w-6 h-6" : "w-7 h-7"}`}>
                    <span className={`material-symbols-outlined ${isSidebar ? "text-[15px]" : "text-[17px]"}`} aria-hidden="true">corporate_fare</span>
                </span>
                <span className="flex-1 min-w-0">
                    {!isSidebar && <span className="block text-[10px] font-bold uppercase tracking-wider text-[#8c947b] leading-none mb-1">Department</span>}
                    <span className={`block truncate font-semibold text-white ${isSidebar ? "text-[12px]" : "text-sm"}`}>
                        {activeDepartment?.name || "Choose department"}
                    </span>
                </span>
                {ADMIN_ROLES.includes(activeDepartment?.role) && (
                    <span className="shrink-0 rounded-md bg-[rgba(var(--primary-color-rgb),0.12)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--primary-color)]">
                        Admin
                    </span>
                )}
                <span
                    className={`material-symbols-outlined text-[18px] text-[#8c947b] transition-transform duration-200 group-hover:text-white ${isOpen ? "rotate-180 text-white" : ""}`}
                    aria-hidden="true"
                >
                    expand_more
                </span>
            </button>

            {isOpen && (
                <div
                    role="listbox"
                    aria-label="Departments"
                    onKeyDown={handleListKeyDown}
                    className={`reports-fade absolute z-50 mt-2 rounded-xl border border-[#2D3139] bg-[#16191F] p-1.5 shadow-2xl shadow-black/40 ${
                        isSidebar ? "left-0 right-0" : "left-0 w-72"
                    }`}
                >
                    <p className="px-2.5 pt-1 pb-2 text-[10px] font-bold uppercase tracking-wider text-[#8c947b]">
                        Your departments ({departments.length})
                    </p>
                    <div className="max-h-64 overflow-y-auto space-y-0.5">
                        {departments.map((dept, index) => {
                            const isActive = String(dept.team_space_id) === activeId
                            const isAdminHere = ADMIN_ROLES.includes(dept.role)
                            return (
                                <button
                                    key={dept.team_space_id}
                                    ref={(el) => { optionRefs.current[index] = el }}
                                    type="button"
                                    role="option"
                                    aria-selected={isActive}
                                    onClick={() => choose(dept)}
                                    className={`w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--primary-color-rgb),0.4)] ${
                                        isActive
                                            ? "bg-[rgba(var(--primary-color-rgb),0.12)] text-[var(--primary-color)]"
                                            : "text-[#e0e5d0] hover:bg-white/5 focus:bg-white/5"
                                    }`}
                                >
                                    <span className={`material-symbols-outlined text-[17px] shrink-0 ${isActive ? "" : "text-[#8c947b]"}`} aria-hidden="true">
                                        {isActive ? "radio_button_checked" : "radio_button_unchecked"}
                                    </span>
                                    <span className="flex-1 min-w-0">
                                        <span className={`block truncate text-[13px] ${isActive ? "font-bold" : "font-medium"}`}>{dept.name}</span>
                                        <span className="block text-[11px] text-[#8c947b]">{isAdminHere ? "Admin" : "Member"}</span>
                                    </span>
                                    {isActive && <span className="material-symbols-outlined text-[17px] shrink-0" aria-hidden="true">check</span>}
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    )
}
