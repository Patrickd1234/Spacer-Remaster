import Sidebar from "./partials/SidebarRouter";
import Header from "./partials/header";
import { supabase, getSessionUser } from "./supabase";
import { useEffect, useState, useRef } from 'react';
import { useRole } from "./RoleContext";
import GroupChat from "./components/GroupChat";
import DepartmentSwitcher from "./partials/DepartmentSwitcher";
import { deleteWorkspaceItem } from "./workspaceDelete";

function Department() {
    const [userId, setUserId] = useState(null)
    const [userTeamId, setUserTeamId] = useState(null)
    const [allTeams, setAllTeams] = useState([])
    const [activeTeam, setActiveTeam] = useState(null)
    const [mem_info, setMem_info] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const { isSuperAdmin, isAdmin, roleLoading, membershipData, activeDepartment, orgDepartmentId, setOrgDepartment } = useRole()
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
    // Department awaiting delete confirmation ({ id, name } or null)
    const [deptToDelete, setDeptToDelete] = useState(null)
    const [deletingDept, setDeletingDept] = useState(false)
    const [deleteDeptError, setDeleteDeptError] = useState("")
    const [activeTab, setActiveTab] = useState("directory")

    useEffect(() => {
        const init = async () => {
            try {
                const sessionUser = await getSessionUser()
                const uid = sessionUser?.id
                if (!uid) { setLoading(false); return }
                setUserId(uid)

                const teamId = membershipData?.team_space_id

                // The department (name + members) only needs the membership, so it
                // loads alongside the organisation lookup instead of after it.
                // fetchTeamMembers also sets activeTeam, which titles the page.
                if (!isSuperAdmin) setUserTeamId(teamId)
                const departmentWork = isSuperAdmin ? [] : [fetchTeamMembers(teamId)]

                const orgWork = (async () => {
                    // Query DB user to get organization_id
                    const { data: dbUser } = await supabase
                        .from("users")
                        .select("organization_id")
                        .eq("id", uid)
                        .maybeSingle();

                    let orgId = dbUser?.organization_id || sessionUser?.user_metadata?.organization_id;

                    if (!orgId && teamId) {
                        const { data: tsData } = await supabase
                            .from("team_spaces")
                            .select("organization_id")
                            .eq("id", teamId)
                            .maybeSingle();
                        orgId = tsData?.organization_id;
                    }

                    setOrganizationId(orgId);
                    if (isSuperAdmin) await fetchAllTeams(orgId)
                })()

                await Promise.all([orgWork, ...departmentWork])
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


    // Super admins: follow a department change made in the sidebar
    useEffect(() => {
        if (!isSuperAdmin || !orgDepartmentId) return undefined
        const team = allTeams.find(t => String(t.id) === orgDepartmentId)
        if (!team || String(activeTeam?.id) === orgDepartmentId) return undefined
        let cancelled = false
        const followSidebar = async () => {
            await null
            if (cancelled) return
            setActiveTeam(team)
            setLoading(true)
            await fetchTeamMembers(team.id)
            if (!cancelled) setLoading(false)
        }
        followSidebar()
        return () => { cancelled = true }
    }, [isSuperAdmin, orgDepartmentId, allTeams])

    const fetchAllTeams = async (orgId) => {
        let teamQuery = supabase.from("team_spaces").select("id, name")
        if (orgId) teamQuery = teamQuery.eq("organization_id", orgId)
        
        const { data: teams, error } = await teamQuery

        if (error) { console.warn("team_spaces error:", error); return }

        setAllTeams(teams || [])
        if (teams && teams.length > 0) {
            // Open the department chosen in the super admin sidebar, if any
            const team = teams.find(t => String(t.id) === orgDepartmentId) || teams[0]
            setActiveTeam(team)
            setOrgDepartment(team.id)
            await fetchTeamMembers(team.id)
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
        setOrgDepartment(team.id) // keeps the super admin sidebar in step
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

    // Opens the confirmation modal; the delete itself runs in confirmDeleteDept
    const handleDeleteDept = (teamId) => {
        if (!teamId || !canManage) return;
        const name = allTeams.find(t => t.id === teamId)?.name || "this department";
        setDeleteDeptError("");
        setDeptToDelete({ id: teamId, name });
    };

    const closeDeleteDept = () => {
        if (deletingDept) return;
        setDeptToDelete(null);
        setDeleteDeptError("");
    };

    const confirmDeleteDept = async () => {
        if (!deptToDelete) return;
        const teamId = deptToDelete.id;
        setDeletingDept(true);
        setDeleteDeptError("");
        try {
            // Server-side delete: also removes stored files and chat channels
            const { error } = await deleteWorkspaceItem("department", teamId);
            if (error) {
                setDeleteDeptError(`Couldn't delete the department: ${error}`);
                return;
            }
            const updated = allTeams.filter(t => t.id !== teamId);
            setAllTeams(updated);
            setDeptToDelete(null);
            if (updated.length > 0) {
                setActiveTeam(updated[0]);
                setOrgDepartment(updated[0].id);
                await fetchTeamMembers(updated[0].id);
            } else {
                setActiveTeam(null);
                setOrgDepartment(null);
                setMem_info([]);
            }
        } catch (err) {
            console.error("Delete department error:", err);
            setDeleteDeptError("Couldn't delete the department. Please try again.");
        } finally {
            setDeletingDept(false);
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

    // Admins manage only departments where they are an admin (not ones they merely belong to)
    const isAdminOfActiveDepartment = ["admin", "super_admin", "superadmin"].includes(activeDepartment?.role)
    const canManage = isSuperAdmin || (isAdmin && isAdminOfActiveDepartment)

const filteredMembers = mem_info.filter(m =>
    !searchQuery ||
    (m.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
    (m.email || "").toLowerCase().includes(searchQuery.toLowerCase())
)

const pageTitle = isSuperAdmin
    ? (activeTeam ? activeTeam.name : "All Teams")
    : (activeTeam?.name || "Department Directory")
// Until the department is known, show a placeholder rather than a fallback title
const isTitleLoading = roleLoading || (loading && !activeTeam)

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
                            {isTitleLoading
                                ? <span className="inline-block h-3 w-24 rounded bg-[#2D3139] animate-pulse" aria-hidden="true" />
                                : <span className="text-white font-medium">{pageTitle}</span>}
                        </div>
                        {isTitleLoading
                            ? <h1 className="h-8 w-56 rounded-lg bg-[#2D3139] animate-pulse" aria-label="Loading department" />
                            : <h1 className="text-2xl font-bold text-white">{pageTitle}</h1>}
                        <p className="text-[#8c947b] text-sm mt-1">
                            {filteredMembers.length} member{filteredMembers.length !== 1 ? "s" : ""} {isSuperAdmin && activeTeam ? `assigned to ${activeTeam.name}` : "in your department team"}
                        </p>
                        {!isSuperAdmin && (
                            <div className="mt-3">
                                <DepartmentSwitcher />
                            </div>
                        )}
                    </div>

                    {canManage && (
                        <div className="flex items-center gap-3">
                            <button 
                                onClick={() => { setAddMemberTab("existing"); setInviteError(""); setInviteSuccess(""); setShowAddMemberModal(true); }}
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
                                ? "bg-[#aff82a] text-[#1C1F26] font-bold shadow-sm"
                                : "text-[#8c947b] hover:text-white hover:bg-[#2D3139]/50"
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
        {/* ── Delete department confirmation modal ── */}
        {deptToDelete && (
            <div
                className="fixed inset-0 z-[150] flex items-center justify-center p-4"
                style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
                onClick={closeDeleteDept}
            >
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="delete-dept-title"
                    className="bg-[#1C1F26] border border-[#2D3139] rounded-2xl shadow-2xl w-full max-w-sm p-6"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 mx-auto mb-4">
                        <span className="material-symbols-outlined text-red-400 text-[32px]" aria-hidden="true">delete_forever</span>
                    </div>

                    <h2 id="delete-dept-title" className="text-white font-bold text-[18px] text-center mb-2">Delete this department?</h2>
                    <p className="text-[#8c947b] text-[13px] text-center mb-1">You are about to permanently delete</p>
                    <p className="text-white font-bold text-[15px] text-center mb-3">"{deptToDelete.name}"</p>
                    <p className="text-[#8c947b] text-[12px] text-center mb-6">
                        Every project in it, with all their tasks, files and chat channels, will also be removed, and everyone's membership of the department ends. This cannot be undone.
                    </p>
                    {deleteDeptError && (
                        <p role="alert" className="text-red-400 text-[12px] text-center -mt-3 mb-4">{deleteDeptError}</p>
                    )}

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={closeDeleteDept}
                            disabled={deletingDept}
                            className="flex-1 py-2.5 rounded-xl border border-[#2D3139] text-[#8c947b] hover:bg-[#2D3139] hover:text-white text-[13px] font-semibold transition-colors cursor-pointer disabled:opacity-50"
                        >
                            No, keep it
                        </button>
                        <button
                            type="button"
                            onClick={confirmDeleteDept}
                            disabled={deletingDept}
                            className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-[13px] font-bold transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            {deletingDept ? (
                                <><span className="material-symbols-outlined text-[16px] animate-spin" aria-hidden="true">progress_activity</span>Deleting…</>
                            ) : (
                                <><span className="material-symbols-outlined text-[16px]" aria-hidden="true">delete</span>Yes, delete</>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        )}

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
                        <h3 className="text-lg font-bold text-[#aff82a]">Add Member{activeTeam ? ` to ${activeTeam.name}` : ""}</h3>
                        <button onClick={closeAddMemberModal} className="text-[#8c947b] hover:text-white cursor-pointer">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    {/* Tab switcher: existing Spacer user vs. brand-new email invite */}
                    <div className="flex gap-1 bg-[#0F1115] p-1 rounded-xl border border-[#2D3139]">
                        <button
                            type="button"
                            onClick={() => switchAddMemberTab("existing")}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${addMemberTab === "existing" ? "bg-[#aff82a] text-[#1C1F26]" : "text-[#8c947b] hover:text-white"}`}
                        >
                            Existing User
                        </button>
                        <button
                            type="button"
                            onClick={() => switchAddMemberTab("invite")}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${addMemberTab === "invite" ? "bg-[#aff82a] text-[#1C1F26]" : "text-[#8c947b] hover:text-white"}`}
                        >
                            Invite New User
                        </button>
                    </div>

                    <form onSubmit={handleAddOrInvite} className="space-y-4">
                        {addMemberTab === "existing" ? (
                            orgUsers.length === 0 ? (
                                <p className="text-white font-medium text-sm py-6 text-center">
                                    All organization users are already members of this department.
                                </p>
                            ) : (
                                <div>
                                    <label className="block text-xs font-semibold text-[#8c947b] uppercase tracking-wider mb-2">Select User</label>
                                    <select
                                        className="w-full bg-[#0F1115] border border-[#2D3139] rounded-xl px-4 py-2.5 text-white font-body-md focus:ring-1 focus:ring-[#aff82a] focus:outline-none"
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
                                <label className="block text-xs font-semibold text-[#8c947b] uppercase tracking-wider mb-2">Email Address</label>
                                <input
                                    type="email"
                                    required
                                    placeholder="name@company.com"
                                    className="w-full bg-[#0F1115] border border-[#2D3139] rounded-xl px-4 py-2.5 text-white font-body-md focus:ring-1 focus:ring-[#aff82a] focus:outline-none placeholder-[#8c947b]/40"
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                />
                                <p className="text-[11px] text-[#8c947b] mt-2 leading-relaxed">
                                    They'll get an email with a link to create a password. Once they do, they're
                                    signed in automatically — already added to this department with the role below.
                                </p>
                            </div>
                        )}

                        {(addMemberTab === "invite" || orgUsers.length > 0) && (
                            <div>
                                <label className="block text-xs font-semibold text-[#8c947b] uppercase tracking-wider mb-2">Role in Department</label>
                                <select
                                    className="w-full bg-[#0F1115] border border-[#2D3139] rounded-xl px-4 py-2.5 text-white font-body-md focus:ring-1 focus:ring-[#aff82a] focus:outline-none"
                                    value={inviteRole}
                                    onChange={(e) => setInviteRole(e.target.value)}
                                >
                                    <option value="member">Member</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>
                        )}

                        {inviteError && (
                            <p className="text-xs text-red-400 flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[14px]">error</span>
                                {inviteError}
                            </p>
                        )}
                        {inviteSuccess && (
                            <p className="text-xs text-[#aff82a] flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                {inviteSuccess}
                            </p>
                        )}

                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={closeAddMemberModal}
                                className="px-4 py-2 border border-[#2D3139] rounded-xl text-xs font-semibold text-[#8c947b] hover:text-white hover:bg-[#2D3139] transition-all cursor-pointer"
                            >
                                Cancel
                            </button>
                            {!(addMemberTab === "existing" && orgUsers.length === 0) && (
                                <button
                                    type="submit"
                                    disabled={inviteSending}
                                    className="px-4 py-2 bg-[#aff82a] text-[#1C1F26] hover:bg-[#9de022] rounded-xl text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer"
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