import Sidebar from "./partials/sidebar";
import Header from "./partials/header"
import { supabase } from "./supabase";
import { useEffect, useState } from 'react'

// ─────────────────────────────────────────────────────────────────────────
function Department() {

    // ── Auth & role state
    const [userId, setUserId]         = useState(null)
    const [userRole, setUserRole]     = useState(null)   // 'superadmin' | 'admin' | 'member'
    const [userTeamId, setUserTeamId] = useState(null)   // current user's team_space_id

    // ── Data state
    const [allTeams, setAllTeams]     = useState([])     // only used by superadmin
    const [activeTeam, setActiveTeam] = useState(null)   // the currently selected team object
    const [mem_info, setMem_info]     = useState([])     // enriched member list for the active team

    // ── UI state
    const [loading, setLoading]       = useState(true)
    const [searchQuery, setSearchQuery] = useState("")

    // ─────────────────────────────────────────────────────────────────────────
    useEffect(() => {
        const init = async () => {
            try {
                // 1. Get authenticated user
                const { data: authData } = await supabase.auth.getUser()
                const uid = authData?.user?.id
                if (!uid) { setLoading(false); return }
                setUserId(uid)

                // 2. SELECT role, team_space_id FROM memberships WHERE user_id = uid
                const { data: membership, error: memErr } = await supabase
                    .from("memberships")
                    .select("role, team_space_id")
                    .eq("user_id", uid)
                    .maybeSingle()

                if (memErr) console.warn("membership fetch error:", memErr)

                const role   = membership?.role ?? "member"
                const teamId = membership?.team_space_id ?? null

                setUserRole(role)
                setUserTeamId(teamId)

                // 3. Branch on role
                if (role === "superadmin") {
                    await fetchAllTeams()          // superadmin sees all teams
                } else {
                    await fetchTeamMembers(teamId) // admin/member only see their team
                }
            } catch (err) {
                console.error("Department init error:", err)
            } finally {
                setLoading(false)
            }
        }
        init()
    }, [])

    // ─────────────────────────────────────────────────────────────────────────
    // SUPERADMIN: fetch all team_spaces, then load members for the first one
    const fetchAllTeams = async () => {
        const { data: teams, error } = await supabase
            .from("team_spaces")
            .select("id, name, status")

        if (error) { console.warn("team_spaces error:", error); return }

        setAllTeams(teams || [])
        if (teams && teams.length > 0) {
            setActiveTeam(teams[0])
            await fetchTeamMembers(teams[0].id)
        }
    }

    // ── Fetch + enrich all members for a given team_space_id
    const fetchTeamMembers = async (teamId) => {
        if (!teamId) { setMem_info([]); return }

        // SELECT * FROM memberships WHERE team_space_id = teamId
        const { data: memberships, error: mErr } = await supabase
            .from("memberships")
            .select("*")
            .eq("team_space_id", teamId)

        if (mErr) { console.warn("memberships error:", mErr); setMem_info([]); return }
        if (!memberships || memberships.length === 0) { setMem_info([]); return }

        // Enrich each row with the user profile from `users`
        const enriched = []
        for (const row of memberships) {
            const { data: profile } = await supabase
                .from("users")
                .select("*")
                .eq("id", row.user_id)
                .maybeSingle()

            enriched.push({
                ...row,
                ...(profile || {}),
                membershipRole: row.role,
                profileRole: profile?.role ?? row.role,
            })
        }
        setMem_info(enriched)
    }

    // Superadmin: switch active team
    const switchTeam = async (team) => {
        setActiveTeam(team)
        setLoading(true)
        await fetchTeamMembers(team.id)
        setLoading(false)
    }

    // ── Derived values
    const isSuperAdmin = userRole === "superadmin"
    const isAdmin      = userRole === "admin"
    const canManage    = isSuperAdmin || isAdmin

    const filteredMembers = mem_info.filter(m =>
        !searchQuery ||
        (m.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.email || "").toLowerCase().includes(searchQuery.toLowerCase())
    )

    const pageTitle = isSuperAdmin
        ? (activeTeam ? activeTeam.name : "All Teams")
        : "Department"

    return (
        <>
            <Sidebar />
            <Header />
            <main className="ml-sidebar-width flex-1 flex flex-col min-h-screen">

                {/* TopAppBar */}
                <header className="h-16 bg-surface-container-low border-b border-outline-variant flex items-center justify-between px-lg sticky top-0 z-40">
                    <div className="flex items-center gap-lg flex-1">
                        <div className="relative w-full max-w-md">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
                            <input
                                className="w-full bg-surface-variant border-none rounded-full py-2 pl-10 pr-4 text-on-surface focus:ring-1 focus:ring-primary-fixed placeholder:text-on-surface-variant font-body-md text-body-md"
                                placeholder="Search department members..."
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                    <div className="flex items-center gap-md">
                        <div className="flex items-center gap-xs">
                            <button className="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-variant transition-colors">
                                <span className="material-symbols-outlined">videocam</span>
                            </button>
                            <button className="w-10 h-10 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-variant relative transition-colors">
                                <span className="material-symbols-outlined">notifications</span>
                                <span className="absolute top-2 right-2 w-2 h-2 bg-error rounded-full"></span>
                            </button>
                        </div>
                        <div className="h-8 w-[1px] bg-outline-variant"></div>
                        <button className="text-on-surface font-medium hover:text-primary transition-colors px-3 py-2 flex items-center gap-2">
                            <span className="material-symbols-outlined">note_add</span> New Document
                        </button>
                        {canManage && (
                            <button className="bg-primary-container text-on-primary-container font-bold px-lg py-2 rounded-lg hover:opacity-90 transition-opacity active:scale-95">
                                New Task
                            </button>
                        )}
                    </div>
                </header>

                {/* Content Canvas */}
                <div className="p-lg flex-1 overflow-y-auto">

                    {/* Page Header / Action Row */}
                    <div className="flex flex-col md:flex-row md:items-end justify-between mb-xl gap-lg">
                        <div>
                            <nav className="flex items-center gap-2 text-on-surface-variant text-xs mb-1">
                                <span className="material-symbols-outlined text-sm">groups</span>
                                <span>/</span>
                                <span>{pageTitle}</span>
                                {isSuperAdmin && activeTeam && (
                                    <>
                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
                                            style={{ background: "rgba(182,255,51,0.1)", color: "#9ddc5a", border: "1px solid rgba(182,255,51,0.2)" }}>
                                            superadmin
                                        </span>
                                    </>
                                )}
                            </nav>
                            <h1 className="text-2xl font-bold text-on-surface">{pageTitle}</h1>
                            <p className="text-on-surface-variant text-sm mt-0.5">
                                {filteredMembers.length} member{filteredMembers.length !== 1 ? "s" : ""} {isSuperAdmin && activeTeam ? `in ${activeTeam.name}` : "in your team"}
                            </p>
                        </div>

                        {/* Admin-only: Add / Remove member buttons */}
                        {canManage && (
                            <div className="flex items-center gap-sm">
                                <button
                                    id="remove-member-btn"
                                    className="flex items-center gap-2 px-md py-sm rounded-lg bg-surface-container-high border border-outline-variant text-on-surface hover:border-error hover:text-error transition-all font-label-md text-label-md"
                                >
                                    <span className="material-symbols-outlined">person_remove</span>
                                    REMOVE MEMBER
                                </button>
                                <button
                                    id="add-member-btn"
                                    className="flex items-center gap-2 px-md py-sm rounded-lg bg-primary-fixed text-on-primary-fixed hover:opacity-90 transition-all font-label-md text-label-md"
                                >
                                    <span className="material-symbols-outlined">person_add</span>
                                    ADD MEMBER
                                </button>
                            </div>
                        )}
                    </div>

                    {/* SUPERADMIN: Team Switcher tabs */}
                    {isSuperAdmin && allTeams.length > 0 && (
                        <div className="flex items-center gap-sm flex-wrap mb-lg">
                            {allTeams.map(team => (
                                <button
                                    key={team.id}
                                    id={`team-tab-${team.id}`}
                                    onClick={() => switchTeam(team)}
                                    className={`px-md py-sm rounded-full text-sm font-semibold transition-all ${
                                        activeTeam?.id === team.id
                                            ? "bg-primary-fixed text-on-primary-fixed"
                                            : "bg-surface-container-high text-on-surface-variant hover:bg-surface-variant"
                                    }`}
                                >
                                    {team.name}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Member Grid */}
                    {loading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-lg">
                            {[...Array(6)].map((_, i) => (
                                <div key={i} className="glass-card rounded-xl p-md flex flex-col gap-sm h-48 animate-pulse">
                                    <div className="flex items-start justify-between">
                                        <div className="w-12 h-12 rounded-xl bg-surface-container-highest" />
                                        <div className="h-4 w-16 bg-surface-container-highest rounded" />
                                    </div>
                                    <div className="h-4 w-32 bg-surface-container-highest rounded" />
                                    <div className="h-3 w-24 bg-surface-container-highest rounded" />
                                </div>
                            ))}
                        </div>
                    ) : filteredMembers.length === 0 ? (
                        <div className="glass-card rounded-xl p-xl flex flex-col items-center justify-center text-center min-h-[300px] gap-3">
                            <span className="material-symbols-outlined text-4xl text-on-surface-variant">person_search</span>
                            <p className="text-on-surface font-semibold">No members found</p>
                            <p className="text-on-surface-variant text-sm">
                                {searchQuery ? "Try a different search term." : "No members are assigned to this team yet."}
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-lg">
                            {filteredMembers.map((member) => (
                                <div key={member.user_id || member.id} className="glass-card rounded-xl p-md flex flex-col h-full relative group hover:border-[rgba(182,255,51,0.2)] transition-all duration-300">
                                    <div className="flex items-start justify-between mb-sm">
                                        <div className="relative">
                                            <div className="w-12 h-12 rounded-xl overflow-hidden border border-outline-variant bg-surface-container-highest flex items-center justify-center">
                                                {member.avatar_url ? (
                                                    <img src={member.avatar_url} alt={member.name} className="w-full h-full object-cover" />
                                                ) : (
                                                    <span className="text-lg font-bold text-on-surface-variant">
                                                        {(member.name || member.email || "?").charAt(0).toUpperCase()}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="presence-indicator presence-active"></div>
                                        </div>
                                        <div className="flex gap-1 items-center">
                                            <span className="px-1.5 py-0.5 rounded bg-secondary-container text-on-secondary-container text-[9px] font-bold uppercase tracking-tighter">
                                                {member.membershipRole || member.role}
                                            </span>
                                            {canManage && (
                                                <button className="w-6 h-6 rounded-lg flex items-center justify-center hover:bg-surface-variant text-on-surface-variant">
                                                    <span className="material-symbols-outlined text-xs">more_vert</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="mb-sm">
                                        <h4 className="font-headline-md text-body-lg text-on-surface font-bold">
                                            {member.name || member.display_name || "Unknown"}
                                        </h4>
                                        <p className="font-body-sm text-[11px] text-on-surface-variant">
                                            {member.email || member.membershipRole}
                                        </p>
                                    </div>
                                    <div className="mt-auto flex items-center gap-2">
                                        <button className="flex-1 bg-surface-variant text-on-surface font-semibold py-1.5 rounded-lg flex items-center justify-center gap-1.5 hover:bg-outline-variant transition-all text-body-sm">
                                            <span className="material-symbols-outlined text-sm">chat_bubble</span>
                                            Message
                                        </button>
                                        <button className="w-8 h-8 bg-surface-variant text-on-surface rounded-lg flex items-center justify-center hover:bg-outline-variant transition-all">
                                            <span className="material-symbols-outlined text-sm">trending_flat</span>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer / Mini Report */}
                <footer className="mt-auto px-lg py-md border-t border-outline-variant bg-surface-container-low flex flex-col md:flex-row md:items-center justify-between gap-md">
                    <div className="flex items-center gap-lg">
                        <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-primary-fixed animate-pulse"></span>
                            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">Mission Control Sync: OK</span>
                        </div>
                        <div className="flex items-center gap-4 text-outline font-label-md text-label-md">
                            <a className="hover:text-primary transition-colors cursor-pointer">Usage Report</a>
                            <a className="hover:text-primary transition-colors cursor-pointer">Access Logs</a>
                            <a className="hover:text-primary transition-colors cursor-pointer">Help Center</a>
                        </div>
                    </div>
                    <div className="flex items-center gap-md">
                        <div className="flex -space-x-2">
                            {mem_info.slice(0, 3).map((m, i) => (
                                <div key={i} className="w-8 h-8 rounded-full border-2 border-surface-container-low overflow-hidden bg-surface-variant flex items-center justify-center text-[10px] font-bold text-on-surface-variant">
                                    {m.avatar_url
                                        ? <img src={m.avatar_url} alt={m.name} className="w-full h-full object-cover" />
                                        : (m.name || "?").charAt(0).toUpperCase()}
                                </div>
                            ))}
                            {mem_info.length > 3 && (
                                <div className="w-8 h-8 rounded-full border-2 border-surface-container-low overflow-hidden bg-surface-variant flex items-center justify-center text-[10px] font-bold text-on-surface-variant">
                                    +{mem_info.length - 3}
                                </div>
                            )}
                        </div>
                        <span className="font-label-md text-label-md text-on-surface-variant">Total Department Strength</span>
                    </div>
                </footer>

            </main>
        </>
    )
}

export default Department;

