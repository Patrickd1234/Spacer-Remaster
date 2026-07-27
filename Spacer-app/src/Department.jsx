import Sidebar from "./partials/sidebar";
import Header from "./partials/header";
import { supabase } from "./supabase";
import { useEffect, useState } from 'react';
import { useRole } from "./RoleContext";

function Department() {
    const [userId, setUserId] = useState(null)
    const [userTeamId, setUserTeamId] = useState(null)
    const [allTeams, setAllTeams] = useState([])
    const [activeTeam, setActiveTeam] = useState(null)
    const [mem_info, setMem_info] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const { isSuperAdmin, isAdmin, roleLoading, membershipData } = useRole()
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

    useEffect(() => {
        const init = async () => {
            try {
                const { data: authData } = await supabase.auth.getUser()
                const uid = authData?.user?.id
                if (!uid) { setLoading(false); return }
                setUserId(uid)

                if (isSuperAdmin) {
                    let orgId = authData?.user?.user_metadata?.organization_id;
                    if (!orgId && membershipData?.team_space_id) {
                        const { data: tsData } = await supabase
                            .from("team_spaces")
                            .select("organization_id")
                            .eq("id", membershipData.team_space_id)
                            .maybeSingle();
                        orgId = tsData?.organization_id;
                    }
                    await fetchAllTeams(orgId)
                } else {
                    setUserTeamId(membershipData?.team_space_id)
                    await fetchTeamMembers(membershipData?.team_space_id)
                }
            } catch (err) {
                console.error("Department init error:", err)
            } finally {
                setLoading(false)
            }
        }

        if (!roleLoading) {
            init()
        }
    }, [isSuperAdmin, roleLoading, membershipData])

    const fetchAllTeams = async (orgId) => {
        let teamQuery = supabase.from("team_spaces").select("id, name")
        if (orgId) teamQuery = teamQuery.eq("organization_id", orgId)
        
        const { data: teams, error } = await teamQuery

        if (error) { console.warn("team_spaces error:", error); return }

        setAllTeams(teams || [])
        if (teams && teams.length > 0) {
            setActiveTeam(teams[0])
            await fetchTeamMembers(teams[0].id)
        }
    }

    const fetchTeamMembers = async (teamId) => {
        if (!teamId) { setMem_info([]); return }

        const { data: memberships, error: mErr } = await supabase
            .from("memberships")
            .select("*")
            .eq("team_space_id", teamId)

        if (mErr) { console.warn("memberships error:", mErr); setMem_info([]); return }
        if (!memberships || memberships.length === 0) { setMem_info([]); return }

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

    const switchTeam = async (team) => {
        setActiveTeam(team)
        setLoading(true)
        await fetchTeamMembers(team.id)
        setLoading(false)
    }

    const canManage = isSuperAdmin || isAdmin

    const filteredMembers = mem_info.filter(m =>
        !searchQuery ||
        (m.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (m.email || "").toLowerCase().includes(searchQuery.toLowerCase())
    )

    const pageTitle = isSuperAdmin
        ? (activeTeam ? activeTeam.name : "All Teams")
        : "Department Directory"

    return (
        <div className="bg-[#0F1115] min-h-screen text-white font-sans antialiased flex flex-col">
            <Sidebar onCollapsedChange={setSidebarCollapsed} />
            <Header />
            <main className={`${sidebarCollapsed ? "ml-[72px]" : "ml-[260px]"} flex-1 flex flex-col pt-16 transition-all duration-300 ease-out`}>

                {/* Top Controls Header */}
                <div className="bg-[#111318] border-b border-[#2D3139] px-8 py-4 flex items-center justify-between sticky top-16 z-30">
                    <div className="relative w-full max-w-md">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#8c947b] text-[20px]">search</span>
                        <input
                            className="w-full bg-[#181a20] border border-[#2D3139] rounded-xl py-2 pl-10 pr-4 text-white placeholder-[#8c947b] text-sm focus:outline-none focus:border-[#aff82a]"
                            placeholder="Search department members by name or email..."
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="p-8 flex-1 space-y-8">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2 text-[#8c947b] text-xs mb-1">
                                <span className="material-symbols-outlined text-[16px]">groups</span>
                                <span>/</span>
                                <span className="text-white font-medium">{pageTitle}</span>
                            </div>
                            <h1 className="text-2xl font-bold text-white">{pageTitle}</h1>
                            <p className="text-[#8c947b] text-sm mt-1">
                                {filteredMembers.length} member{filteredMembers.length !== 1 ? "s" : ""} {isSuperAdmin && activeTeam ? `assigned to ${activeTeam.name}` : "in your department team"}
                            </p>
                        </div>

                        {canManage && (
                            <div className="flex items-center gap-3">
                                <button className="px-4 py-2 bg-[#5b644d] hover:bg-[#6c765c] text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition-all">
                                    <span className="material-symbols-outlined text-[18px]">person_add</span>
                                    Add Member
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Superadmin Team Switcher Tabs */}
                    {isSuperAdmin && allTeams.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap pb-2 border-b border-[#2D3139]">
                            {allTeams.map(team => (
                                <button
                                    key={team.id}
                                    onClick={() => switchTeam(team)}
                                    className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                                        activeTeam?.id === team.id
                                            ? "bg-[#5b644d] text-white"
                                            : "bg-[#191c21] text-[#8c947b] border border-[#2D3139] hover:text-white"
                                    }`}
                                >
                                    {team.name}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Member Cards Grid */}
                    {loading ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {[...Array(6)].map((_, i) => (
                                <div key={i} className="bg-[#191c21] border border-[#2D3139] rounded-xl p-5 h-44 animate-pulse">
                                    <div className="h-10 w-10 bg-[#252a33] rounded-full mb-4" />
                                    <div className="h-4 w-32 bg-[#252a33] rounded mb-2" />
                                    <div className="h-3 w-24 bg-[#252a33] rounded" />
                                </div>
                            ))}
                        </div>
                    ) : filteredMembers.length === 0 ? (
                        <div className="bg-[#191c21] border border-[#2D3139] rounded-xl p-12 flex flex-col items-center justify-center text-center min-h-[250px] gap-3">
                            <span className="material-symbols-outlined text-4xl text-[#8c947b]">person_search</span>
                            <p className="text-white font-semibold text-base">No team members found</p>
                            <p className="text-[#8c947b] text-xs max-w-sm">
                                {searchQuery ? "No members matched your search query." : "No team members are assigned to this department yet."}
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {filteredMembers.map((member) => (
                                <div key={member.user_id || member.id} className="bg-[#191c21] border border-[#2D3139] rounded-xl p-5 flex flex-col justify-between hover:border-[#424934] transition-all group">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="w-12 h-12 rounded-xl bg-[#252a33] border border-[#343b47] flex items-center justify-center font-bold text-white text-lg">
                                            {(member.name || member.email || "?").charAt(0).toUpperCase()}
                                        </div>
                                        <span className="bg-[#5b644d]/20 text-[#aff82a] border border-[#5b644d]/30 text-[10px] font-bold px-2 py-0.5 rounded uppercase">
                                            {member.membershipRole || member.role || "Member"}
                                        </span>
                                    </div>
                                    <div>
                                        <h4 className="text-white font-semibold text-base">
                                            {member.name || "Team Member"}
                                        </h4>
                                        <p className="text-[#8c947b] text-xs truncate mt-0.5">
                                            {member.email || "user@spacers.com"}
                                        </p>
                                    </div>
                                    <div className="mt-6 pt-4 border-t border-[#2D3139] flex items-center justify-between">
                                        <button className="text-[#aff82a] hover:underline text-xs font-medium flex items-center gap-1">
                                            <span className="material-symbols-outlined text-[14px]">chat</span> Message
                                        </button>
                                        <span className="text-[10px] text-[#8c947b]">Active now</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    )
}

export default Department;