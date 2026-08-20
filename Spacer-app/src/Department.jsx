import Sidebar from "./partials/SidebarRouter";
import Header from "./partials/header";
import { supabase } from "./supabase";
import { useEffect, useState, useRef } from 'react';
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
    const [organizationId, setOrganizationId] = useState(null)
    const [showCreateDeptModal, setShowCreateDeptModal] = useState(false)
    const [newDeptName, setNewDeptName] = useState("")
    const [showAddMemberModal, setShowAddMemberModal] = useState(false)
    const [orgUsers, setOrgUsers] = useState([])
    const [selectedUserId, setSelectedUserId] = useState("")
    const [selectedRole, setSelectedRole] = useState("member")
    const [actionSaving, setActionSaving] = useState(false)

    useEffect(() => {
        const init = async () => {
            try {
                const { data: authData } = await supabase.auth.getUser()
                const uid = authData?.user?.id
                if (!uid) { setLoading(false); return }
                setUserId(uid)

                // Query DB user to get organization_id
                const { data: dbUser } = await supabase
                    .from("users")
                    .select("organization_id")
                    .eq("id", uid)
                    .maybeSingle();

                let orgId = dbUser?.organization_id || authData?.user?.user_metadata?.organization_id;
                
                if (!orgId && membershipData?.team_space_id) {
                    const { data: tsData } = await supabase
                        .from("team_spaces")
                        .select("organization_id")
                        .eq("id", membershipData.team_space_id)
                        .maybeSingle();
                    orgId = tsData?.organization_id;
                }

                setOrganizationId(orgId);

                if (isSuperAdmin) {
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

        if (!activeTeam || activeTeam.id !== teamId) {
            const { data: teamSpace } = await supabase
                .from("team_spaces")
                .select("id, name")
                .eq("id", teamId)
                .maybeSingle();
            if (teamSpace) {
                setActiveTeam(teamSpace);
            } else {
                setActiveTeam({ id: teamId, name: "Your Department" });
            }
        }

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

    const handleCreateDept = async (e) => {
        e.preventDefault();
        if (!canManage) {
            alert("Only admins or super admins can create departments.");
            return;
        }
        if (!newDeptName.trim() || !organizationId) return;
        setActionSaving(true);
        try {
            const { data, error } = await supabase
                .from("team_spaces")
                .insert({ name: newDeptName.trim(), organization_id: organizationId })
                .select()
                .single();

            if (error) {
                alert("Error creating department: " + error.message);
            } else {
                setAllTeams(prev => [...prev, data]);
                setActiveTeam(data);
                await fetchTeamMembers(data.id);
                setShowCreateDeptModal(false);
                setNewDeptName("");
            }
        } catch (err) {
            console.error("Create department error:", err);
        } finally {
            setActionSaving(false);
        }
    };

    const handleDeleteDept = async (teamId) => {
        if (!teamId) return;
        if (!canManage) {
            alert("Only admins or super admins can delete departments.");
            return;
        }
        if (!window.confirm("Are you sure you want to delete this department? This will delete all team memberships as well.")) return;
        setActionSaving(true);
        try {
            const { error } = await supabase
                .from("team_spaces")
                .delete()
                .eq("id", teamId);

            if (error) {
                alert("Error deleting department: " + error.message);
            } else {
                const updated = allTeams.filter(t => t.id !== teamId);
                setAllTeams(updated);
                if (updated.length > 0) {
                    setActiveTeam(updated[0]);
                    await fetchTeamMembers(updated[0].id);
                } else {
                    setActiveTeam(null);
                    setMem_info([]);
                }
            }
        } catch (err) {
            console.error("Delete department error:", err);
        } finally {
            setActionSaving(false);
        }
    };

    useEffect(() => {
        if (showAddMemberModal && organizationId) {
            const fetchOrgUsers = async () => {
                const { data, error } = await supabase
                    .from("users")
                    .select("id, name, email")
                    .eq("organization_id", organizationId);
                
                if (!error && data) {
                    const activeMemberIds = new Set(mem_info.map(m => m.user_id));
                    const available = data.filter(u => !activeMemberIds.has(u.id));
                    setOrgUsers(available);
                    if (available.length > 0) {
                        setSelectedUserId(available[0].id);
                    } else {
                        setSelectedUserId("");
                    }
                }
            };
            fetchOrgUsers();
        }
    }, [showAddMemberModal, organizationId, mem_info]);

    const handleAddMember = async (e) => {
        e.preventDefault();
        if (!canManage) {
            alert("Only admins or super admins can add members.");
            return;
        }
        if (!selectedUserId || !activeTeam?.id) return;
        setActionSaving(true);
        try {
            const { error } = await supabase
                .from("memberships")
                .insert({
                    user_id: selectedUserId,
                    team_space_id: activeTeam.id,
                    role: selectedRole
                });

          if (error) {
              alert("Error adding member: " + error.message);
          } else {
              await fetchTeamMembers(activeTeam.id);
              setShowAddMemberModal(false);
          }
      } catch (err) {
          console.error("Add member error:", err);
      } finally {
          setActionSaving(false);
      }
  };

  const handleRemoveMember = async (targetUserId) => {
      if (!targetUserId || !activeTeam?.id) return;
      if (!canManage) {
          alert("Only admins or super admins can remove members.");
          return;
      }
      if (!window.confirm("Are you sure you want to remove this member from the department?")) return;
      try {
          const { error } = await supabase
              .from("memberships")
              .delete()
              .eq("user_id", targetUserId)
              .eq("team_space_id", activeTeam.id);

          if (error) {
              alert("Error removing member: " + error.message);
          } else {
              await fetchTeamMembers(activeTeam.id);
          }
      } catch (err) {
          console.error("Remove member error:", err);
      }
  };

    const handleOpenChat = (recipient) => {
        // Dispatch custom event to notify SidebarRouter's global chat widget
        const event = new CustomEvent("open_coworker_chat", { detail: recipient });
        window.dispatchEvent(event);
    };

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
                            <button 
                                onClick={() => setShowAddMemberModal(true)}
                                className="px-4 py-2 bg-[#5b644d] hover:bg-[#6c765c] text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition-all cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[18px]">person_add</span>
                                Add Member
                            </button>
                            {canManage && (
                                <button 
                                    onClick={() => setShowCreateDeptModal(true)}
                                    className="px-4 py-2 bg-[#aff82a] text-[#1C1F26] hover:bg-[#9de022] text-xs font-semibold rounded-xl flex items-center gap-2 transition-all cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[18px]">add_circle</span>
                                    Add Department
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Superadmin Team Switcher Tabs */}
                {isSuperAdmin && (
                    <div className="flex items-center justify-between gap-4 flex-wrap pb-2 border-b border-[#2D3139]">
                        {allTeams.length > 0 && (
                            <div className="flex items-center gap-2 flex-wrap">
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
                        {activeTeam && (
                            <button 
                                onClick={() => handleDeleteDept(activeTeam.id)}
                                disabled={actionSaving}
                                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-950/40 text-red-400 border border-red-500/20 hover:bg-red-950/60 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                            >
                                <span className="material-symbols-outlined text-[14px]">delete</span>
                                Delete Department
                            </button>
                        )}
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
                                    <button 
                                        onClick={() => handleOpenChat(member)}
                                        className="text-[#aff82a] hover:underline text-xs font-medium flex items-center gap-1 cursor-pointer"
                                    >
                                        <span className="material-symbols-outlined text-[14px]">chat</span> Message
                                    </button>
                                    <div className="flex items-center gap-3">
                                        {canManage && (
                                            <button 
                                                onClick={() => handleRemoveMember(member.user_id)}
                                                className="text-red-400 hover:text-red-300 text-xs font-medium flex items-center gap-0.5 cursor-pointer"
                                            >
                                                <span className="material-symbols-outlined text-[14px]">person_remove</span> Remove
                                            </button>
                                        )}
                                        <span className="text-[10px] text-[#8c947b]">Active now</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </main>

        {/* Create Department Modal */}
        {showCreateDeptModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-md">
                <div className="bg-[#191c21] rounded-2xl p-6 max-w-md w-full space-y-4 border border-[#2D3139] shadow-2xl animate-scaleIn">
                    <div className="flex items-center justify-between border-b border-[#2D3139]/30 pb-3">
                        <h3 className="text-lg font-bold text-[#aff82a]">Create New Department</h3>
                        <button onClick={() => setShowCreateDeptModal(false)} className="text-[#8c947b] hover:text-white cursor-pointer">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>
                    <form onSubmit={handleCreateDept} className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-[#8c947b] uppercase tracking-wider mb-2">Department Name</label>
                            <input
                                type="text"
                                required
                                placeholder="e.g. Design & Creative"
                                className="w-full bg-[#0F1115] border border-[#2D3139] rounded-xl px-4 py-2.5 text-white font-body-md focus:ring-1 focus:ring-[#aff82a] focus:outline-none placeholder-[#8c947b]/40"
                                value={newDeptName}
                                onChange={(e) => setNewDeptName(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowCreateDeptModal(false)}
                                className="px-4 py-2 border border-[#2D3139] rounded-xl text-xs font-semibold text-[#8c947b] hover:text-white hover:bg-[#2D3139] transition-all cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={actionSaving}
                                className="px-4 py-2 bg-[#aff82a] text-[#1C1F26] hover:bg-[#9de022] rounded-xl text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer"
                            >
                                {actionSaving ? "Creating..." : "Create Department"}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )}

        {/* Add Member Modal */}
        {showAddMemberModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-md">
                <div className="bg-[#191c21] rounded-2xl p-6 max-w-md w-full space-y-4 border border-[#2D3139] shadow-2xl animate-scaleIn">
                    <div className="flex items-center justify-between border-b border-[#2D3139]/30 pb-3">
                        <h3 className="text-lg font-bold text-[#aff82a]">Add Member to Department</h3>
                        <button onClick={() => setShowAddMemberModal(false)} className="text-[#8c947b] hover:text-white cursor-pointer">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>
                    {orgUsers.length === 0 ? (
                        <div className="py-6 text-center space-y-2">
                            <p className="text-white font-medium text-sm">All organization users are already members of this department.</p>
                            <button
                                type="button"
                                onClick={() => setShowAddMemberModal(false)}
                                className="px-4 py-2 border border-[#2D3139] rounded-xl text-xs font-semibold text-[#8c947b] hover:text-white transition-all cursor-pointer"
                            >
                                Close
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleAddMember} className="space-y-4">
                            <div>
                                <label className="block text-xs font-semibold text-[#8c947b] uppercase tracking-wider mb-2">Select User</label>
                                <select
                                    className="w-full bg-[#0F1115] border border-[#2D3139] rounded-xl px-4 py-2.5 text-white font-body-md focus:ring-1 focus:ring-[#aff82a] focus:outline-none"
                                    value={selectedUserId}
                                    onChange={(e) => setSelectedUserId(e.target.value)}
                                >
                                    {orgUsers.map(user => (
                                        <option key={user.id} value={user.id}>
                                            {user.name || user.email} ({user.email})
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-[#8c947b] uppercase tracking-wider mb-2">Role in Department</label>
                                <select
                                    className="w-full bg-[#0F1115] border border-[#2D3139] rounded-xl px-4 py-2.5 text-white font-body-md focus:ring-1 focus:ring-[#aff82a] focus:outline-none"
                                    value={selectedRole}
                                    onChange={(e) => setSelectedRole(e.target.value)}
                                >
                                    <option value="member">Member</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                            <div className="flex items-center justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowAddMemberModal(false)}
                                    className="px-4 py-2 border border-[#2D3139] rounded-xl text-xs font-semibold text-[#8c947b] hover:text-white hover:bg-[#2D3139] transition-all cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={actionSaving}
                                    className="px-4 py-2 bg-[#aff82a] text-[#1C1F26] hover:bg-[#9de022] rounded-xl text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer"
                                >
                                    {actionSaving ? "Adding..." : "Add Member"}
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        )}

    </div>
)
}

export default Department;