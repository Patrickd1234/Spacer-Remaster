import { useState } from "react"
import { Link } from "react-router-dom"

// Building blocks for WorkspaceSidebar

const ACTIVE_ITEM ="bg-primary-accent text-[#0F1115] font-semibold"
const INACTIVE_ITEM = "text-[#8c947b] hover:text-white hover:bg-[#2D3139]"
const ROW = "rounded-lg flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors w-full text-left"
// Nested items (Directory, projects, departments): tinted background + accent text
const SUB_ACTIVE = "bg-primary-accent-dim text-primary-accent font-semibold"
const SUB_INACTIVE = "text-[#8c947b] hover:text-white hover:bg-[#2D3139]"

export function NavLink({ to, icon, label, isActive, isExpanded, badge = 0 }) {
    return (
        <Link to={to} title={isExpanded ? undefined : label} className={`${ROW} ${isActive ? ACTIVE_ITEM : INACTIVE_ITEM}`}>
            <span className="material-symbols-outlined text-[20px]">{icon}</span>
            {isExpanded && <span className="font-medium text-[14px] flex-1 truncate">{label}</span>}
            {isExpanded && badge > 0 && <Badge count={badge} />}
        </Link>
    )
}

export function NavButton({ icon, label, onClick, isActive = false, isExpanded, badge = 0 }) {
    return (
        <button type="button" onClick={onClick} title={isExpanded ? undefined : label} aria-pressed={isActive} className={`${ROW} ${isActive ? ACTIVE_ITEM : INACTIVE_ITEM} relative`}>
            <span className="material-symbols-outlined text-[20px]">{icon}</span>
            {isExpanded && <span className="font-medium text-[14px] flex-1 truncate">{label}</span>}
            {badge > 0 && (isExpanded
                ? <Badge count={badge} />
                : <span className="absolute top-1.5 left-8 w-2 h-2 rounded-full bg-red-500" />)}
        </button>
    )
}

function Badge({ count }) {
    return (
        <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {count > 99 ? "99+" : count}
        </span>
    )
}

// Collapsible group; children only render while the sidebar is expanded
export function NavSection({ icon, label, isExpanded, defaultOpen = false, action = null, children }) {
    const [isOpen, setIsOpen] = useState(defaultOpen)
    return (
        <div>
            <div className={`${ROW} ${INACTIVE_ITEM} group`} onClick={() => setIsOpen((open) => !open)} role="button" aria-expanded={isOpen} title={isExpanded ? undefined : label}>
                <span className="material-symbols-outlined text-[20px]">{icon}</span>
                {isExpanded && (
                    <>
                        <span className="font-medium text-[14px] flex-1 truncate">{label}</span>
                        {action}
                        <span className={`material-symbols-outlined text-[18px] transition-transform ${isOpen ? "rotate-180" : ""}`}>arrow_drop_down</span>
                    </>
                )}
            </div>
            {isExpanded && isOpen && (
                <div className="ml-5 pl-3 border-l border-[#2D3139] mt-1 space-y-0.5">{children}</div>
            )}
        </div>
    )
}

export function SubLink({ to, label, isActive }) {
    return (
        <Link to={to} aria-current={isActive ? "page" : undefined} className={`block rounded-md px-3 py-1.5 text-[13px] truncate transition-colors ${isActive ? SUB_ACTIVE : SUB_INACTIVE}`}>
            {label}
        </Link>
    )
}

export function EmptyNote({ children }) {
    return <p className="px-3 py-1.5 text-[12px] text-[#8c947b] italic">{children}</p>
}

// A department row that opens its projects; the name itself opens the department
export function TeamSpaceGroup({ name, projects, onOpenDepartment, activePath, isActive = false }) {
    const [isOpen, setIsOpen] = useState(false)
    return (
        <div>
            <div className={`flex items-center rounded-md transition-colors ${isActive ? "bg-primary-accent-dim" : "hover:bg-[#2D3139]"}`}>
                <button type="button" onClick={onOpenDepartment} aria-current={isActive ? "page" : undefined} className={`flex-1 min-w-0 text-left px-3 py-1.5 text-[13px] truncate cursor-pointer ${isActive ? "text-primary-accent font-semibold" : "text-[#8c947b] hover:text-white"}`}>
                    {name}
                </button>
                <button type="button" onClick={() => setIsOpen((open) => !open)} aria-label={`${isOpen ? "Hide" : "Show"} ${name} projects`} aria-expanded={isOpen} className="px-1.5 text-[#8c947b] hover:text-white cursor-pointer">
                    <span className={`material-symbols-outlined text-[16px] transition-transform ${isOpen ? "rotate-90" : ""}`}>chevron_right</span>
                </button>
            </div>
            {isOpen && (
                <div className="ml-3 pl-3 border-l border-[#2D3139] space-y-0.5">
                    {projects.length === 0
                        ? <EmptyNote>No projects yet</EmptyNote>
                        : projects.map((p) => <SubLink key={p.id} to={`/project_page/${p.id}`} label={p.name} isActive={activePath === `/project_page/${p.id}`} />)}
                </div>
            )}
        </div>
    )
}
