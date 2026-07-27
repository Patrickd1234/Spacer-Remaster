import Sidebar from "./partials/sidebar"
import Header from "./partials/header"
import ProjectPanel from "./components/ProjectPanel"
import DocViewer from "./components/DocViewer"
import { useState, useEffect } from "react"
import { supabase } from "./supabase"
import { Link, useNavigate } from "react-router-dom"

// ─── Team icon map ──────────────────────────────────────────────────────────
const TEAM_ICONS = {
    Development: "code",
    Marketing: "campaign",
    HR: "person_search",
    Finance: "account_balance",
    Design: "palette",
    default: "groups",
}

const TEAM_STATUS_COLOR = {
    "ON TRACK": "#aff82a",
    "NEEDS ATTENTION": "#f59e0b",
    "AT RISK": "#ef4444",
}

// ─── StatCard ────────────────────────────────────────────────────────────────
function StatCard({ value, label, sub, subIcon, subColor }) {
    return (
        <div className="bg-[#191c21] border border-[#2D3139] p-5 rounded-xl flex flex-col gap-2 relative overflow-hidden group cursor-default hover:border-[#424934] transition-all duration-300">
            <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{ background: "radial-gradient(circle, rgba(175,248,42,0.1) 0%, transparent 70%)" }} />
            <p className="text-3xl font-bold text-white tracking-tight">{value}</p>
            <p className="text-[#8c947b] text-[13px] font-medium">{label}</p>
            {sub && (
                <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider mt-auto"
                    style={{ color: subColor || "#aff82a" }}>
                    {subIcon && <span className="material-symbols-outlined text-[13px]">{subIcon}</span>}
                    {sub}
                </p>
            )}
        </div>
    )
}

// ─── TeamCard ─────────────────────────────────────────────────────────────────
function TeamCard({ team }) {
    const icon = TEAM_ICONS[team.name] || TEAM_ICONS.default
    const statusLabel = team.status || "ON TRACK"
    const statusColor = TEAM_STATUS_COLOR[statusLabel] || TEAM_STATUS_COLOR["ON TRACK"]

    return (
        <div className="bg-[#191c21] border border-[#2D3139] rounded-xl p-5 flex flex-col gap-3 min-w-[220px] flex-1 hover:border-[#424934] transition-all duration-300">
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-[#252a33] border border-[#343b47]">
                        <span className="material-symbols-outlined text-[20px] text-[#aff82a]">{icon}</span>
                    </div>
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[#8c947b]">Team</p>
                        <p className="font-semibold text-white text-sm">{team.name}</p>
                    </div>
                </div>
                <span className="material-symbols-outlined text-[#8c947b] text-base cursor-pointer hover:text-white transition-colors">more_horiz</span>
            </div>
            <div className="space-y-1.5 mt-1">
                <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[#8c947b] text-xs">
                        <span className="material-symbols-outlined text-[14px]">person</span>Members
                    </span>
                    <span className="font-semibold text-white text-sm">{team.member_count ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[#8c947b] text-xs">
                        <span className="material-symbols-outlined text-[14px]">grid_view</span>Projects
                    </span>
                    <span className="font-semibold text-white text-sm">{team.project_count ?? "—"}</span>
                </div>
            </div>
            <div className="flex items-center gap-2 mt-auto pt-3 border-t border-[#2D3139]">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: statusColor }} />
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: statusColor }}>Status</span>
                <span className="ml-auto text-[10px] font-bold uppercase tracking-wider" style={{ color: statusColor }}>{statusLabel}</span>
            </div>
        </div>
    )
}

function Home() {
    const navigate = useNavigate()
    const [userEmail, setUserEmail] = useState("")
    const [userData, setUserData] = useState(null)
    const [selectedProject, setSelectedProject] = useState(null)
    const [previewFile, setPreviewFile] = useState(null)
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

    // Superadmin role state
    const [userRole, setUserRole] = useState(null)
    const [roleLoading, setRoleLoading] = useState(true)

    // Org stats (superadmin only)
    const [orgStats, setOrgStats] = useState({ members: null, teams: null, activeProjects: null })
    const [teams, setTeams] = useState([])
    const [teamPage, setTeamPage] = useState(0)
    const TEAMS_PER_PAGE = 3

    // User tasks (non-superadmin only)
    const [userTasks, setUserTasks] = useState([])
    const [tasksLoading, setTasksLoading] = useState(false)

    const fetchOrgData = async (orgId) => {
        try {
            let teamQuery = supabase.from("team_spaces").select("id, name")
            if (orgId) teamQuery = teamQuery.eq("organization_id", orgId)
            const { data: teamSpaces, error } = await teamQuery
            if (error) console.warn("team_spaces fetch error:", error)
            const teamCount = teamSpaces?.length ?? 0
            const teamIds = teamSpaces?.map(ts => ts.id) || []

            let memberCount = 0
            if (teamIds.length > 0) {
                const { data: allMembers } = await supabase.from("memberships").select("id").in("team_space_id", teamIds)
                memberCount = allMembers?.length ?? 0
            }

            let projectCount = 0
            if (teamIds.length > 0) {
                const { data: activeProjects } = await supabase.from("project_spaces").select("id").in("team_space_id", teamIds)
                projectCount = activeProjects?.length ?? 0
            }

            setOrgStats({ members: memberCount, teams: teamCount, activeProjects: projectCount })

            if (teamSpaces && teamSpaces.length > 0) {
                const enriched = await Promise.all(
                    teamSpaces.map(async (ts) => {
                        const { data: mems } = await supabase
                            .from("memberships").select("id").eq("team_space_id", ts.id)
                        const { data: projs } = await supabase
                            .from("project_spaces").select("id").eq("team_space_id", ts.id)
                        return {
                            ...ts,
                            member_count: mems?.length ?? 0,
                            project_count: projs?.length ?? 0,
                            status: ts.status || "ON TRACK",
                        }
                    })
                )
                setTeams(enriched)
            }
        } catch (err) {
            console.error("Org data fetch error:", err)
        }
    }

    const fetchUserTasks = async (userId) => {
        setTasksLoading(true)
        try {
            const { data, error } = await supabase
                .from("tasks")
                .select("*")
                .eq("assignee_id", userId)

            if (error) {
                console.warn("tasks fetch error:", error)
            } else {
                const corrected = (data || []).map(t => {
                    let subtasksList = [];
                    if (t.sub_tasks) {
                        try {
                            subtasksList = JSON.parse(t.sub_tasks);
                            if (!Array.isArray(subtasksList)) subtasksList = [];
                        } catch (e) {}
                    }
                    const allDone = subtasksList.length > 0 && subtasksList.every(st => st.done);
                    const anyDone = subtasksList.some(st => st.done);

                    let expectedStatus = t.status;
                    if (allDone) {
                        expectedStatus = 'done';
                    } else if (subtasksList.length === 0 || !anyDone) {
                        expectedStatus = 'todo';
                    } else {
                        expectedStatus = 'in_progress';
                    }

                    if (t.status !== expectedStatus) {
                        supabase.from('tasks').update({ status: expectedStatus }).eq('id', t.id).then(({ error }) => {
                            if (error) console.error("Error auto-correcting task status", error);
                        });
                        return { ...t, status: expectedStatus };
                    }
                    return t;
                });
                setUserTasks(corrected)
            }
        } catch (err) {
            console.error("fetchUserTasks error:", err)
        } finally {
            setTasksLoading(false)
        }
    }

    useEffect(() => {
        const email = localStorage.getItem("userEmail")
        if (email) setUserEmail(email)

        const init = async () => {
            try {
                const { data: authData } = await supabase.auth.getUser()
                const userId = authData?.user?.id

                if (!userId) { setRoleLoading(false); return }

                const { data: profile } = await supabase
                    .from("users")
                    .select("*")
                    .eq("id", userId)
                    .maybeSingle()
                if (profile) setUserData(profile)

                const { data: membership, error: memError } = await supabase
                    .from("memberships")
                    .select("role, team_space_id")
                    .eq("user_id", userId)
                    .maybeSingle()

                if (memError) console.warn("membership fetch error:", memError)

                const role = membership?.role ?? null
                setUserRole(role)

                if (role === "super_admin" || role === "superadmin") {
                    let orgId = authData?.user?.user_metadata?.organization_id;
                    if (!orgId && membership?.team_space_id) {
                        const { data: tsData } = await supabase
                            .from("team_spaces")
                            .select("organization_id")
                            .eq("id", membership.team_space_id)
                            .maybeSingle();
                        orgId = tsData?.organization_id;
                    }
                    await fetchOrgData(orgId)
                } else {
                    await fetchUserTasks(userId)
                }
            } catch (err) {
                console.error("Home init error:", err)
            } finally {
                setRoleLoading(false)
            }
        }

        init()
    }, [])

    const isSuperAdmin = userRole === "super_admin" || userRole === "superadmin"
    const totalTeamPages = Math.ceil(teams.length / TEAMS_PER_PAGE)
    const visibleTeams = teams.slice(teamPage * TEAMS_PER_PAGE, teamPage * TEAMS_PER_PAGE + TEAMS_PER_PAGE)

    const todoTasks = userTasks.filter(t => t.status === "todo")
    const inProgressTasks = userTasks.filter(t => t.status === "in_progress")
    const doneTasks = userTasks.filter(t => t.status === "done")
    const openCount = todoTasks.length + inProgressTasks.length

    const displayName = userData?.full_name || userData?.name || localStorage.getItem("userEmail")?.split("@")[0] || userEmail?.split("@")[0] || "User";

    return (
        <div className="bg-[#0F1115] min-h-screen text-white font-sans antialiased flex">
            <Sidebar onCollapsedChange={setSidebarCollapsed} userData={userData} userEmail={userEmail} />
            <div className="flex-1 flex flex-col min-w-0">
                <Header />
                <main className={`${sidebarCollapsed ? "ml-[72px]" : "ml-[260px]"} flex-1 flex flex-col pt-16 transition-all duration-300 ease-out`}>
                    <div className="p-8 space-y-8 max-w-[1400px] w-full mx-auto">

                        {/* ── GREETING / HEADER BAR ──────────────────────────────── */}
                        <section className="flex items-start justify-between">
                            <div>
                                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                                    Hello, {displayName} 👋
                                </h1>
                                <p className="text-[#8c947b] text-sm mt-1">
                                    {isSuperAdmin
                                        ? "Organization's overview and activity."
                                        : "Here's what's on your plate in this workspace."}
                                </p>
                            </div>
                            <div className="flex items-center gap-2 text-[#8c947b] text-xs">
                                <span className="material-symbols-outlined text-[16px]">home</span>
                                <span>/</span>
                                <span className="text-white font-medium">Home</span>
                            </div>
                        </section>

                        {/* ── LOADING SKELETON ──────────────────────────────── */}
                        {roleLoading && (
                            <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                {[...Array(4)].map((_, i) => (
                                    <div key={i} className="bg-[#191c21] border border-[#2D3139] p-6 rounded-xl flex flex-col gap-2 animate-pulse">
                                        <div className="h-8 w-16 bg-[#252a33] rounded" />
                                        <div className="h-3 w-24 bg-[#252a33] rounded mt-2" />
                                    </div>
                                ))}
                            </section>
                        )}

                        {/* ── SUPERADMIN: ORG SUMMARY CARDS ─────────────────── */}
                        {isSuperAdmin && !roleLoading && (
                            <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <StatCard
                                    label="Members"
                                    value={orgStats.members ?? "—"}
                                    sub="Company Members"
                                    subIcon="person"
                                />
                                <StatCard
                                    label="Teams"
                                    value={orgStats.teams ?? "—"}
                                    sub="Across the Organization"
                                    subIcon="grid_view"
                                />
                                <StatCard
                                    label="Active Projects"
                                    value={orgStats.activeProjects ?? "—"}
                                    sub="Currently in Progress"
                                    subIcon="fiber_manual_record"
                                    subColor="#aff82a"
                                />
                                <StatCard
                                    label="Requires Attention"
                                    value={teams.filter(t => t.status === "NEEDS ATTENTION" || t.status === "AT RISK").length}
                                    sub="Pending Leadership Decisions"
                                    subIcon="flag"
                                    subColor="#ef4444"
                                />
                            </section>
                        )}

                        {/* ── NON-SUPERADMIN: PERSONAL TASK METRICS ─────────── */}
                        {!isSuperAdmin && !roleLoading && (
                            <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div className="bg-[#191c21] border border-[#2D3139] p-5 rounded-xl flex flex-col">
                                    <p className="text-3xl font-bold text-white">{tasksLoading ? "—" : todoTasks.length}</p>
                                    <p className="text-[#8c947b] text-xs font-medium mt-1">To do</p>
                                </div>
                                <div className="bg-[#191c21] border border-[#2D3139] p-5 rounded-xl flex flex-col">
                                    <p className="text-3xl font-bold text-[#aff82a]">{tasksLoading ? "—" : inProgressTasks.length}</p>
                                    <p className="text-[#8c947b] text-xs font-medium mt-1">In progress</p>
                                </div>
                                <div className="bg-[#191c21] border border-[#2D3139] p-5 rounded-xl flex flex-col">
                                    <p className="text-3xl font-bold text-green-400">{tasksLoading ? "—" : doneTasks.length}</p>
                                    <p className="text-[#8c947b] text-xs font-medium mt-1">Done</p>
                                </div>
                                <div className="bg-[#191c21] border border-[#2D3139] p-5 rounded-xl flex flex-col">
                                    <p className="text-3xl font-bold text-red-400">{tasksLoading ? "—" : userTasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== "done").length}</p>
                                    <p className="text-[#8c947b] text-xs font-medium mt-1">Overdue</p>
                                </div>
                            </section>
                        )}

                        {/* ── SUPERADMIN: TEAM OVERVIEW + RECENT ACTIVITY ───── */}
                        {isSuperAdmin && !roleLoading && (
                            <div className="grid grid-cols-12 gap-6">
                                {/* Team Overview */}
                                <div className="col-span-12 lg:col-span-8 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-lg font-semibold text-white">Team Overview</h2>
                                        {totalTeamPages > 1 && (
                                            <div className="flex items-center gap-2 text-[#8c947b] text-xs">
                                                <button
                                                    onClick={() => setTeamPage(p => Math.max(0, p - 1))}
                                                    disabled={teamPage === 0}
                                                    className="p-1 rounded bg-[#191c21] border border-[#2D3139] hover:text-white disabled:opacity-30 transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">chevron_left</span>
                                                </button>
                                                <span>
                                                    {teamPage * TEAMS_PER_PAGE + 1}–{Math.min((teamPage + 1) * TEAMS_PER_PAGE, teams.length)} out of {teams.length}
                                                </span>
                                                <button
                                                    onClick={() => setTeamPage(p => Math.min(totalTeamPages - 1, p + 1))}
                                                    disabled={teamPage >= totalTeamPages - 1}
                                                    className="p-1 rounded bg-[#191c21] border border-[#2D3139] hover:text-white disabled:opacity-30 transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {teams.length === 0 ? (
                                        <div className="bg-[#191c21] border border-[#2D3139] rounded-xl p-8 flex flex-col items-center justify-center text-center min-h-[200px] gap-3">
                                            <span className="material-symbols-outlined text-4xl text-[#8c947b]">groups</span>
                                            <p className="text-[#8c947b] text-sm">No teams found in the organization yet.</p>
                                        </div>
                                    ) : (
                                        <div className="flex gap-4 flex-wrap">
                                            {visibleTeams.map(team => (
                                                <TeamCard key={team.id} team={team} />
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Recent Activity */}
                                <div className="col-span-12 lg:col-span-4 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h2 className="text-lg font-semibold text-white">Recent Activity</h2>
                                        <button className="text-xs text-[#aff82a] hover:underline">See all</button>
                                    </div>
                                    <div className="bg-[#191c21] border border-[#2D3139] rounded-xl p-4 space-y-4 min-h-[200px]">
                                        <div className="flex gap-3 items-start">
                                            <div className="w-8 h-8 rounded bg-[#252a33] border border-[#343b47] flex items-center justify-center shrink-0 font-bold text-[10px] text-[#aff82a]">SA</div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-medium text-white">Organization space updated</p>
                                                <p className="text-[11px] text-[#8c947b] mt-0.5">System activity log ready</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── NON-SUPERADMIN: PERSONAL WORK BOARD ───────────── */}
                        {!isSuperAdmin && !roleLoading && (
                            <div className="grid grid-cols-12 gap-6">
                                {/* Task Kanban — 3 columns */}
                                <div className="col-span-12 lg:col-span-8 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-lg font-semibold text-white">My Open Work</h3>
                                        <span className="text-xs text-[#8c947b]">
                                            {tasksLoading ? "Loading…" : `${openCount} open item${openCount !== 1 ? "s" : ""}`}
                                        </span>
                                    </div>

                                    {tasksLoading ? (
                                        <div className="grid grid-cols-3 gap-4">
                                            {[...Array(3)].map((_, i) => (
                                                <div key={i} className="bg-[#191c21] border border-[#2D3139] rounded-xl p-4 space-y-2 animate-pulse">
                                                    <div className="h-3 w-16 bg-[#252a33] rounded" />
                                                    <div className="h-10 w-full bg-[#252a33] rounded-lg" />
                                                </div>
                                            ))}
                                        </div>
                                    ) : openCount === 0 && doneTasks.length === 0 ? (
                                        <div className="bg-[#191c21] border border-[#2D3139] rounded-xl flex flex-col items-center justify-center p-8 text-center min-h-[350px]">
                                            <div className="text-5xl mb-4">🎉</div>
                                            <h4 className="text-lg font-semibold text-white">You're all caught up</h4>
                                            <p className="text-[#8c947b] text-sm max-w-xs mt-2">Nothing assigned to you is open right now.</p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                            {/* To-Do column */}
                                            <div className="bg-[#191c21] border border-[#2D3139] rounded-xl flex flex-col">
                                                <div className="p-4 border-b border-[#2D3139] flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-[#8c947b]" />
                                                        <span className="font-semibold text-white text-xs uppercase tracking-wider">To‑Do</span>
                                                    </div>
                                                    <span className="text-xs text-[#8c947b] font-bold">{todoTasks.length}</span>
                                                </div>
                                                <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[380px]">
                                                    {todoTasks.length === 0 ? (
                                                        <p className="text-xs text-[#8c947b] text-center py-6">No tasks here</p>
                                                    ) : todoTasks.map(task => (
                                                        <div
                                                            key={task.id}
                                                            onClick={() => navigate(`/project_page/${task.project_id}?task_id=${task.id}`)}
                                                            className="bg-[#1C1F26] border border-[#2D3139] rounded-lg p-3 hover:border-[#aff82a]/50 transition-all cursor-pointer group"
                                                        >
                                                            <p className="text-sm font-semibold text-white truncate">{task.title || task.name || "Untitled"}</p>
                                                            {task.description && <p className="text-[11px] text-[#8c947b] mt-1 line-clamp-2">{task.description}</p>}
                                                            {task.due_date && (
                                                                <p className="text-[10px] mt-2 flex items-center gap-1" style={{ color: new Date(task.due_date) < new Date() ? "#ef4444" : "#aff82a" }}>
                                                                    <span className="material-symbols-outlined text-[12px]">calendar_today</span>
                                                                    {new Date(task.due_date).toLocaleDateString()}
                                                                </p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* In Progress column */}
                                            <div className="bg-[#191c21] border border-[#2D3139] rounded-xl flex flex-col">
                                                <div className="p-4 border-b border-[#2D3139] flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-[#aff82a]" />
                                                        <span className="font-semibold text-white text-xs uppercase tracking-wider">In Progress</span>
                                                    </div>
                                                    <span className="text-xs text-[#8c947b] font-bold">{inProgressTasks.length}</span>
                                                </div>
                                                <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[380px]">
                                                    {inProgressTasks.length === 0 ? (
                                                        <p className="text-xs text-[#8c947b] text-center py-6">No tasks here</p>
                                                    ) : inProgressTasks.map(task => (
                                                        <div
                                                            key={task.id}
                                                            onClick={() => navigate(`/project_page/${task.project_id}?task_id=${task.id}`)}
                                                            className="bg-[#1C1F26] border border-[#2D3139] rounded-lg p-3 hover:border-[#aff82a]/50 transition-all cursor-pointer"
                                                        >
                                                            <p className="text-sm font-semibold text-white truncate">{task.title || task.name || "Untitled"}</p>
                                                            {task.description && <p className="text-[11px] text-[#8c947b] mt-1 line-clamp-2">{task.description}</p>}
                                                            {task.due_date && (
                                                                <p className="text-[10px] mt-2 flex items-center gap-1" style={{ color: new Date(task.due_date) < new Date() ? "#ef4444" : "#aff82a" }}>
                                                                    <span className="material-symbols-outlined text-[12px]">calendar_today</span>
                                                                    {new Date(task.due_date).toLocaleDateString()}
                                                                </p>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Done column */}
                                            <div className="bg-[#191c21] border border-[#2D3139] rounded-xl flex flex-col">
                                                <div className="p-4 border-b border-[#2D3139] flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <span className="w-2 h-2 rounded-full bg-green-400" />
                                                        <span className="font-semibold text-white text-xs uppercase tracking-wider">Done</span>
                                                    </div>
                                                    <span className="text-xs text-[#8c947b] font-bold">{doneTasks.length}</span>
                                                </div>
                                                <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[380px]">
                                                    {doneTasks.length === 0 ? (
                                                        <p className="text-xs text-[#8c947b] text-center py-6">No tasks here</p>
                                                    ) : doneTasks.map(task => (
                                                        <div
                                                            key={task.id}
                                                            onClick={() => navigate(`/project_page/${task.project_id}?task_id=${task.id}`)}
                                                            className="bg-[#1C1F26] border border-[#2D3139] rounded-lg p-3 opacity-70 hover:opacity-100 hover:border-[#aff82a]/50 transition-all cursor-pointer"
                                                        >
                                                            <p className="text-sm font-semibold text-white truncate line-through text-[#8c947b]">{task.title || task.name || "Untitled"}</p>
                                                            {task.description && <p className="text-[11px] text-[#8c947b] mt-1 line-clamp-2">{task.description}</p>}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Activity / Meetings panel */}
                                <div className="col-span-12 lg:col-span-4 space-y-4">
                                    <div className="bg-[#191c21] border border-[#2D3139] rounded-xl p-5 flex flex-col min-h-[420px]">
                                        <h3 className="font-semibold text-white text-base mb-4 pb-3 border-b border-[#2D3139]">Recent Activity</h3>
                                        <div className="space-y-4 overflow-y-auto flex-1">
                                            <div className="flex gap-3 items-start">
                                                <div className="w-8 h-8 rounded-full bg-[#5b644d]/20 text-[#aff82a] border border-[#5b644d]/40 flex items-center justify-center shrink-0 font-bold text-xs">
                                                    SP
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-xs text-white">System dashboard initialized</p>
                                                    <p className="text-[10px] text-[#8c947b] mt-1">Just now</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* MEETINGS SECTION */}
                        <div className="space-y-4 pt-4 border-t border-[#2D3139]">
                            <div className="flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-white">Upcoming Meetings</h3>
                                <Link to="/calendar" className="text-[#aff82a] text-xs hover:underline">View all calendar</Link>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="bg-[#191c21] border border-[#2D3139] rounded-xl p-5 hover:border-[#424934] transition-colors">
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-3 text-xs text-[#8c947b]">
                                            <span className="font-semibold text-white">9:00 - 9:30 AM</span>
                                            <span className="w-1 h-1 rounded-full bg-[#424934]"></span>
                                            <span>30 mins</span>
                                        </div>
                                    </div>
                                    <div className="mb-4">
                                        <h4 className="text-base font-semibold text-white mb-1">Daily Standup — Dev Team</h4>
                                        <p className="text-[#aff82a] text-xs">Spacer Core Development</p>
                                    </div>
                                    <div className="flex gap-3">
                                        <button className="flex-1 flex items-center justify-center gap-2 bg-[#0F1115] border border-[#2D3139] hover:bg-[#2D3139] text-white py-2 rounded-lg text-xs font-medium transition-colors">
                                            <span className="material-symbols-outlined text-[16px]">video_camera_front</span> Join Meeting
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </main>
            </div>

            {/* Project panel */}
            {selectedProject && (
                <ProjectPanel
                    project={selectedProject}
                    onClose={() => setSelectedProject(null)}
                    onPreview={setPreviewFile}
                />
            )}

            {/* Document viewer */}
            {previewFile && (
                <DocViewer
                    file={previewFile}
                    onClose={() => setPreviewFile(null)}
                />
            )}
        </div>
    )
}

export default Home
