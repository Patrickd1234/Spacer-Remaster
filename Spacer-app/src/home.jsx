import Sidebar from "./partials/sidebar"
import Header from "./partials/header"
import ProjectPanel from "./components/ProjectPanel"
import DocViewer from "./components/DocViewer"
import { useState, useEffect } from "react"
import { supabase } from "./supabase"

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
    "ON TRACK": "#9ddc5a",
    "NEEDS ATTENTION": "#f59e0b",
    "AT RISK": "#ef4444",
}

// ─── StatCard ────────────────────────────────────────────────────────────────
function StatCard({ value, label, sub, subIcon, subColor }) {
    return (
        <div className="glass-card p-lg rounded-xl flex flex-col gap-sm relative overflow-hidden group cursor-default hover:border-[rgba(182,255,51,0.25)] transition-all duration-300">
            <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                style={{ background: "radial-gradient(circle, rgba(182,255,51,0.1) 0%, transparent 70%)" }} />
            <p className="text-4xl font-bold text-on-surface tracking-tight">{value}</p>
            <p className="text-on-surface-variant font-body-sm">{label}</p>
            {sub && (
                <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider mt-auto"
                    style={{ color: subColor || "#9ddc5a" }}>
                    {subIcon && <span className="material-symbols-outlined text-[12px]">{subIcon}</span>}
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
        <div className="glass-card rounded-xl p-md flex flex-col gap-sm min-w-[220px] flex-1 hover:border-[rgba(182,255,51,0.25)] transition-all duration-300">
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-sm">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ background: "rgba(182,255,51,0.1)", border: "1px solid rgba(182,255,51,0.15)" }}>
                        <span className="material-symbols-outlined text-[18px]" style={{ color: "#9ddc5a" }}>{icon}</span>
                    </div>
                    <div>
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-on-surface-variant">Team</p>
                        <p className="font-semibold text-on-surface text-sm">{team.name}</p>
                    </div>
                </div>
                <span className="material-symbols-outlined text-on-surface-variant text-base cursor-pointer hover:text-on-surface transition-colors">more_horiz</span>
            </div>
            <div className="space-y-1 mt-1">
                <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-on-surface-variant text-xs">
                        <span className="material-symbols-outlined text-[14px]">person</span>Members
                    </span>
                    <span className="font-semibold text-on-surface text-sm">{team.member_count ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-on-surface-variant text-xs">
                        <span className="material-symbols-outlined text-[14px]">grid_view</span>Projects
                    </span>
                    <span className="font-semibold text-on-surface text-sm">{team.project_count ?? "—"}</span>
                </div>
            </div>
            <div className="flex items-center gap-2 mt-auto pt-sm border-t border-outline-variant">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: statusColor }} />
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: statusColor }}>Status</span>
                <span className="ml-auto text-[10px] font-bold uppercase tracking-wider" style={{ color: statusColor }}>{statusLabel}</span>
            </div>
        </div>
    )
}

function Home() {
    const [userEmail, setUserEmail] = useState("")
    const [userData, setUserData] = useState(null)
    const [selectedProject, setSelectedProject] = useState(null)
    const [previewFile, setPreviewFile] = useState(null)

    // Superadmin role state
    const [userRole, setUserRole] = useState(null)
    const [roleLoading, setRoleLoading] = useState(true)

    // Org stats (superadmin only)
    const [orgStats, setOrgStats] = useState({ members: null, teams: null, activeProjects: null })
    const [teams, setTeams] = useState([])
    const [teamPage, setTeamPage] = useState(0)
    const TEAMS_PER_PAGE = 3

    useEffect(() => {
        const email = localStorage.getItem("userEmail")
        if (email) setUserEmail(email)

        const init = async () => {
            try {
                // 1. Get authenticated user
                const { data: authData } = await supabase.auth.getUser()
                const userId = authData?.user?.id

                if (!userId) { setRoleLoading(false); return }

                // 2. Fetch user profile
                const { data: profile } = await supabase
                    .from("users")
                    .select("*")
                    .eq("id", userId)
                    .maybeSingle()
                if (profile) setUserData(profile)

                // 3. Query membership table for current user's role
                const { data: membership, error: memError } = await supabase
                    .from("membership")
                    .select("role")
                    .eq("user_id", userId)
                    .maybeSingle()

                if (memError) console.warn("membership fetch error:", memError)

                const role = membership?.role ?? null
                setUserRole(role)

                // 4. If superadmin, fetch org-level aggregate data
                if (role === "superadmin") {
                    await fetchOrgData()
                }
            } catch (err) {
                console.error("Home init error:", err)
            } finally {
                setRoleLoading(false)
            }
        }

        init()
    }, [])

    const fetchOrgData = async () => {
        try {
            // Total members
            const { data: allMembers } = await supabase.from("membership").select("id")
            const memberCount = allMembers?.length ?? 0

            // Teams from team_spaces table
            const { data: teamSpaces } = await supabase.from("team_spaces").select("id, name, status")
            const teamCount = teamSpaces?.length ?? 0

            // Active project spaces
            const { data: activeProjects } = await supabase.from("project_spaces").select("id")
            const projectCount = activeProjects?.length ?? 0

            setOrgStats({ members: memberCount, teams: teamCount, activeProjects: projectCount })

            // Per-team member & project counts
            if (teamSpaces && teamSpaces.length > 0) {
                const enriched = await Promise.all(
                    teamSpaces.map(async (ts) => {
                        const { data: mems } = await supabase
                            .from("membership").select("id").eq("team_space_id", ts.id)
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

    const isSuperAdmin = userRole === "superadmin"
    const totalTeamPages = Math.ceil(teams.length / TEAMS_PER_PAGE)
    const visibleTeams = teams.slice(teamPage * TEAMS_PER_PAGE, teamPage * TEAMS_PER_PAGE + TEAMS_PER_PAGE)

    return (
        <>
            <Sidebar />
            <Header />
            <main className="ml-[260px] flex-1 flex flex-col min-h-screen">
                <div className="p-lg space-y-lg">

                    {/* ── GREETING ──────────────────────────────────────── */}
                    <section className="flex items-start justify-between">
                        <div>
                            <h1 className="text-headline-xl font-bold text-on-surface flex items-center gap-2">
                                {isSuperAdmin ? "Circle Corp" : `Hello, ${userData?.name || userEmail || "User"} 👋`}
                            </h1>
                            <p className="text-on-surface-variant font-body-md mt-1">
                                {isSuperAdmin
                                    ? "Organization's overview and activity."
                                    : "Here's what's on your plate in this workspace."}
                            </p>
                        </div>
                        <div className="flex items-center gap-1 text-on-surface-variant text-xs mt-1">
                            <span className="material-symbols-outlined text-sm">home</span>
                            <span>/</span>
                            <span>Home</span>
                        </div>
                    </section>

                    {/* ── LOADING SKELETON ──────────────────────────────── */}
                    {roleLoading && (
                        <section className="grid grid-cols-1 md:grid-cols-4 gap-md">
                            {[...Array(4)].map((_, i) => (
                                <div key={i} className="glass-card p-lg rounded-xl flex flex-col gap-sm animate-pulse">
                                    <div className="h-8 w-16 bg-surface-container-highest rounded" />
                                    <div className="h-3 w-24 bg-surface-container-highest rounded mt-1" />
                                </div>
                            ))}
                        </section>
                    )}

                    {/* ── SUPERADMIN: ORG SUMMARY CARDS ─────────────────── */}
                    {isSuperAdmin && !roleLoading && (
                        <section className="grid grid-cols-1 md:grid-cols-4 gap-md">
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
                                subColor="#9ddc5a"
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
                        <section className="grid grid-cols-1 md:grid-cols-4 gap-md">
                            <div className="glass-card p-lg rounded-xl flex flex-col">
                                <p className="text-headline-xl font-bold">0</p>
                                <p className="text-on-surface-variant font-body-sm mt-1">To do</p>
                            </div>
                            <div className="glass-card p-lg rounded-xl flex flex-col">
                                <p className="text-headline-xl font-bold text-primary-fixed">0</p>
                                <p className="text-on-surface-variant font-body-sm mt-1">In progress</p>
                            </div>
                            <div className="glass-card p-lg rounded-xl flex flex-col">
                                <p className="text-headline-xl font-bold text-primary-container">0</p>
                                <p className="text-on-surface-variant font-body-sm mt-1">Done</p>
                            </div>
                            <div className="glass-card p-lg rounded-xl flex flex-col">
                                <p className="text-headline-xl font-bold text-error">0</p>
                                <p className="text-on-surface-variant font-body-sm mt-1">Overdue</p>
                            </div>
                        </section>
                    )}

                    {/* ── SUPERADMIN: TEAM OVERVIEW + RECENT ACTIVITY ───── */}
                    {isSuperAdmin && !roleLoading && (
                        <div className="grid grid-cols-12 gap-lg">
                            {/* Team Overview */}
                            <div className="col-span-12 lg:col-span-8">
                                <div className="flex items-center justify-between mb-md">
                                    <h2 className="font-headline-md font-semibold text-on-surface">Team Overview</h2>
                                    {totalTeamPages > 1 && (
                                        <div className="flex items-center gap-sm text-on-surface-variant text-xs">
                                            <button
                                                id="team-prev-btn"
                                                onClick={() => setTeamPage(p => Math.max(0, p - 1))}
                                                disabled={teamPage === 0}
                                                className="p-1 rounded hover:bg-surface-variant disabled:opacity-30 transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-base">chevron_left</span>
                                            </button>
                                            <span>
                                                {teamPage * TEAMS_PER_PAGE + 1}–{Math.min((teamPage + 1) * TEAMS_PER_PAGE, teams.length)} out of {teams.length}
                                            </span>
                                            <button
                                                id="team-next-btn"
                                                onClick={() => setTeamPage(p => Math.min(totalTeamPages - 1, p + 1))}
                                                disabled={teamPage >= totalTeamPages - 1}
                                                className="p-1 rounded hover:bg-surface-variant disabled:opacity-30 transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-base">chevron_right</span>
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {teams.length === 0 ? (
                                    <div className="glass-card rounded-xl p-xl flex flex-col items-center justify-center text-center min-h-[200px] gap-3">
                                        <span className="material-symbols-outlined text-4xl text-on-surface-variant">groups</span>
                                        <p className="text-on-surface-variant font-body-md">No teams found in the organization yet.</p>
                                    </div>
                                ) : (
                                    <div className="flex gap-md flex-wrap">
                                        {visibleTeams.map(team => (
                                            <TeamCard key={team.id} team={team} />
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Recent Activity */}
                            <div className="col-span-12 lg:col-span-4">
                                <div className="flex items-center justify-between mb-md">
                                    <h2 className="font-headline-md font-semibold text-on-surface">Recent Activity</h2>
                                    <button id="see-recent-btn" className="text-xs text-on-surface-variant hover:text-on-surface transition-colors">
                                        See recent activities
                                    </button>
                                </div>
                                <div className="glass-card rounded-xl p-md space-y-md min-h-[200px]">
                                    <div className="flex gap-md items-start">
                                        <div className="w-8 h-8 rounded bg-surface-container-highest flex items-center justify-center shrink-0 font-bold text-[10px] text-on-surface-variant">SA</div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-body-sm"><span className="font-bold text-on-surface">No Activity Yet</span></p>
                                            <p className="text-[10px] text-on-surface-variant mt-0.5">—</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── NON-SUPERADMIN: PERSONAL WORK BOARD ───────────── */}
                    {!isSuperAdmin && !roleLoading && (
                        <div className="grid grid-cols-12 gap-lg">
                            {/* My Open Work */}
                            <div className="col-span-12 lg:col-span-8">
                                <div className="glass-card rounded-xl flex flex-col min-h-[480px]">
                                    <div className="p-md border-b border-outline-variant flex justify-between items-center bg-surface-container-low/50 rounded-t-xl">
                                        <h3 className="font-headline-md font-semibold text-on-surface">My open work</h3>
                                        <span className="text-label-sm text-on-surface-variant">0 items</span>
                                    </div>
                                    <div className="flex-1 flex flex-col items-center justify-center p-xl text-center">
                                        <div className="text-5xl mb-6">🎉</div>
                                        <h4 className="font-headline-md text-on-surface font-semibold">You're all caught up</h4>
                                        <p className="text-on-surface-variant font-body-md max-w-xs mt-2">Nothing assigned to you is open right now.</p>
                                    </div>
                                </div>
                            </div>

                            {/* Recent Activity */}
                            <div className="col-span-12 lg:col-span-4">
                                <div className="glass-card rounded-xl flex flex-col min-h-[480px]">
                                    <div className="p-md border-b border-outline-variant bg-surface-container-low/50 rounded-t-xl">
                                        <h3 className="font-headline-md font-semibold text-on-surface">Recent activity</h3>
                                    </div>
                                    <div className="flex-1 overflow-y-auto p-md space-y-md">
                                        <div className="flex gap-md items-start group">
                                            <div className="w-8 h-8 rounded bg-surface-container-highest flex items-center justify-center shrink-0 font-bold text-[10px] text-on-surface-variant">SA</div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-body-sm"><span className="font-bold text-on-surface">No Activity Yet</span></p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                </div>
            </main>

            {/* Floating Action Button */}
            <button className="fixed bottom-lg right-lg w-14 h-14 bg-primary-fixed text-on-primary-fixed rounded-full flex items-center justify-center shadow-xl shadow-primary-fixed/30 hover:scale-110 active:scale-95 transition-all z-50 group">
                <span className="material-symbols-outlined text-2xl group-hover:rotate-90 transition-transform">add</span>
            </button>

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
        </>
    )
}

export default Home
