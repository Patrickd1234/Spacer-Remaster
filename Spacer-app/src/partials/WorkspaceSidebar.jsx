import { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { supabase, getSessionUser } from "../supabase"
import { useRole } from "../RoleContext"
import CreateProjectModal from "./CreateProjectModal"
import SidebarProfile from "./SidebarProfile"
import { NavLink, NavButton, NavSection, SubLink, EmptyNote, SkeletonRows, TeamSpaceGroup } from "./SidebarNav"
import { mergeProjects } from "./projectMemberships"
import { projectsInDepartment } from "../projectDepartments"
import { readSavedOrgName, saveOrgName } from "../orgNameCache"
import { readSavedProjectList, saveProjectList } from "../projectListCache"
import { visibleProjects } from "../projectVisibility"
import { PROJECT_CREATED_EVENT } from "../appEvents"

// Projects (among `projectIds`) the signed-in user was added to or has a task in.
// On a failed lookup that part counts as none, so nothing extra is shown.
async function loadMyProjectIds(projectIds) {
    const user = await getSessionUser()
    if (!user || projectIds.length === 0) return { userId: user?.id ?? null, ids: new Set() }
    const [added, assigned] = await Promise.all([
        supabase.from("project_members").select("project_id").eq("user_id", user.id),
        supabase.from("tasks").select("project_id").eq("assignee_id", user.id).in("project_id", projectIds),
    ])
    if (added.error) console.error("Loading your projects failed:", added.error)
    if (assigned.error) console.error("Loading projects you have tasks in failed:", assigned.error)
    const rows = [...(added.data || []), ...(assigned.data || [])]
    return { userId: user.id, ids: new Set(rows.map((r) => String(r.project_id))) }
}

// Sidebar for every role. Super admins see all of the organization's departments
// under Team Spaces; everyone else sees the departments they belong to.
// `unreadMessages` / `isMessagesOpen` / `onOpenMessages` come from SidebarRouter, which owns the chat window.
export default function WorkspaceSidebar({ userEmail = "", userData = null, onCollapsedChange, unreadMessages = 0, isMessagesOpen = false, onOpenMessages }) {
    const navigate = useNavigate()
    const location = useLocation()
    const { pathname } = location
    const { departments, setActiveDepartment, isSuperAdmin, isAdmin, activeDepartment, orgDepartmentId, roleLoading, canAnywhere } = useRole()
    const [collapsed, setCollapsed] = useState(false)
    const [hovered, setHovered] = useState(false)
    // Start from the list saved by the last sidebar, so it shows at once on every
    // page instead of "No projects yet"; the fresh load below replaces it
    const [saved] = useState(readSavedProjectList)
    const [projects, setProjects] = useState(() => saved?.projects || [])
    // Extra departments of those projects: { project_id, team_space_id }
    const [projectLinks, setProjectLinks] = useState(() => saved?.links || [])
    const [projectsLoaded, setProjectsLoaded] = useState(Boolean(saved))
    const [orgTeams, setOrgTeams] = useState(() => saved?.orgTeams || [])
    const [orgTeamsLoaded, setOrgTeamsLoaded] = useState(false)
    const [dbUser, setDbUser] = useState(null)
    const [orgName, setOrgName] = useState(readSavedOrgName)
    const [showCreateModal, setShowCreateModal] = useState(false)
    const isExpanded = !collapsed || hovered

    const teams = isSuperAdmin ? orgTeams : departments.map((d) => ({ id: d.team_space_id, name: d.name }))
    const teamKey = teams.map((t) => t.id).join(",")
    // Whether the department list is final; until then an empty list only means "still loading"
    const teamsReady = !roleLoading && (!isSuperAdmin || orgTeamsLoaded)
    const home = isSuperAdmin ? { icon: "domain", label: "Organization" } : { icon: "person", label: "My Space" }

    // Your role in each department, e.g. "design-id:team_lead"
    const roleKey = departments.map((d) => `${d.team_space_id}:${d.role}`).join(",")
    const isOrgAdmin = isSuperAdmin || isAdmin

    // Projects in the user's departments (super admins: every department), then
    // narrowed by projectVisibility.js: admins and a department's team leads see
    // all of them, members only the ones they lead, were added to or have a task in.
    // Being added to a project directly doesn't list it without its department.
    useEffect(() => {
        if (!teamsReady) return undefined
        let active = true
        const load = async () => {
            const ids = teamKey ? teamKey.split(",") : []
            if (ids.length === 0) {
                if (!active) return
                setProjects([])
                setProjectLinks([])
                setProjectsLoaded(true)
                saveProjectList({ projects: [], links: [] })
                return
            }
            // Projects whose extra departments (project_departments) include these
            // (not invites still waiting for an answer).
            // On failure, fall back to main-department projects only.
            const { data: linkRows, error: linkError } = await supabase
                .from("project_departments").select("project_id, team_space_id").in("team_space_id", ids).neq("status", "invited")
            if (linkError) console.error("Loading projects' extra departments failed:", linkError)
            const links = linkError ? [] : (linkRows || [])
            const linkedIds = [...new Set(links.map((l) => l.project_id))]

            // due_date is saved with the list so the project page can show the deadline at once
            const columns = "id, name, team_space_id, due_date, team_lead"
            const [main, linked] = await Promise.all([
                supabase.from("project_spaces").select(columns).in("team_space_id", ids),
                linkedIds.length > 0
                    ? supabase.from("project_spaces").select(columns).in("id", linkedIds)
                    : Promise.resolve({ data: [], error: null }),
            ])
            if (main.error) console.error("Loading department projects failed:", main.error)
            if (linked.error) console.error("Loading projects shared with departments failed:", linked.error)
            const allProjects = mergeProjects(main.error ? [] : (main.data || []), linked.error ? [] : (linked.data || []))
            const mine = isOrgAdmin ? { userId: null, ids: new Set() } : await loadMyProjectIds(allProjects.map((pr) => pr.id))
            if (!active) return
            const myDepartments = roleKey ? roleKey.split(",").map((entry) => {
                const [team_space_id, role] = entry.split(":")
                return { team_space_id, role }
            }) : []
            const nextProjects = visibleProjects({
                projects: allProjects, links, userId: mine.userId, isOrgAdmin, myDepartments, myProjectIds: mine.ids,
            })
            setProjects(nextProjects)
            setProjectLinks(links)
            setProjectsLoaded(true)
            // Only a complete load replaces the saved list
            if (!main.error && !linked.error && !linkError) saveProjectList({ projects: nextProjects, links })
        }
        load()
        return () => { active = false }
    }, [teamKey, teamsReady, isOrgAdmin, roleKey])

    // A project created anywhere (this sidebar's button or the header's Create
    // menu) is listed at once, if it belongs to one of the user's departments
    useEffect(() => {
        const addCreatedProject = (event) => {
            const { project, extraDepartmentIds = [] } = event.detail || {}
            if (!project?.id) return
            const teamIds = new Set(teamKey ? teamKey.split(",") : [])
            const links = extraDepartmentIds.filter((id) => teamIds.has(String(id))).map((id) => ({ project_id: project.id, team_space_id: id }))
            if (!teamIds.has(String(project.team_space_id)) && links.length === 0) return
            const nextProjects = mergeProjects(projects, [project])
            const nextLinks = [...projectLinks, ...links]
            setProjects(nextProjects)
            setProjectLinks(nextLinks)
            // Saved so the new project's page shows its name at once
            saveProjectList({ projects: nextProjects, links: nextLinks })
        }
        window.addEventListener(PROJECT_CREATED_EVENT, addCreatedProject)
        return () => window.removeEventListener(PROJECT_CREATED_EVENT, addCreatedProject)
    }, [teamKey, projects, projectLinks])

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
            if (!active) return
            setOrgName(org?.name || "")
            saveOrgName(org?.name || "")
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
                if (!active) return
                setOrgTeams(data || [])
                setOrgTeamsLoaded(true)
                if (!error) saveProjectList({ orgTeams: data || [] })
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
                className={`fixed left-0 top-0 h-full ${isExpanded ? "w-[260px]" : "w-[72px]"} border-r border-line bg-surface1 flex flex-col pt-5 pb-3 z-50 transition-all duration-300 ease-out overflow-hidden`}
                onMouseEnter={() => { if (collapsed) setHovered(true) }}
                onMouseLeave={() => setHovered(false)}
                onClick={() => { if (collapsed && hovered) setCollapsedState(false) }}
            >
                <div className={`px-4 pb-4 mb-3 border-b border-line flex items-center ${isExpanded ? "justify-between" : "justify-center"}`}>
                    {isExpanded && (
                        <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-7 h-7 rounded-md bg-primary-accent-dim text-primary-accent flex items-center justify-center font-bold text-[13px] shrink-0">
                                {orgName.charAt(0).toUpperCase()}
                            </div>
                            {orgName
                                ? <span className="font-semibold text-[14px] text-white truncate">{orgName}</span>
                                : <span className="h-3.5 w-24 rounded bg-line animate-pulse" aria-label="Loading organization" />}
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setCollapsedState(!collapsed) }}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-line text-muted hover:text-white transition-colors cursor-pointer"
                        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                    >
                        <span className="material-symbols-outlined text-[16px]">{collapsed ? "left_panel_open" : "left_panel_close"}</span>
                    </button>
                </div>

                <nav className="flex-1 overflow-y-auto px-3 space-y-1 scrollbar-thin">
                    <NavLink to="/" icon={home.icon} label={home.label} isActive={pathname === "/"} isExpanded={isExpanded} />

                    <NavSection icon="workspaces" label="General Space" isExpanded={isExpanded} defaultOpen={pathname.startsWith("/general")}>
                        <SubLink to="/general" label="Overview" isActive={pathname === "/general"} />
                        <SubLink to="/general/announcements" label="Announcements" isActive={pathname === "/general/announcements"} />
                        <SubLink to="/general/calendar" label="Company Calendar" isActive={pathname === "/general/calendar"} />
                        <SubLink to="/general/directory" label="Directory" isActive={pathname === "/general/directory"} />
                        <SubLink to="/tasks" label="All Tasks" isActive={pathname === "/tasks"} />
                    </NavSection>

                    <NavSection icon="groups" label="Team Spaces" isExpanded={isExpanded}>
                        {teams.length === 0 && !teamsReady && <SkeletonRows />}
                        {teams.length === 0 && teamsReady && <EmptyNote>{isSuperAdmin ? "No departments yet" : "Not in a department yet"}</EmptyNote>}
                        {teams.map((t) => (
                                <TeamSpaceGroup
                                    key={t.id}
                                    name={t.name}
                                    projects={projectsInDepartment(projects, projectLinks, t.id)}
                                    isLoading={!projectsLoaded}
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
                        action={canAnywhere("project.create") && (
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
                        {projects.length === 0 && !projectsLoaded && <SkeletonRows />}
                        {projects.length === 0 && projectsLoaded && <EmptyNote>No projects yet</EmptyNote>}
                        {projects.length > 0 && projects.map((p) => <SubLink key={p.id} to={`/project_page/${p.id}`} label={p.name} isActive={pathname === `/project_page/${p.id}`} />)}
                    </NavSection>

                    <NavButton icon="chat" label="Messages" onClick={onOpenMessages} isActive={isMessagesOpen} isExpanded={isExpanded} badge={unreadMessages} />
                    <NavLink to="/calendar" icon="calendar_today" label="Calendar" isActive={pathname === "/calendar"} isExpanded={isExpanded} />
                    <NavLink to="/reports" icon="bar_chart" label="Reports" isActive={pathname === "/reports"} isExpanded={isExpanded} />
                </nav>

                {/* Settings opens from the profile menu below */}
                <SidebarProfile name={displayName} email={displayEmail} isExpanded={isExpanded} />
            </aside>

            {showCreateModal && (
                // Lists the new project through PROJECT_CREATED_EVENT (above)
                <CreateProjectModal onClose={() => setShowCreateModal(false)} />
            )}
        </>
    )
}
