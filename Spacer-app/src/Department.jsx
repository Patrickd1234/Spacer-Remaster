import Sidebar from "./partials/SidebarRouter";
import Header from "./partials/header";
import { supabase } from "./supabase";
import { useEffect, useState, useRef } from 'react';
import { useRole } from "./RoleContext";
import GroupChat from "./components/GroupChat";

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
    const [addMemberTab, setAddMemberTab] = useState("existing") // "existing" | "invite"
    const [inviteEmail, setInviteEmail] = useState("")
    const [inviteRole, setInviteRole] = useState("member")
    const [inviteSending, setInviteSending] = useState(false)
    const [inviteError, setInviteError] = useState("")
    const [inviteSuccess, setInviteSuccess] = useState("")
    const [actionSaving, setActionSaving] = useState(false)
    const [activeTab, setActiveTab] = useState("directory")

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
                    if (addMemberTab === "existing") {
                        setInviteEmail(available.length > 0 ? available[0].email : "");
                    }
                }
            };
            fetchOrgUsers();
        }
    }, [showAddMemberModal, organizationId, mem_info]);

    const closeAddMemberModal = () => {
        setShowAddMemberModal(false);
        setAddMemberTab("existing");
        setInviteEmail("");
        setInviteRole("member");
        setInviteError("");
        setInviteSuccess("");
    };

    const switchAddMemberTab = (tab) => {
        setAddMemberTab(tab);
        setInviteError("");
        setInviteSuccess("");
        setInviteEmail(tab === "existing" ? (orgUsers[0]?.email || "") : "");
    };

    // Adds an existing Spacer user straight to the department, OR invites someone
    // by email who may not have a Spacer account yet — both go through the same
    // Edge Function so permission checks and notifications happen in one place,
    // server-side, instead of being duplicated (and potentially bypassed) here.
    const handleAddOrInvite = async (e) => {
        e.preventDefault();
        setInviteError("");
        setInviteSuccess("");

        if (!canManage) {
            alert("Only admins or super admins can add members.");
            return;
        }
        if (!activeTeam?.id) return;

        const email = (inviteEmail || "").trim().toLowerCase();
        if (!email) {
            setInviteError(addMemberTab === "existing" ? "Select a user to add." : "Enter an email address.");
            return;
        }
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(email)) {
            setInviteError("Enter a valid email address.");
            return;
        }

        setInviteSending(true);
        try {
            // supabase-js automatically attaches the current session's access
            // token as the Authorization header here — the Edge Function
            // re-derives who's calling (and re-checks their role) from that
            // token server-side. It never trusts a role/permission claim sent
            // in the request body.
            const { data, error } = await supabase.functions.invoke("invite-department-member", {
                body: {
                    email,
                    role: inviteRole,
                    team_space_id: activeTeam.id,
                    organization_id: organizationId,
                },
            });

            if (error) throw error;

            if (data?.status === "added_existing") {
                setInviteSuccess(`${email} has been added to ${activeTeam.name} and notified by email.`);
                await fetchTeamMembers(activeTeam.id);
                setTimeout(() => closeAddMemberModal(), 1600);
            } else if (data?.status === "invited_new") {
                setInviteSuccess(`Invite sent to ${email}. Once they set a password, they'll land straight in ${activeTeam.name} as ${inviteRole}.`);
                setInviteEmail("");
            } else {
                setInviteSuccess("Done.");
            }
        } catch (err) {
            console.error("Add/invite member error:", err);
            const message = err?.context?.body?.error || err?.message || "Something went wrong. Please try again.";
            setInviteError(message);
        } finally {
            setInviteSending(false);
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
    <div className="bg-background min-h-screen text-on-surface font-sans antialiased flex flex-col">
        <Sidebar onCollapsedChange={setSidebarCollapsed} />
        <Header />
        <main className={`${sidebarCollapsed ? "ml-[72px]" : "ml-[260px]"} flex-1 flex flex-col pt-16 transition-all duration-300 ease-out`}>

            {/* Top Controls Header */}
            <div className="bg-surface-container-lowest border-b border-outline-variant px-8 py-4 flex items-center justify-between sticky top-16 z-30">
                <div className="relative w-full max-w-md">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">search</span>
                    <input
                        className="w-full bg-background border border-outline-variant rounded-xl py-2 pl-10 pr-4 text-on-surface placeholder:text-on-surface-variant text-sm focus:outline-none focus:border-primary-fixed"
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
                        <div className="flex items-center gap-2 text-on-surface-variant text-xs mb-1">
                            <span className="material-symbols-outlined text-[16px]">groups</span>
                            <span>/</span>
                            <span className="text-on-surface font-medium">{pageTitle}</span>
                        </div>
                        <h1 className="text-2xl font-bold text-on-surface">{pageTitle}</h1>
                        <p className="text-on-surface-variant text-sm mt-1">
                            {filteredMembers.length} member{filteredMembers.length !== 1 ? "s" : ""} {isSuperAdmin && activeTeam ? `assigned to ${activeTeam.name}` : "in your department team"}
                        </p>
                    </div>

                    {canManage && (
                        <div className="flex items-center gap-3">
                            <button 
                                onClick={() => { setAddMemberTab("existing"); setInviteError(""); setInviteSuccess(""); setShowAddMemberModal(true); }}
                                className="px-4 py-2 bg-surface-container-high hover:bg-surface-container-highest text-on-surface text-xs font-semibold rounded-xl flex items-center gap-2 transition-all cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[18px]">person_add</span>
                                Add Member
                            </button>
                            {canManage && (
                                <button 
                                    onClick={() => setShowCreateDeptModal(true)}
                                    className="px-4 py-2 bg-primary-container text-on-primary hover:bg-primary-fixed-dim text-xs font-semibold rounded-xl flex items-center gap-2 transition-all cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[18px]">add_circle</span>
                                    Add Department
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* Tab Navigation */}
                <div className="flex items-center gap-sm mt-xl mb-lg">
                    {[
                        { id: "directory", label: "Directory", icon: "groups" },
                        { id: "messages", label: "Messages", icon: "chat" }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm transition-colors cursor-pointer ${activeTab === tab.id
                                ? "bg-primary-container text-on-primary font-bold shadow-sm"
                                : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest/50"
                                }`}
                        >
                            <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {activeTab === "directory" && (
                    <>
                        {/* Superadmin Team Switcher Tabs */}
                {isSuperAdmin && (
                    <div className="flex items-center justify-between gap-4 flex-wrap pb-2 border-b border-outline-variant">
                        {allTeams.length > 0 && (
                            <div className="flex items-center gap-2 flex-wrap">
                                {allTeams.map(team => (
                                    <button
                                        key={team.id}
                                        onClick={() => switchTeam(team)}
                                        className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                                            activeTeam?.id === team.id
                                                ? "bg-surface-container-high text-on-surface"
                                                : "bg-surface-container text-on-surface-variant border border-outline-variant hover:text-on-surface"
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
                                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-error-container/40 text-error border border-error/20 hover:bg-error-container/60 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
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
                            <div key={i} className="bg-surface-container border border-outline-variant rounded-xl p-5 h-44 animate-pulse">
                                <div className="h-10 w-10 bg-surface-container-high rounded-full mb-4" />
                                <div className="h-4 w-32 bg-surface-container-high rounded mb-2" />
                                <div className="h-3 w-24 bg-surface-container-high rounded" />
                            </div>
                        ))}
                    </div>
                ) : filteredMembers.length === 0 ? (
                    <div className="bg-surface-container border border-outline-variant rounded-xl p-12 flex flex-col items-center justify-center text-center min-h-[250px] gap-3">
                        <span className="material-symbols-outlined text-4xl text-on-surface-variant">person_search</span>
                        <p className="text-on-surface font-semibold text-base">No team members found</p>
                        <p className="text-on-surface-variant text-xs max-w-sm">
                            {searchQuery ? "No members matched your search query." : "No team members are assigned to this department yet."}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredMembers.map((member) => (
                            <div key={member.user_id || member.id} className="bg-surface-container border border-outline-variant rounded-xl p-5 flex flex-col justify-between hover:border-outline transition-all group">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="w-12 h-12 rounded-xl bg-surface-container-high border border-outline-variant flex items-center justify-center font-bold text-on-surface text-lg">
                                        {(member.name || member.email || "?").charAt(0).toUpperCase()}
                                    </div>
                                    <span className="bg-surface-container-high/20 text-primary-fixed border border-[#5b644d]/30 text-[10px] font-bold px-2 py-0.5 rounded uppercase">
                                        {member.membershipRole || member.role || "Member"}
                                    </span>
                                </div>
                                <div>
                                    <h4 className="text-on-surface font-semibold text-base">
                                        {member.name || "Team Member"}
                                    </h4>
                                    <p className="text-on-surface-variant text-xs truncate mt-0.5">
                                        {member.email || "user@spacers.com"}
                                    </p>
                                </div>
                                <div className="mt-6 pt-4 border-t border-outline-variant flex items-center justify-between">
                                    <button 
                                        onClick={() => handleOpenChat(member)}
                                        className="text-primary-fixed hover:underline text-xs font-medium flex items-center gap-1 cursor-pointer"
                                    >
                                        <span className="material-symbols-outlined text-[14px]">chat</span> Message
                                    </button>
                                    <div className="flex items-center gap-3">
                                        {canManage && (
                                            <button 
                                                onClick={() => handleRemoveMember(member.user_id)}
                                                className="text-error hover:text-error text-xs font-medium flex items-center gap-0.5 cursor-pointer"
                                            >
                                                <span className="material-symbols-outlined text-[14px]">person_remove</span> Remove
                                            </button>
                                        )}
                                        <span className="text-[10px] text-on-surface-variant">Active now</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                </>
                )}

                {/* Messages Tab */}
                {activeTab === "messages" && activeTeam && (
                    <div className="h-full">
                        <GroupChat 
                            departmentId={activeTeam.id} 
                            currentUserId={userId} 
                            members={mem_info} 
                        />
                    </div>
                )}
            </div>
        </main>

        {/* Create Department Modal */}
        {showCreateDeptModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-md">
                <div className="bg-surface-container rounded-2xl p-6 max-w-md w-full space-y-4 border border-outline-variant shadow-2xl animate-scaleIn">
                    <div className="flex items-center justify-between border-b border-outline-variant/30 pb-3">
                        <h3 className="text-lg font-bold text-primary-fixed">Create New Department</h3>
                        <button onClick={() => setShowCreateDeptModal(false)} className="text-on-surface-variant hover:text-on-surface cursor-pointer">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>
                    <form onSubmit={handleCreateDept} className="space-y-4">
                        <div>
                            <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Department Name</label>
                            <input
                                type="text"
                                required
                                placeholder="e.g. Design & Creative"
                                className="w-full bg-background border border-outline-variant rounded-xl px-4 py-2.5 text-on-surface font-body-md focus:ring-1 focus:ring-[#aff82a] focus:outline-none placeholder:text-on-surface-variant/40"
                                value={newDeptName}
                                onChange={(e) => setNewDeptName(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setShowCreateDeptModal(false)}
                                className="px-4 py-2 border border-outline-variant rounded-xl text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-all cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={actionSaving}
                                className="px-4 py-2 bg-primary-container text-on-primary hover:bg-primary-fixed-dim rounded-xl text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer"
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
                <div className="bg-surface-container rounded-2xl p-6 max-w-md w-full space-y-4 border border-outline-variant shadow-2xl animate-scaleIn">
                    <div className="flex items-center justify-between border-b border-outline-variant/30 pb-3">
                        <h3 className="text-lg font-bold text-primary-fixed">Add Member{activeTeam ? ` to ${activeTeam.name}` : ""}</h3>
                        <button onClick={closeAddMemberModal} className="text-on-surface-variant hover:text-on-surface cursor-pointer">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    {/* Tab switcher: existing Spacer user vs. brand-new email invite */}
                    <div className="flex gap-1 bg-background p-1 rounded-xl border border-outline-variant">
                        <button
                            type="button"
                            onClick={() => switchAddMemberTab("existing")}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${addMemberTab === "existing" ? "bg-primary-container text-on-primary" : "text-on-surface-variant hover:text-on-surface"}`}
                        >
                            Existing User
                        </button>
                        <button
                            type="button"
                            onClick={() => switchAddMemberTab("invite")}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${addMemberTab === "invite" ? "bg-primary-container text-on-primary" : "text-on-surface-variant hover:text-on-surface"}`}
                        >
                            Invite New User
                        </button>
                    </div>

                    <form onSubmit={handleAddOrInvite} className="space-y-4">
                        {addMemberTab === "existing" ? (
                            orgUsers.length === 0 ? (
                                <p className="text-on-surface font-medium text-sm py-6 text-center">
                                    All organization users are already members of this department.
                                </p>
                            ) : (
                                <div>
                                    <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Select User</label>
                                    <select
                                        className="w-full bg-background border border-outline-variant rounded-xl px-4 py-2.5 text-on-surface font-body-md focus:ring-1 focus:ring-[#aff82a] focus:outline-none"
                                        value={inviteEmail}
                                        onChange={(e) => setInviteEmail(e.target.value)}
                                    >
                                        {orgUsers.map(user => (
                                            <option key={user.id} value={user.email}>
                                                {user.name || user.email} ({user.email})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )
                        ) : (
                            <div>
                                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Email Address</label>
                                <input
                                    type="email"
                                    required
                                    placeholder="name@company.com"
                                    className="w-full bg-background border border-outline-variant rounded-xl px-4 py-2.5 text-on-surface font-body-md focus:ring-1 focus:ring-[#aff82a] focus:outline-none placeholder:text-on-surface-variant/40"
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                />
                                <p className="text-[11px] text-on-surface-variant mt-2 leading-relaxed">
                                    They'll get an email with a link to create a password. Once they do, they're
                                    signed in automatically — already added to this department with the role below.
                                </p>
                            </div>
                        )}

                        {(addMemberTab === "invite" || orgUsers.length > 0) && (
                            <div>
                                <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Role in Department</label>
                                <select
                                    className="w-full bg-background border border-outline-variant rounded-xl px-4 py-2.5 text-on-surface font-body-md focus:ring-1 focus:ring-[#aff82a] focus:outline-none"
                                    value={inviteRole}
                                    onChange={(e) => setInviteRole(e.target.value)}
                                >
                                    <option value="member">Member</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                        )}

                        {inviteError && (
                            <p className="text-xs text-error flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[14px]">error</span>
                                {inviteError}
                            </p>
                        )}
                        {inviteSuccess && (
                            <p className="text-xs text-primary-fixed flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                {inviteSuccess}
                            </p>
                        )}

                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={closeAddMemberModal}
                                className="px-4 py-2 border border-outline-variant rounded-xl text-xs font-semibold text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-all cursor-pointer"
                            >
                                Cancel
                            </button>
                            {!(addMemberTab === "existing" && orgUsers.length === 0) && (
                                <button
                                    type="submit"
                                    disabled={inviteSending}
                                    className="px-4 py-2 bg-primary-container text-on-primary hover:bg-primary-fixed-dim rounded-xl text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer"
                                >
                                    {inviteSending
                                        ? (addMemberTab === "invite" ? "Sending Invite…" : "Adding…")
                                        : (addMemberTab === "invite" ? "Send Invite" : "Add Member")}
                                </button>
                            )}
                        </div>
                    </form>
                </div>
            </div>
        )}

    </div>
)
}

export default Department;