import Sidebar from "./partials/SidebarRouter";
import Header from "./partials/header";
import { supabase, getSessionUser } from "./supabase";
import { useEffect, useState, useCallback, useRef } from 'react';
import { useLocation } from "react-router-dom";
import { useRole } from "./RoleContext";
import GroupChat from "./components/GroupChat";
import Toast from "./components/Toast";
import DepartmentSwitcher from "./partials/DepartmentSwitcher";
import CreateDepartmentModal from "./partials/CreateDepartmentModal";
import { deleteWorkspaceItem } from "./workspaceDelete";
import { createdToast, failedToast } from "./createDepartment";
import { DEPARTMENT_CREATED_EVENT } from "./appEvents";
import Select from "./components/Select";
import PlanetLoader from "./components/PlanetLoader";

function Department() {
    const [userId, setUserId] = useState(null)
    const [allTeams, setAllTeams] = useState([])
    const [activeTeam, setActiveTeam] = useState(null)
    const [mem_info, setMem_info] = useState([])
    const [loading, setLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const { isSuperAdmin, isAdmin, roleLoading, membershipData, activeDepartment, orgDepartmentId, setOrgDepartment, departments } = useRole()
    // Admins of any department switch departments from the sidebar, not the page dropdown
    const isAdminAnywhere = departments.some(d => d.role === "admin")
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [organizationId, setOrganizationId] = useState(null)
    const [showCreateDeptModal, setShowCreateDeptModal] = useState(false)
    const [toast, setToast] = useState(null)
    const closeToast = useCallback(() => setToast(null), [])
    const [showAddMemberModal, setShowAddMemberModal] = useState(false)
    const [orgUsers, setOrgUsers] = useState([])
    const [addMemberTab, setAddMemberTab] = useState("existing") // "existing" | "invite"
    const [inviteEmail, setInviteEmail] = useState("")
    const [inviteRole, setInviteRole] = useState("member")
    const [inviteSending, setInviteSending] = useState(false)
    const [inviteError, setInviteError] = useState("")
    const [inviteSuccess, setInviteSuccess] = useState("")
    // Department awaiting delete confirmation ({ id, name } or null)
    const [deptToDelete, setDeptToDelete] = useState(null)
    const [deletingDept, setDeletingDept] = useState(false)
    const [deleteDeptError, setDeleteDeptError] = useState("")
    // Member awaiting removal confirmation ({ userId, name } or null)
    const [memberToRemove, setMemberToRemove] = useState(null)
    const [removingMember, setRemovingMember] = useState(false)
    const [removeMemberError, setRemoveMemberError] = useState("")
    const [activeTab, setActiveTab] = useState("directory")
    const location = useLocation()
    const requestedTeamId = location.state?.teamSpaceId ?? null
    const requestedTeamIdRef = useRef(requestedTeamId)
    // The department whose members were asked for last. Switching quickly starts
    // several loads; only the newest one may fill the page or end the loading state.
    const teamRequestRef = useRef(null)

    useEffect(() => {
        const init = async () => {
            try {
                const sessionUser = await getSessionUser()
                const uid = sessionUser?.id
                if (!uid) { setLoading(false); return }
                setUserId(uid)

                const teamId = membershipData?.team_space_id
                // Members switching department: show the loading state, not the last department's people
                if (!isSuperAdmin) setLoading(true)

                // The department (name + members) only needs the membership, so it
                // loads alongside the organisation lookup instead of after it.
                // fetchTeamMembers also sets activeTeam, which titles the page.
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
                // A newer switch is still loading: leave the loading state to it
                const teamId = membershipData?.team_space_id ?? null
                if (isSuperAdmin || teamRequestRef.current === teamId) setLoading(false)
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
            if (!cancelled && teamRequestRef.current === team.id) setLoading(false)
        }
        followSidebar()
        return () => { cancelled = true }
    }, [isSuperAdmin, orgDepartmentId, allTeams])

    async function fetchAllTeams(orgId) {
        let teamQuery = supabase.from("team_spaces").select("id, name")
        if (orgId) teamQuery = teamQuery.eq("organization_id", orgId)
        
        const { data: teams, error } = await teamQuery

        if (error) { console.warn("team_spaces error:", error); return }

        setAllTeams(teams || [])
        if (teams && teams.length > 0) {
            // The sidebar's Team Spaces passes the department to open; otherwise reopen the last one chosen
            const requested = teams.find(t => String(t.id) === String(requestedTeamIdRef.current))
            const remembered = teams.find(t => String(t.id) === orgDepartmentId)
            const team = requested || remembered || teams[0]
            setActiveTeam(team)
            setOrgDepartment(team.id)
            await fetchTeamMembers(team.id)
        }
    }

    async function fetchTeamMembers(teamId) {
        const requested = teamId ?? null
        teamRequestRef.current = requested
        const isSuperseded = () => teamRequestRef.current !== requested
        if (!teamId) { setMem_info([]); return }

        if (!activeTeam || activeTeam.id !== teamId) {
            const { data: teamSpace } = await supabase
                .from("team_spaces")
                .select("id, name")
                .eq("id", teamId)
                .maybeSingle();
            if (isSuperseded()) return
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

        if (isSuperseded()) return
        if (mErr) { console.warn("memberships error:", mErr); setMem_info([]); return }
        if (!memberships || memberships.length === 0) { setMem_info([]); return }

        // Everyone's profile in one request (it was one request per person)
        const { data: profiles, error: pErr } = await supabase
            .from("users")
            .select("*")
            .in("id", memberships.map((row) => row.user_id))
        if (isSuperseded()) return
        if (pErr) console.warn("member profiles error:", pErr)

        const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]))
        setMem_info(memberships.map((row) => {
            const profile = profileById.get(row.user_id)
            return {
                ...row,
                ...(profile || {}),
                membershipRole: row.role,
                profileRole: profile?.role ?? row.role,
            }
        }))
    }

    const switchTeam = async (team) => {
        setActiveTeam(team)
        setOrgDepartment(team.id) // keeps the super admin sidebar in step
        setLoading(true)
        await fetchTeamMembers(team.id)
        if (teamRequestRef.current === team.id) setLoading(false)
    }

    // The modal has already created the department and added its people
    const handleDeptCreated = async ({ department, failedEmails }) => {
        setShowCreateDeptModal(false);
        setToast(createdToast(failedEmails));
        setAllTeams(prev => prev.some(t => t.id === department.id) ? prev : [...prev, department]);
        setActiveTeam(department);
        await fetchTeamMembers(department.id);
    };

    // Picking another department in the sidebar while this page is already open
    useEffect(() => {
        requestedTeamIdRef.current = requestedTeamId
        if (!isSuperAdmin || !requestedTeamId) return
        const team = allTeams.find(t => String(t.id) === String(requestedTeamId))
        // Syncing to a navigation (external to this component), so updating state here is intended
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (team && String(team.id) !== String(activeTeam?.id)) switchTeam(team)
        // Only react to a new request from the sidebar, not to team list changes
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.key])

    // Departments created from the header's Create menu while this page is open
    useEffect(() => {
        const handleCreatedElsewhere = (e) => {
            const department = e.detail;
            if (department) setAllTeams(prev => prev.some(t => t.id === department.id) ? prev : [...prev, department]);
        };
        window.addEventListener(DEPARTMENT_CREATED_EVENT, handleCreatedElsewhere);
        return () => window.removeEventListener(DEPARTMENT_CREATED_EVENT, handleCreatedElsewhere);
    }, []);

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
            setInviteError("Only admins or super admins can add members.");
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

    // Opens the confirmation window; the removal itself runs in confirmRemoveMember
    const handleRemoveMember = (targetUserId, name) => {
        if (!targetUserId || !activeTeam?.id || !canManage) return;
        setRemoveMemberError("");
        setMemberToRemove({ userId: targetUserId, name: name || "this member" });
    };

    const closeRemoveMember = () => {
        if (removingMember) return;
        setMemberToRemove(null);
        setRemoveMemberError("");
    };

    const confirmRemoveMember = async () => {
        if (!memberToRemove || !activeTeam?.id) return;
        setRemovingMember(true);
        setRemoveMemberError("");
        try {
            const { error } = await supabase
                .from("memberships")
                .delete()
                .eq("user_id", memberToRemove.userId)
                .eq("team_space_id", activeTeam.id);

            if (error) {
                setRemoveMemberError("Couldn't remove the member: " + error.message);
                return;
            }
            setMemberToRemove(null);
            await fetchTeamMembers(activeTeam.id);
        } catch (err) {
            console.error("Remove member error:", err);
            setRemoveMemberError("Couldn't remove the member. Please try again.");
        } finally {
            setRemovingMember(false);
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
    : (activeDepartment?.name || activeTeam?.name || "Department Directory")
// Until the department is known, show a placeholder rather than a fallback title
const isTitleLoading = roleLoading || (loading && !activeTeam)

return (
    <div className="bg-canvas min-h-screen text-white font-sans antialiased flex flex-col">
        <Sidebar onCollapsedChange={setSidebarCollapsed} />
        <Header />
        <main className={`${sidebarCollapsed ? "ml-[72px]" : "ml-[260px]"} flex-1 flex flex-col transition-all duration-300 ease-out`}>

            {/* Top Controls Header */}
            <div className="bg-field border-b border-line px-8 py-4 flex items-center justify-between sticky top-16 z-30">
                <div className="relative w-full max-w-md">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-muted text-[20px]">search</span>
                    <input
                        className="w-full bg-panel border border-line rounded-xl py-2 pl-10 pr-4 text-white placeholder-muted text-sm focus:outline-none focus:border-accent-ink"
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
                        <div className="flex items-center gap-2 text-muted text-xs mb-1">
                            <span className="material-symbols-outlined text-[16px]">groups</span>
                            <span>/</span>
                            {isTitleLoading
                                ? <span className="inline-block h-3 w-24 rounded bg-line animate-pulse" aria-hidden="true" />
                                : <span className="text-white font-medium">{pageTitle}</span>}
                        </div>
                        {isTitleLoading
                            ? <h1 className="h-8 w-56 rounded-lg bg-line animate-pulse" aria-label="Loading department" />
                            : <h1 className="text-2xl font-bold text-white">{pageTitle}</h1>}
                        {loading ? (
                            <p role="status" className="text-muted text-sm mt-1 flex items-center gap-2">
                                <PlanetLoader className="text-[18px] text-accent-ink" />
                                Loading {isTitleLoading ? "department" : pageTitle}…
                            </p>
                        ) : (
                            <p className="text-muted text-sm mt-1">
                                {filteredMembers.length} member{filteredMembers.length !== 1 ? "s" : ""} {isSuperAdmin && activeTeam ? `assigned to ${activeTeam.name}` : "in your department team"}
                            </p>
                        )}
                        {!isSuperAdmin && !isAdminAnywhere && (
                            <div className="mt-3">
                                <DepartmentSwitcher />
                            </div>
                        )}
                    </div>

                    {canManage && (
                        <div className="flex items-center gap-3">
                            <button 
                                onClick={() => { setAddMemberTab("existing"); setInviteError(""); setInviteSuccess(""); setShowAddMemberModal(true); }}
                                className="px-4 py-2 bg-faint hover:bg-faint text-white text-xs font-semibold rounded-xl flex items-center gap-2 transition-all cursor-pointer"
                            >
                                <span className="material-symbols-outlined text-[18px]">person_add</span>
                                Add Member
                            </button>
                            {/* Only super admins create departments here (hidden for admins; the database rule is unchanged) */}
                            {isSuperAdmin && (
                                <button
                                    onClick={() => setShowCreateDeptModal(true)}
                                    className="px-4 py-2 bg-accent text-on-accent hover:bg-accent-hover text-xs font-semibold rounded-xl flex items-center gap-2 transition-all cursor-pointer"
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
                                ? "bg-accent text-on-accent font-bold shadow-sm"
                                : "text-muted hover:text-white hover:bg-line/50"
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
                    <div className="flex items-center justify-between gap-4 flex-wrap pb-2 border-b border-line">
                        {allTeams.length > 0 && (
                            <div className="flex items-center gap-2 flex-wrap">
                                {allTeams.map(team => (
                                    <button
                                        key={team.id}
                                        onClick={() => switchTeam(team)}
                                        className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                                            activeTeam?.id === team.id
                                                ? "bg-faint text-white"
                                                : "bg-raised text-muted border border-line hover:text-white"
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
                                disabled={deletingDept}
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
                            <div key={i} className="bg-raised border border-line rounded-xl p-5 h-44 animate-pulse">
                                <div className="h-10 w-10 bg-surface2 rounded-full mb-4" />
                                <div className="h-4 w-32 bg-surface2 rounded mb-2" />
                                <div className="h-3 w-24 bg-surface2 rounded" />
                            </div>
                        ))}
                    </div>
                ) : filteredMembers.length === 0 ? (
                    <div className="bg-raised border border-line rounded-xl p-12 flex flex-col items-center justify-center text-center min-h-[250px] gap-3">
                        <span className="material-symbols-outlined text-4xl text-muted">person_search</span>
                        <p className="text-white font-semibold text-base">No team members found</p>
                        <p className="text-muted text-xs max-w-sm">
                            {searchQuery ? "No members matched your search query." : "No team members are assigned to this department yet."}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredMembers.map((member) => (
                            <div key={member.user_id || member.id} className="bg-raised border border-line rounded-xl p-5 flex flex-col justify-between hover:border-line-strong transition-all group">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="w-12 h-12 rounded-xl bg-surface2 border border-line-strong flex items-center justify-center font-bold text-white text-lg">
                                        {(member.name || member.email || "?").charAt(0).toUpperCase()}
                                    </div>
                                    <span className="bg-faint/20 text-accent-ink border border-faint/30 text-[10px] font-bold px-2 py-0.5 rounded uppercase">
                                        {member.membershipRole || member.role || "Member"}
                                    </span>
                                </div>
                                <div>
                                    <h4 className="text-white font-semibold text-base">
                                        {member.name || "Team Member"}
                                    </h4>
                                    <p className="text-muted text-xs truncate mt-0.5">
                                        {member.email || "user@spacers.com"}
                                    </p>
                                </div>
                                <div className="mt-6 pt-4 border-t border-line flex items-center justify-between">
                                    <button 
                                        onClick={() => handleOpenChat(member)}
                                        className="text-accent-ink hover:underline text-xs font-medium flex items-center gap-1 cursor-pointer"
                                    >
                                        <span className="material-symbols-outlined text-[14px]">chat</span> Message
                                    </button>
                                    <div className="flex items-center gap-3">
                                        {canManage && (
                                            <button 
                                                onClick={() => handleRemoveMember(member.user_id, member.name || member.email)}
                                                className="text-red-400 hover:text-red-300 text-xs font-medium flex items-center gap-0.5 cursor-pointer"
                                            >
                                                <span className="material-symbols-outlined text-[14px]">person_remove</span> Remove
                                            </button>
                                        )}
                                        <span className="text-[10px] text-muted">Active now</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                </>
                )}

                {/* Messages Tab */}
                {/* While switching, the last department's chat must not show under the new name */}
                {activeTab === "messages" && loading && (
                    <div role="status" className="flex flex-col items-center justify-center gap-3 py-20 text-muted text-sm">
                        <PlanetLoader className="text-[44px] text-accent-ink" />
                        Loading messages…
                    </div>
                )}
                {activeTab === "messages" && !loading && activeTeam && (
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
        {/* ── Remove member confirmation modal ── */}
        {memberToRemove && (
            <div
                className="fixed inset-0 z-[150] flex items-center justify-center p-4"
                style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
                onClick={closeRemoveMember}
            >
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="remove-member-title"
                    className="bg-surface1 border border-line rounded-2xl shadow-2xl w-full max-w-sm p-6"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 mx-auto mb-4">
                        <span className="material-symbols-outlined text-red-400 text-[32px]" aria-hidden="true">person_remove</span>
                    </div>

                    <h2 id="remove-member-title" className="text-white font-bold text-[18px] text-center mb-2">Remove this member?</h2>
                    <p className="text-muted text-[13px] text-center mb-1">You are about to remove</p>
                    <p className="text-white font-bold text-[15px] text-center mb-3">"{memberToRemove.name}"</p>
                    <p className="text-muted text-[12px] text-center mb-6">
                        They will lose access to {activeTeam?.name || "this department"} and its projects, unless they were added to a project directly. You can add them back later.
                    </p>
                    {removeMemberError && (
                        <p role="alert" className="text-red-400 text-[12px] text-center -mt-3 mb-4">{removeMemberError}</p>
                    )}

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={closeRemoveMember}
                            disabled={removingMember}
                            className="flex-1 py-2.5 rounded-xl border border-line text-muted hover:bg-line hover:text-white text-[13px] font-semibold transition-colors cursor-pointer disabled:opacity-50"
                        >
                            No, keep them
                        </button>
                        <button
                            type="button"
                            onClick={confirmRemoveMember}
                            disabled={removingMember}
                            className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-[#ffffff] text-[13px] font-bold transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            {removingMember ? (
                                <><PlanetLoader className="text-[16px]" />Removing…</>
                            ) : (
                                <><span className="material-symbols-outlined text-[16px]" aria-hidden="true">person_remove</span>Yes, remove</>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        )}

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
                    className="bg-surface1 border border-line rounded-2xl shadow-2xl w-full max-w-sm p-6"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-center justify-center w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 mx-auto mb-4">
                        <span className="material-symbols-outlined text-red-400 text-[32px]" aria-hidden="true">delete_forever</span>
                    </div>

                    <h2 id="delete-dept-title" className="text-white font-bold text-[18px] text-center mb-2">Delete this department?</h2>
                    <p className="text-muted text-[13px] text-center mb-1">You are about to permanently delete</p>
                    <p className="text-white font-bold text-[15px] text-center mb-3">"{deptToDelete.name}"</p>
                    <p className="text-muted text-[12px] text-center mb-6">
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
                            className="flex-1 py-2.5 rounded-xl border border-line text-muted hover:bg-line hover:text-white text-[13px] font-semibold transition-colors cursor-pointer disabled:opacity-50"
                        >
                            No, keep it
                        </button>
                        <button
                            type="button"
                            onClick={confirmDeleteDept}
                            disabled={deletingDept}
                            className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-[#ffffff] text-[13px] font-bold transition-colors cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            {deletingDept ? (
                                <><PlanetLoader className="text-[16px]" />Deleting…</>
                            ) : (
                                <><span className="material-symbols-outlined text-[16px]" aria-hidden="true">delete</span>Yes, delete</>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {showCreateDeptModal && canManage && (
            <CreateDepartmentModal
                organizationId={organizationId}
                canAssignPeople={isSuperAdmin}
                onClose={() => setShowCreateDeptModal(false)}
                onCreated={handleDeptCreated}
                onFailed={() => setToast(failedToast)}
            />
        )}
        <Toast toast={toast} onClose={closeToast} />

        {/* Add Member Modal */}
        {showAddMemberModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-md">
                <div className="bg-raised rounded-2xl p-6 max-w-md w-full space-y-4 border border-line shadow-2xl animate-scaleIn">
                    <div className="flex items-center justify-between border-b border-line/30 pb-3">
                        <h3 className="text-lg font-bold text-accent-ink">Add Member{activeTeam ? ` to ${activeTeam.name}` : ""}</h3>
                        <button onClick={closeAddMemberModal} className="text-muted hover:text-white cursor-pointer">
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>

                    {/* Tab switcher: existing Spacer user vs. brand-new email invite */}
                    <div className="flex gap-1 bg-canvas p-1 rounded-xl border border-line">
                        <button
                            type="button"
                            onClick={() => switchAddMemberTab("existing")}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${addMemberTab === "existing" ? "bg-accent text-on-accent" : "text-muted hover:text-white"}`}
                        >
                            Existing User
                        </button>
                        <button
                            type="button"
                            onClick={() => switchAddMemberTab("invite")}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${addMemberTab === "invite" ? "bg-accent text-on-accent" : "text-muted hover:text-white"}`}
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
                                    <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">Select User</label>
                                    <Select
                                        className="w-full bg-canvas border border-line rounded-xl px-4 py-2.5 text-white text-sm focus:ring-1 focus:ring-accent-ink focus:outline-none"
                                        value={inviteEmail}
                                        onChange={(e) => setInviteEmail(e.target.value)}
                                    >
                                        {orgUsers.map(user => (
                                            <option key={user.id} value={user.email}>
                                                {user.name || user.email} ({user.email})
                                            </option>
                                        ))}
                                    </Select>
                                </div>
                            )
                        ) : (
                            <div>
                                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">Email Address</label>
                                <input
                                    type="email"
                                    required
                                    placeholder="name@company.com"
                                    className="w-full bg-canvas border border-line rounded-xl px-4 py-2.5 text-white text-sm focus:ring-1 focus:ring-accent-ink focus:outline-none placeholder-muted/40"
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                />
                                <p className="text-[11px] text-muted mt-2 leading-relaxed">
                                    They'll get an email with a link to create a password. Once they do, they're
                                    signed in automatically — already added to this department with the role below.
                                </p>
                            </div>
                        )}

                        {(addMemberTab === "invite" || orgUsers.length > 0) && (
                            <div>
                                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">Role in Department</label>
                                <Select
                                    className="w-full bg-canvas border border-line rounded-xl px-4 py-2.5 text-white text-sm focus:ring-1 focus:ring-accent-ink focus:outline-none"
                                    value={inviteRole}
                                    onChange={(e) => setInviteRole(e.target.value)}
                                >
                                    <option value="member">Member</option>
                                    <option value="admin">Admin</option>
                                </Select>
                            </div>
                        )}

                        {inviteError && (
                            <p className="text-xs text-red-400 flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[14px]">error</span>
                                {inviteError}
                            </p>
                        )}
                        {inviteSuccess && (
                            <p className="text-xs text-accent-ink flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                {inviteSuccess}
                            </p>
                        )}

                        <div className="flex items-center justify-end gap-3 pt-2">
                            <button
                                type="button"
                                onClick={closeAddMemberModal}
                                className="px-4 py-2 border border-line rounded-xl text-xs font-semibold text-muted hover:text-white hover:bg-line transition-all cursor-pointer"
                            >
                                Cancel
                            </button>
                            {!(addMemberTab === "existing" && orgUsers.length === 0) && (
                                <button
                                    type="submit"
                                    disabled={inviteSending}
                                    className="px-4 py-2 bg-accent text-on-accent hover:bg-accent-hover rounded-xl text-xs font-semibold transition-all disabled:opacity-50 cursor-pointer"
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