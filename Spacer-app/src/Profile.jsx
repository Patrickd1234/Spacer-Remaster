import Sidebar from "./partials/SidebarRouter"
import Header from "./partials/header"
import { useState, useEffect } from "react"
import { supabase, getSessionUser } from "./supabase"
import { useRole } from "./RoleContext"
import { changePassword, MIN_PASSWORD_LENGTH } from "./passwordChange"

function initials(name, email) {
    const source = (name || email || "").trim()
    if (!source) return "?"
    const parts = source.split(" ").filter(Boolean)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return source.slice(0, 2).toUpperCase()
}

function Profile() {
    const [userId, setUserId] = useState("")
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState("overview") // "overview", "personal", "security", "preferences"

    // Toast notification
    const [toast, setToast] = useState(null)
    const { isSuperAdmin, isAdmin, membershipData } = useRole()

    // Saved profile state
    const [profile, setProfile] = useState({
        name: "",
        email: "",
        phone: "",
        job_title: "",
        department: "Engineering & Design",
        location: "San Francisco, CA",
        bio: "Passionate about building intuitive workspace products and user-centered design systems.",
        website: "https://openspace.finance/"
    })

    // Draft values during editing
    const [isEditing, setIsEditing] = useState(false)
    const [draft, setDraft] = useState(profile)
    const [saving, setSaving] = useState(false)

    // Security tab states
    const [twoFactorEnabled, setTwoFactorEnabled] = useState(false)
    const [showPasswordForm, setShowPasswordForm] = useState(false)
    const [passwordForm, setPasswordForm] = useState({ current: "", next: "", confirm: "" })
    const [passwordSaving, setPasswordSaving] = useState(false)
    const [passwordMsg, setPasswordMsg] = useState(null)
    const [signingOutOthers, setSigningOutOthers] = useState(false)
    const [othersSignedOut, setOthersSignedOut] = useState(false)

    // Preferences tab states
    const [preferences, setPreferences] = useState({
        emailAlerts: true,
        taskUpdates: true,
        weeklyDigest: false,
        marketingEmails: false,
        theme: "dark",
        timezone: "UTC-8 (Pacific Time)",
        language: "English (US)"
    })

    const showToast = (message, type = "success") => {
        setToast({ message, type })
        setTimeout(() => setToast(null), 4000)
    }

    useEffect(() => {
        const fetchUser = async () => {
            const authUser = await getSessionUser()

            if (!authUser) {
                if (import.meta.env.DEV) {
                    console.error("No authenticated user found")
                }
                setLoading(false)
                return
            }

            setUserId(authUser.id)

            const { data, error } = await supabase
                .from("users")
                .select("id, name, email, phone, job_title, department, location, bio, website")
                .eq("id", authUser.id)
                .maybeSingle()

            if (error) {
                if (import.meta.env.DEV) {
                    console.error("Error fetching users row:", error)
                }
            }

            const next = {
                name: data?.name || authUser.user_metadata?.full_name || "",
                email: data?.email || authUser.email || "",
                phone: data?.phone || "",
                job_title: data?.job_title || "Product Designer",
                department: data?.department || "Engineering & Design",
                location: data?.location || "San Francisco, CA",
                bio: authUser.user_metadata?.bio || data?.bio || "Passionate about building intuitive workspace products and user-centered design systems.",
                website: data?.website || "https://openspace.finance/"
            }
            setProfile(next)
            setDraft(next)

            if (!data) {
                if (import.meta.env.DEV) {
                    console.info("No users row for this account yet — creating one")
                }
                const { error: insertError } = await supabase.from("users").insert({
                    id: authUser.id,
                    email: authUser.email,
                    name: authUser.user_metadata?.full_name || "",
                })
                if (insertError && import.meta.env.DEV) {
                    console.error("Could not create users row:", insertError)
                }
            }

            setLoading(false)
        }
        fetchUser()
    }, [])

    const startEditing = () => {
        setDraft(profile)
        setIsEditing(true)
    }

    const cancelEditing = () => {
        setDraft(profile)
        setIsEditing(false)
    }

    const saveProfile = async () => {
        setSaving(true)

        const { error } = await supabase
            .from("users")
            .update({
                name: draft.name
            })
            .eq("id", userId)

        const { error: authMetaError } = await supabase.auth.updateUser({
            data: {
                full_name: draft.name,
                bio: draft.bio
            }
        })

        // Also update Auth email if changed
        if (draft.email !== profile.email) {
            const { error: authError } = await supabase.auth.updateUser({ email: draft.email })
            if (authError) {
                if (import.meta.env.DEV) {
                    console.error("Error updating auth email:", authError)
                }
                showToast("Could not update email: " + authError.message, "error")
            }
        }

        setSaving(false)

        if (error || authMetaError) {
            if (import.meta.env.DEV) {
                console.error("DB or Auth Update error:", error || authMetaError)
            }
            showToast("Failed to update profile", "error")
            return
        }

        setProfile(draft)
        setIsEditing(false)
        showToast("Profile details updated successfully!", "success")
    }

    const handlePasswordSubmit = async (e) => {
        e.preventDefault()
        setPasswordMsg(null)

        if (!passwordForm.current) {
            setPasswordMsg({ type: "error", text: "Enter your current password." })
            return
        }

        if (!passwordForm.next || passwordForm.next.length < MIN_PASSWORD_LENGTH) {
            setPasswordMsg({ type: "error", text: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` })
            return
        }

        if (passwordForm.next !== passwordForm.confirm) {
            setPasswordMsg({ type: "error", text: "Passwords do not match." })
            return
        }

        setPasswordSaving(true)
        // Server checks the current password, then signs out other devices
        const { error } = await changePassword(passwordForm.current, passwordForm.next)
        setPasswordSaving(false)

        if (error) {
            setPasswordMsg({ type: "error", text: error })
        } else {
            setPasswordMsg({ type: "success", text: "Password updated. You've been signed out on your other devices." })
            setPasswordForm({ current: "", next: "", confirm: "" })
            setTimeout(() => setShowPasswordForm(false), 2000)
            showToast("Password updated successfully!", "success")
        }
    }

    const signOutOtherSessions = async () => {
        setSigningOutOthers(true)
        const { error } = await supabase.auth.signOut({ scope: "others" })
        setSigningOutOthers(false)
        if (error) {
            if (import.meta.env.DEV) {
                console.error("Error signing out other sessions:", error)
            }
            showToast("Could not sign out other sessions: " + error.message, "error")
        } else {
            setOthersSignedOut(true)
            showToast("Signed out of all other device sessions.", "success")
        }
    }

    // Stats calculation for Overview
    const stats = isSuperAdmin ? [
        { label: "Organizations Managed", value: "3", icon: "domain", color: "text-primary-fixed" },
        { label: "Active Users", value: "245", icon: "group", color: "text-emerald-400" },
        { label: "System Health", value: "99.9%", icon: "monitor_heart", color: "text-amber-400" }
    ] : isAdmin ? [
        { label: "Department Members", value: "12", icon: "groups", color: "text-secondary-fixed" },
        { label: "Team Projects", value: "8", icon: "folder", color: "text-emerald-400" },
        { label: "Pending Approvals", value: "3", icon: "pending_actions", color: "text-amber-400" }
    ] : [
        { label: "Active Projects", value: "4", icon: "folder_open", color: "text-secondary-fixed" },
        { label: "Tasks Completed", value: "32", icon: "task_alt", color: "text-emerald-400" },
        { label: "Member Since", value: "Jan 2024", icon: "calendar_today", color: "text-amber-400" }
    ]

    const activityFeed = isSuperAdmin ? [
        { title: "System update deployed to production", time: "1 hour ago", icon: "system_update_alt", badge: "System" },
        { title: "New department 'Marketing EMEA' created", time: "3 hours ago", icon: "domain_add", badge: "Organization" },
        { title: "Reviewed security compliance report", time: "Yesterday at 2:00 PM", icon: "verified", badge: "Security" },
        { title: "Granted admin rights to new manager", time: "2 days ago", icon: "manage_accounts", badge: "Access" }
    ] : isAdmin ? [
        { title: "Approved design system budget", time: "4 hours ago", icon: "fact_check", badge: "Approvals" },
        { title: "Added 2 new members to Frontend Team", time: "Yesterday at 11:30 AM", icon: "person_add", badge: "Team" },
        { title: "Updated Q3 project milestones", time: "3 days ago", icon: "flag", badge: "Projects" },
        { title: "Generated monthly department report", time: "Last week", icon: "assessment", badge: "Reports" }
    ] : [
        { title: "Updated project milestones", time: "2 hours ago", icon: "flag", badge: "Project Space" },
        { title: "Completed task: 'Review wireframes'", time: "Yesterday at 4:15 PM", icon: "check_circle", badge: "Tasks" },
        { title: "Changed security preferences", time: "3 days ago", icon: "shield", badge: "Security" },
        { title: "Joined team workspace", time: "Jan 15, 2024", icon: "person_add", badge: "Team" }
    ]

    return (
        <>
            <Sidebar />
            <Header />
            <main className="ml-[260px] flex-1 flex flex-col min-h-screen bg-background text-[#e0e5d0]">
                {/* Toast Notification */}
                {toast && (
                    <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl backdrop-blur-md transition-all animate-bounce ${toast.type === "error" ? "bg-red-950/80 border-red-500/50 text-red-200" : "bg-emerald-950/80 border-emerald-500/50 text-emerald-200"}`}>
                        <span className="material-symbols-outlined">{toast.type === "error" ? "error" : "check_circle"}</span>
                        <span className="text-sm font-medium">{toast.message}</span>
                    </div>
                )}

                {loading ? (
                    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
                        <span className="material-symbols-outlined animate-spin text-5xl text-primary-fixed">
                            progress_activity
                        </span>
                        <p className="text-sm text-neutral-400">Loading your profile...</p>
                    </div>
                ) : (
                    <div className="w-full max-w-6xl mx-auto p-4 sm:p-8 space-y-6">

                        {/* HERO BANNER & HEADER */}
                        <div className="relative rounded-3xl overflow-hidden border border-white/10 bg-gradient-to-r from-neutral-900 via-neutral-900/90 to-emerald-950/40 p-6 sm:p-8 shadow-2xl">
                            {/* Decorative glow ambient background */}
                            <div className="absolute top-0 right-0 w-96 h-96 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" style={{ backgroundColor: "rgba(var(--primary-color-rgb), 0.05)" }} />
                            <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

                            <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                                    {/* Avatar with Status Ring */}
                                    <div className="relative group">
                                        <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-gradient-to-br from-[var(--primary-color)] to-emerald-600 p-[2px] shadow-xl">
                                            <div className="w-full h-full rounded-[14px] bg-neutral-900 flex items-center justify-center text-3xl font-extrabold text-primary-accent tracking-wider">
                                                {initials(profile.name, profile.email)}
                                            </div>
                                        </div>
                                        <span className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-emerald-500 border-2 border-neutral-900 shadow-md" title="Online & Active" />
                                    </div>

                                    {/* Identity Details */}
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
                                                {profile.name || "Unnamed User"}
                                            </h1>
                                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider ${isSuperAdmin ? 'bg-primary-fixed/10 text-primary-fixed border border-[var(--primary-color)]/20' : isAdmin ? 'bg-secondary-fixed/10 text-secondary-fixed border border-blue-400/20' : 'bg-neutral-400/10 text-neutral-400 border border-neutral-400/20'}`}>
                                                {isSuperAdmin ? 'Superadmin' : isAdmin ? 'Admin' : membershipData?.role || 'Member'}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-4 text-xs text-neutral-400 pt-1 flex-wrap">
                                            <span className="flex items-center gap-1">
                                                <span className="material-symbols-outlined text-sm">mail</span>
                                                {profile.email}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Header Quick Actions */}
                                <div className="flex items-center gap-3 self-stretch sm:self-auto justify-end">
                                    <button
                                        onClick={() => {
                                            setActiveTab("personal")
                                            startEditing()
                                        }}
                                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl btn-primary-accent transition-all shadow-lg hover:scale-[1.02]"
                                    >
                                        <span className="material-symbols-outlined text-lg">edit</span>
                                        Edit Profile
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* TAB NAVIGATION BAR */}
                        <div className="flex items-center gap-2 border-b border-white/10 overflow-x-auto pb-1 no-scrollbar">
                            {[
                                { id: "overview", label: "Overview", icon: "dashboard" },
                                { id: "personal", label: "Personal Info", icon: "person" },
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-sm transition-all whitespace-nowrap ${activeTab === tab.id
                                        ? "bg-white/10 text-primary-accent border border-[var(--primary-color)]/30 shadow-md"
                                        : "text-neutral-400 hover:text-white hover:bg-white/5"
                                        }`}
                                >
                                    <span className="material-symbols-outlined text-lg">{tab.icon}</span>
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* TAB CONTENT PANELS */}

                        {/* 1. OVERVIEW TAB */}
                        {activeTab === "overview" && (
                            <div className="space-y-6 animate-fadeIn">
                                {/* Metrics Cards Grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {stats.map((stat, idx) => (
                                        <div key={idx} className="p-5 rounded-2xl bg-surface-container border border-white/10 flex items-center justify-between hover:border-white/20 transition-all">
                                            <div>
                                                <p className="text-xs text-neutral-400 font-medium uppercase tracking-wider">{stat.label}</p>
                                                <p className="text-2xl font-bold text-white mt-1">{stat.value}</p>
                                            </div>
                                            <div className={`p-3 rounded-xl bg-white/5 ${stat.color}`}>
                                                <span className="material-symbols-outlined text-2xl">{stat.icon}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                    {/* Left Column: About & Skills */}
                                    <div className="lg:col-span-1 space-y-6">
                                        <div className="p-6 rounded-2xl bg-surface-container border border-white/10 space-y-4">
                                            <h3 className="text-base font-semibold text-white flex items-center gap-2">
                                                <span className="material-symbols-outlined text-primary-fixed">info</span>
                                                About
                                            </h3>
                                            <p className="text-sm text-neutral-300 leading-relaxed">
                                                {profile.bio || "No bio provided."}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Right Column: Activity Stream */}
                                    <div className="lg:col-span-2 p-6 rounded-2xl bg-surface-container border border-white/10 space-y-5">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-base font-semibold text-white flex items-center gap-2">
                                                <span className="material-symbols-outlined text-emerald-400">history</span>
                                                Recent Activity
                                            </h3>
                                            <span className="text-xs text-neutral-400">Past 30 Days</span>
                                        </div>

                                        <div className="space-y-4">
                                            {activityFeed.map((item, idx) => (
                                                <div key={idx} className="flex items-start gap-4 p-3.5 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-colors">
                                                    <div className="p-2 rounded-lg bg-primary-fixed/10 text-primary-fixed shrink-0">
                                                        <span className="material-symbols-outlined text-lg">{item.icon}</span>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between gap-2">
                                                            <p className="text-sm font-medium text-white truncate">{item.title}</p>
                                                            <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-white/5 text-neutral-400 shrink-0">
                                                                {item.badge}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-neutral-400 mt-0.5">{item.time}</p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 2. PERSONAL INFORMATION TAB */}
                        {activeTab === "personal" && (
                            <div className="p-6 sm:p-8 rounded-2xl bg-surface-container border border-white/10 space-y-6 animate-fadeIn">
                                <div className="flex items-center justify-between pb-4 border-b border-white/10">
                                    <div>
                                        <h2 className="text-lg font-semibold text-white">Personal Information</h2>
                                        <p className="text-xs text-neutral-400">Manage your profile details and public metadata.</p>
                                    </div>
                                    {!isEditing ? (
                                        <button
                                            onClick={startEditing}
                                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 text-white hover:bg-white/20 text-sm font-medium transition-all"
                                        >
                                            <span className="material-symbols-outlined text-base">edit</span>
                                            Edit Details
                                        </button>
                                    ) : (
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={saveProfile}
                                                disabled={saving}
                                                className="flex items-center gap-2 px-4 py-2 rounded-xl btn-primary-accent transition-all disabled:opacity-50"
                                            >
                                                {saving && <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>}
                                                Save Changes
                                            </button>
                                            <button
                                                onClick={cancelEditing}
                                                disabled={saving}
                                                className="px-4 py-2 rounded-xl bg-white/5 text-neutral-300 hover:text-white hover:bg-white/10 text-sm font-medium transition-all"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                                            Full Name
                                        </label>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                className="w-full bg-neutral-900/80 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus-border-primary-accent transition-colors"
                                                value={draft.name}
                                                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                                            />
                                        ) : (
                                            <div className="w-full bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 text-white text-sm">
                                                {profile.name || "—"}
                                            </div>
                                        )}
                                    </div>

                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                                            Email Address <span className="text-primary-fixed text-[10px] font-normal lowercase">(auth login)</span>
                                        </label>
                                        {isEditing ? (
                                            <input
                                                type="email"
                                                className="w-full bg-neutral-900/80 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus-border-primary-accent transition-colors"
                                                value={draft.email}
                                                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                                            />
                                        ) : (
                                            <div className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3 text-neutral-400 text-sm flex items-center justify-between">
                                                <span>{profile.email || "—"}</span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                                            Bio
                                        </label>
                                        {isEditing ? (
                                            <textarea
                                                className="w-full bg-neutral-900/80 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus-border-primary-accent transition-colors"
                                                rows="3"
                                                value={draft.bio}
                                                onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
                                            />
                                        ) : (
                                            <div className="w-full bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 text-white text-sm">
                                                {profile.bio || "—"}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Removed redundant security and preferences tabs */}
                    </div>
                )}
            </main>
        </>
    )
}

export default Profile
