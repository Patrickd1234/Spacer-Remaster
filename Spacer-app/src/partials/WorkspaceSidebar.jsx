import { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { supabase, getSessionUser } from "../supabase"
import { useRole } from "../RoleContext"
import CreateProjectModal from "./CreateProjectModal"
import SidebarProfile from "./SidebarProfile"
import { NavLink, NavButton, NavSection, SubLink, EmptyNote, TeamSpaceGroup } from "./SidebarNav"
import { mergeProjects } from "./projectMemberships"

// Sidebar for every role. Super admins see all of the organization's departments
// under Team Spaces; everyone else sees the departments they belong to.
// `unreadMessages` / `isMessagesOpen` / `onOpenMessages` come from SidebarRouter, which owns the chat window.
export default function WorkspaceSidebar({ userEmail = "", userData = null, onCollapsedChange, unreadMessages = 0, isMessagesOpen = false, onOpenMessages }) {
    const navigate = useNavigate()
    const location = useLocation()
    const { pathname } = location
    const { departments, setActiveDepartment, isSuperAdmin, activeDepartment, orgDepartmentId } = useRole()
    const [collapsed, setCollapsed] = useState(false)
    const [hovered, setHovered] = useState(false)
    const [projects, setProjects] = useState([])
    const [orgTeams, setOrgTeams] = useState([])
    const [dbUser, setDbUser] = useState(null)
    const [orgName, setOrgName] = useState("")
    const [showCreateModal, setShowCreateModal] = useState(false)
    const isExpanded = !collapsed || hovered

    const teams = isSuperAdmin ? orgTeams : departments.map((d) => ({ id: d.team_space_id, name: d.name }))
    const teamKey = teams.map((t) => t.id).join(",")
    const home = isSuperAdmin ? { icon: "domain", label: "Organization" } : { icon: "person", label: "My Space" }

    // Only projects in the user's departments (super admins: every department).
    // Being added to a project directly doesn't list it without its department.
    useEffect(() => {
        let active = true
        const load = async () => {
            const ids = teamKey ? teamKey.split(",") : []
            if (ids.length === 0) {
                if (active) setProjects([])
                return
            }
            const { data, error } = await supabase.from("project_spaces").select("id, name, team_space_id").in("team_space_id", ids)
            if (error) console.error("Loading department projects failed:", error)
            if (active) setProjects(error ? [] : (data || []))
        }
        load()
        return () => { active = false }
    }, [teamKey])

    useEffect(() => {
        let active = true
        const load = async () => {
            const user = await getSessionUser()
            if (!user) return
            const { data } = await supabase.from("users").select("name, email, organization_id").eq("id", user.id).maybeSingle()
            if (!active || !data) return
            setDbUser(data)
            if (!data.organization_id) return
            const { data: org, error } = await supabase.from("organizations").select("name").eq("id", data.organization_id).maybeSingle()
            if (error) console.warn("organizations fetch error:", error)
            if (active) setOrgName(org?.name || "")
        }
        load()
        return () => { active = false }
    }, [])

    // Super admins: every department in the organization
    const orgId = dbUser?.organization_id
    useEffect(() => {
        if (!isSuperAdmin || !orgId) return
        let active = true
        supabase.from("team_spaces").select("id, name").eq("organization_id", orgId).order("name")
            .then(({ data, error }) => {
                if (error) console.error("Loading departments failed:", error)
                if (active) setOrgTeams(data || [])
            })
        return () => { active = false }
    }, [isSuperAdmin, orgId])

    const setCollapsedState = (next) => {
        setCollapsed(next)
        setHovered(false)
        onCollapsedChange?.(next)
    }

    // Members switch their active department; the super admin view reads the id from route state
    const openDepartment = (teamSpaceId) => {
        if (!isSuperAdmin) setActiveDepartment(teamSpaceId)
        navigate("/department", { state: { teamSpaceId } })
    }

    // Department pages: a department row is highlighted when it was opened from the sidebar
    // (route state), otherwise Directory is. The id shown follows the page's own switcher.
    const isDepartmentPage = pathname === "/department"
    const openedDepartment = isDepartmentPage && location.state?.teamSpaceId != null
    const shownDepartmentId = String((isSuperAdmin ? orgDepartmentId : activeDepartment?.team_space_id) ?? location.state?.teamSpaceId ?? "")

    const displayName = dbUser?.name || userData?.full_name || localStorage.getItem("userEmail")?.split("@")[0] || userEmail?.split("@")[0] || "User"
    const displayEmail = dbUser?.email || userData?.email || localStorage.getItem("userEmail") || userEmail || ""

    return (
        <>
            <aside
                className={`fixed left-0 top-0 h-full ${isExpanded ? "w-[260px]" : "w-[72px]"} border-r border-[#2D3139] bg-[#1C1F26] flex flex-col pt-5 pb-3 z-50 transition-all duration-300 ease-out overflow-hidden`}
                onMouseEnter={() => { if (collapsed) setHovered(true) }}
                onMouseLeave={() => setHovered(false)}
                onClick={() => { if (collapsed && hovered) setCollapsedState(false) }}
            >
                <div className={`px-4 pb-4 mb-3 border-b border-[#2D3139] flex items-center ${isExpanded ? "justify-between" : "justify-center"}`}>
                    {isExpanded && (
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-md bg-primary-accent-dim text-primary-accent flex items-center justify-center font-bold text-[13px] shrink-0">
                                {(orgName || "S").charAt(0).toUpperCase()}
                            </div>
                            <span className="font-semibold text-[14px] text-white truncate">{orgName || "Spacers"}</span>
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setCollapsedState(!collapsed) }}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-[#2D3139] text-[#8c947b] hover:text-white transition-colors cursor-pointer"
                        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    >
                        <span className="material-symbols-outlined text-[16px]">{collapsed ? "left_panel_open" : "left_panel_close"}</span>
                    </button>
                </div>

                <nav className="flex-1 overflow-y-auto px-3 space-y-1 scrollbar-thin">
                    <NavLink to="/" icon={home.icon} label={home.label} isActive={pathname === "/"} isExpanded={isExpanded} />

                    <NavSection icon="workspaces" label="General Space" isExpanded={isExpanded}>
                        <SubLink to="/department" label="Directory" isActive={isDepartmentPage && !openedDepartment} />
                        <SubLink to="/tasks" label="All Tasks" isActive={pathname === "/tasks"} />
                    </NavSection>

                    <NavSection icon="groups" label="Team Spaces" isExpanded={isExpanded}>
                        {teams.length === 0
                            ? <EmptyNote>{isSuperAdmin ? "No departments yet" : "Not in a department yet"}</EmptyNote>
                            : teams.map((t) => (
                                <TeamSpaceGroup
                                    key={t.id}
                                    name={t.name}
                                    projects={projects.filter((p) => String(p.team_space_id) === String(t.id))}
                                    onOpenDepartment={() => openDepartment(t.id)}
                                    isActive={openedDepartment && String(t.id) === shownDepartmentId}
                                    activePath={pathname}
                                />
                            ))}
                    </NavSection>

                    <NavSection
                        icon="folder"
                        label="Projects"
                        isExpanded={isExpanded}
                        defaultOpen={pathname.startsWith("/project_page")}
                        action={(
                            <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => { e.stopPropagation(); setShowCreateModal(true) }}
                                onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setShowCreateModal(true) } }}
                                aria-label="Create new project"
                                className="material-symbols-outlined text-[18px] rounded-md hover:text-white hover:bg-white/5"
                            >
                                add
                            </span>
                        )}
                    >
                        {projects.length === 0
                            ? <EmptyNote>No projects yet</EmptyNote>
                            : projects.map((p) => <SubLink key={p.id} to={`/project_page/${p.id}`} label={p.name} isActive={pathname === `/project_page/${p.id}`} />)}
                    </NavSection>

                    <NavButton icon="chat" label="Messages" onClick={onOpenMessages} isActive={isMessagesOpen} isExpanded={isExpanded} badge={unreadMessages} />
                    <NavLink to="/calendar" icon="calendar_today" label="Calendar" isActive={pathname === "/calendar"} isExpanded={isExpanded} />
                    <NavLink to="/reports" icon="bar_chart" label="Reports" isActive={pathname === "/reports"} isExpanded={isExpanded} />
                </nav>

                <div className="px-3 pt-2 pb-3">
                    <NavLink to="/settings" icon="settings" label="Settings" isActive={pathname === "/settings"} isExpanded={isExpanded} />
                </div>

                <SidebarProfile name={displayName} email={displayEmail} isExpanded={isExpanded} />
            </aside>

            {showCreateModal && (
                <CreateProjectModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={(newProject) => {
                        // Only list it if it belongs to one of the user's departments
                        if (teams.some((t) => String(t.id) === String(newProject?.team_space_id))) {
                            setProjects((prev) => mergeProjects(prev, [newProject]))
                        }
                    }}
                />
            )}
        </>
    )
}
