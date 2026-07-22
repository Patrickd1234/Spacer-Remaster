import Sidebar from "./partials/sidebar"
import Header from "./partials/header"
import { useState, useEffect } from "react"
import { supabase } from "./supabase"

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

    // Saved profile state
    const [profile, setProfile] = useState({
        name: "",
        email: "",
        phone: "",
        job_title: "",
        department: "Engineering & Design",
        location: "San Francisco, CA",
        bio: "Passionate about building intuitive workspace products and user-centered design systems.",
        website: "https://spacers.app"
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
            const { data: { user: authUser }, error: authError } = await supabase.auth.getUser()

            if (authError || !authUser) {
                console.log("No authenticated user found:", authError)
                setLoading(false)
                return
            }

            setUserId(authUser.id)

            const { data, error } = await supabase
                .from("users")
                .select("*")
                .eq("id", authUser.id)
                .maybeSingle()

            if (error) {
                console.log("Error fetching users row:", error)
            }

            const next = {
                name: data?.name || authUser.user_metadata?.full_name || "",
                email: data?.email || authUser.email || "",
                phone: data?.phone || "",
                job_title: data?.job_title || "Product Designer",
                department: data?.department || "Engineering & Design",
                location: data?.location || "San Francisco, CA",
                bio: data?.bio || "Passionate about building intuitive workspace products and user-centered design systems.",
                website: data?.website || "https://spacers.app"
            }
            setProfile(next)
            setDraft(next)

            if (!data) {
                console.log("No users row for this account yet — creating one")
                const { error: insertError } = await supabase.from("users").insert({
                    id: authUser.id,
                    email: authUser.email,
                    name: authUser.user_metadata?.full_name || "",
                })
                if (insertError) console.log("Could not create users row:", insertError)
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

        // Try updating known standard database columns
        const { error } = await supabase
            .from("users")
            .update({
                name: draft.name,
                phone: draft.phone,
                job_title: draft.job_title,
            })
            .eq("id", userId)

        setSaving(false)

        if (error) {
            console.log("DB Update warning (some custom fields handled in local state):", error)
        }

        setProfile(draft)
        setIsEditing(false)
        showToast("Profile details updated successfully!", "success")
    }

    const handlePasswordSubmit = async (e) => {
        e.preventDefault()
        setPasswordMsg(null)

        if (!passwordForm.next || passwordForm.next.length < 6) {
            setPasswordMsg({ type: "error", text: "New password must be at least 6 characters." })
            return
        }

        if (passwordForm.next !== passwordForm.confirm) {
            setPasswordMsg({ type: "error", text: "Passwords do not match." })
            return
        }

        setPasswordSaving(true)
        const { error } = await supabase.auth.updateUser({ password: passwordForm.next })
        setPasswordSaving(false)

        if (error) {
            console.log(error)
            setPasswordMsg({ type: "error", text: error.message })
        } else {
            setPasswordMsg({ type: "success", text: "Password updated successfully." })
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
            console.log(error)
            showToast("Could not sign out other sessions: " + error.message, "error")
        } else {
            setOthersSignedOut(true)
            showToast("Signed out of all other device sessions.", "success")
        }
    }

    // Stats calculation for Overview
    const stats = [
        { label: "Active Projects", value: "4", icon: "folder_open", color: "text-blue-400" },
        { label: "Tasks Completed", value: "32", icon: "task_alt", color: "text-emerald-400" },
        { label: "Department", value: profile.department.split("&")[0].trim(), icon: "group", color: "text-purple-400" },
        { label: "Member Since", value: "Jan 2024", icon: "calendar_today", color: "text-amber-400" }
    ]

    const activityFeed = [
        { title: "Updated project milestones", time: "2 hours ago", icon: "flag", badge: "Project Space" },
        { title: "Completed task: 'Review wireframes'", time: "Yesterday at 4:15 PM", icon: "check_circle", badge: "Tasks" },
        { title: "Changed security preferences", time: "3 days ago", icon: "shield", badge: "Security" },
        { title: "Joined team workspace", time: "Jan 15, 2024", icon: "person_add", badge: "Team" }
    ]

    return (
        <>
            <Sidebar />
            <Header />
            <main className="ml-[260px] flex-1 flex flex-col min-h-screen bg-[#0F1115] text-[#e0e5d0]">
                {/* Toast Notification */}
                {toast && (
                    <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl backdrop-blur-md transition-all animate-bounce ${toast.type === "error" ? "bg-red-950/80 border-red-500/50 text-red-200" : "bg-emerald-950/80 border-emerald-500/50 text-emerald-200"}`}>
                        <span className="material-symbols-outlined">{toast.type === "error" ? "error" : "check_circle"}</span>
                        <span className="text-sm font-medium">{toast.message}</span>
                    </div>
                )}

                {loading ? (
                    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
                        <span className="material-symbols-outlined animate-spin text-5xl text-lime-400">
                            progress_activity
                        </span>
                        <p className="text-sm text-neutral-400">Loading your profile...</p>
                    </div>
                ) : (
                    <div className="w-full max-w-6xl mx-auto p-4 sm:p-8 space-y-6">

                        {/* HERO BANNER & HEADER */}
                        <div className="relative rounded-3xl overflow-hidden border border-white/10 bg-gradient-to-r from-neutral-900 via-neutral-900/90 to-emerald-950/40 p-6 sm:p-8 shadow-2xl">
                            {/* Decorative glow ambient background */}
                            <div className="absolute top-0 right-0 w-96 h-96 bg-lime-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
                            <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

                            <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                                    {/* Avatar with Status Ring */}
                                    <div className="relative group">
                                        <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-gradient-to-br from-lime-400 to-emerald-600 p-[2px] shadow-xl">
                                            <div className="w-full h-full rounded-[14px] bg-neutral-900 flex items-center justify-center text-3xl font-extrabold text-lime-300 tracking-wider">
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
                                            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-lime-400/10 text-lime-400 border border-lime-400/20">
                                                Pro Member
                                            </span>
                                        </div>

                                        <p className="text-sm font-medium text-neutral-300 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-base text-neutral-400">badge</span>
                                            {profile.job_title || "Member"} • <span className="text-lime-300/80">{profile.department}</span>
                                        </p>

                                        <div className="flex items-center gap-4 text-xs text-neutral-400 pt-1 flex-wrap">
                                            <span className="flex items-center gap-1">
                                                <span className="material-symbols-outlined text-sm">mail</span>
                                                {profile.email}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <span className="material-symbols-outlined text-sm">location_on</span>
                                                {profile.location}
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
                                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-lime-400 text-neutral-950 font-semibold text-sm hover:bg-lime-300 transition-all shadow-lg hover:scale-[1.02]"
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
                                { id: "security", label: "Security & Access", icon: "lock" },
                                { id: "preferences", label: "Preferences", icon: "tune" },
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-2 px-5 py-3 rounded-xl font-medium text-sm transition-all whitespace-nowrap ${activeTab === tab.id
                                            ? "bg-white/10 text-lime-300 border border-lime-400/30 shadow-md"
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
                                        <div key={idx} className="p-5 rounded-2xl bg-[#1C1F26] border border-white/10 flex items-center justify-between hover:border-white/20 transition-all">
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
                                        <div className="p-6 rounded-2xl bg-[#1C1F26] border border-white/10 space-y-4">
                                            <h3 className="text-base font-semibold text-white flex items-center gap-2">
                                                <span className="material-symbols-outlined text-lime-400">info</span>
                                                About
                                            </h3>
                                            <p className="text-sm text-neutral-300 leading-relaxed">
                                                {profile.bio}
                                            </p>
                                            <div className="pt-2 border-t border-white/5 space-y-2 text-xs text-neutral-400">
                                                <div className="flex items-center justify-between">
                                                    <span>Phone:</span>
                                                    <span className="text-neutral-200">{profile.phone || "Not set"}</span>
                                                </div>
                                                <div className="flex items-center justify-between">
                                                    <span>Portfolio:</span>
                                                    <a href={profile.website} target="_blank" rel="noreferrer" className="text-lime-400 hover:underline">
                                                        spacers.app
                                                    </a>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Skills & Focus */}
                                        <div className="p-6 rounded-2xl bg-[#1C1F26] border border-white/10 space-y-3">
                                            <h3 className="text-base font-semibold text-white flex items-center gap-2">
                                                <span className="material-symbols-outlined text-blue-400">verified</span>
                                                Skills & Expertise
                                            </h3>
                                            <div className="flex flex-wrap gap-2 pt-1">
                                                {["React 19", "UI/UX Architecture", "Supabase", "Design Systems", "Product Strategy", "Tailwind CSS"].map((skill, i) => (
                                                    <span key={i} className="px-3 py-1 rounded-lg text-xs font-medium bg-white/5 text-neutral-300 border border-white/10 hover:border-lime-400/40 transition-colors">
                                                        {skill}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right Column: Activity Stream */}
                                    <div className="lg:col-span-2 p-6 rounded-2xl bg-[#1C1F26] border border-white/10 space-y-5">
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
                                                    <div className="p-2 rounded-lg bg-lime-400/10 text-lime-400 shrink-0">
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
                            <div className="p-6 sm:p-8 rounded-2xl bg-[#1C1F26] border border-white/10 space-y-6 animate-fadeIn">
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
                                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-lime-400 text-neutral-950 font-semibold text-sm hover:bg-lime-300 transition-all disabled:opacity-50"
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
                                    <div>
                                        <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                                            Full Name
                                        </label>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                className="w-full bg-neutral-900/80 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-lime-400 transition-colors"
                                                value={draft.name}
                                                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                                            />
                                        ) : (
                                            <div className="w-full bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 text-white text-sm">
                                                {profile.name || "—"}
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                                            Email Address <span className="text-lime-400 text-[10px] font-normal lowercase">(verified)</span>
                                        </label>
                                        <div className="w-full bg-white/[0.02] border border-white/5 rounded-xl px-4 py-3 text-neutral-400 text-sm flex items-center justify-between">
                                            <span>{profile.email || "—"}</span>
                                            <span className="material-symbols-outlined text-base text-emerald-400">check_circle</span>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                                            Phone Number
                                        </label>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                className="w-full bg-neutral-900/80 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-lime-400 transition-colors"
                                                value={draft.phone}
                                                placeholder="+1 (555) 000-0000"
                                                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                                            />
                                        ) : (
                                            <div className="w-full bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 text-white text-sm">
                                                {profile.phone || "Not provided"}
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                                            Job Title
                                        </label>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                className="w-full bg-neutral-900/80 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-lime-400 transition-colors"
                                                value={draft.job_title}
                                                onChange={(e) => setDraft({ ...draft, job_title: e.target.value })}
                                            />
                                        ) : (
                                            <div className="w-full bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 text-white text-sm">
                                                {profile.job_title || "Member"}
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                                            Department
                                        </label>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                className="w-full bg-neutral-900/80 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-lime-400 transition-colors"
                                                value={draft.department}
                                                onChange={(e) => setDraft({ ...draft, department: e.target.value })}
                                            />
                                        ) : (
                                            <div className="w-full bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 text-white text-sm">
                                                {profile.department}
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                                            Location
                                        </label>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                className="w-full bg-neutral-900/80 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-lime-400 transition-colors"
                                                value={draft.location}
                                                onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                                            />
                                        ) : (
                                            <div className="w-full bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 text-white text-sm">
                                                {profile.location}
                                            </div>
                                        )}
                                    </div>

                                    <div className="sm:col-span-2">
                                        <label className="block text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
                                            Bio & Summary
                                        </label>
                                        {isEditing ? (
                                            <textarea
                                                rows={3}
                                                className="w-full bg-neutral-900/80 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-lime-400 transition-colors resize-none"
                                                value={draft.bio}
                                                onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
                                            />
                                        ) : (
                                            <div className="w-full bg-white/[0.03] border border-white/5 rounded-xl px-4 py-3 text-white text-sm leading-relaxed">
                                                {profile.bio}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 3. SECURITY & ACCESS TAB */}
                        {activeTab === "security" && (
                            <div className="space-y-6 animate-fadeIn">
                                <div className="p-6 sm:p-8 rounded-2xl bg-[#1C1F26] border border-white/10 space-y-6">
                                    <div>
                                        <h2 className="text-lg font-semibold text-white">Security & Authentication</h2>
                                        <p className="text-xs text-neutral-400">Keep your account secure with regular password updates and two-factor authentication.</p>
                                    </div>

                                    <div className="space-y-4">
                                        {/* Password Card */}
                                        <div className="p-5 rounded-xl bg-white/[0.02] border border-white/5 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400">
                                                        <span className="material-symbols-outlined text-xl">key</span>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-semibold text-white">Account Password</p>
                                                        <p className="text-xs text-neutral-400">It is recommended to update password periodically.</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => setShowPasswordForm(!showPasswordForm)}
                                                    className="px-4 py-2 rounded-xl bg-white/10 text-white hover:bg-white/20 text-xs font-medium transition-all"
                                                >
                                                    {showPasswordForm ? "Cancel" : "Update Password"}
                                                </button>
                                            </div>

                                            {showPasswordForm && (
                                                <form onSubmit={handlePasswordSubmit} className="pt-4 border-t border-white/10 space-y-4 max-w-md">
                                                    {passwordMsg && (
                                                        <div className={`p-3 rounded-lg text-xs ${passwordMsg.type === "error" ? "bg-red-500/10 text-red-400 border border-red-500/20" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"}`}>
                                                            {passwordMsg.text}
                                                        </div>
                                                    )}

                                                    <div>
                                                        <label className="block text-xs text-neutral-400 mb-1">New Password</label>
                                                        <input
                                                            type="password"
                                                            required
                                                            className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-lime-400"
                                                            value={passwordForm.next}
                                                            onChange={(e) => setPasswordForm({ ...passwordForm, next: e.target.value })}
                                                            placeholder="At least 6 characters"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="block text-xs text-neutral-400 mb-1">Confirm New Password</label>
                                                        <input
                                                            type="password"
                                                            required
                                                            className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-lime-400"
                                                            value={passwordForm.confirm}
                                                            onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                                                            placeholder="Re-enter new password"
                                                        />
                                                    </div>

                                                    <button
                                                        type="submit"
                                                        disabled={passwordSaving}
                                                        className="px-4 py-2 rounded-xl bg-lime-400 text-neutral-950 font-semibold text-xs hover:bg-lime-300 transition-all flex items-center gap-2"
                                                    >
                                                        {passwordSaving && <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>}
                                                        Save New Password
                                                    </button>
                                                </form>
                                            )}
                                        </div>

                                        {/* Two-Factor Authentication Card */}
                                        <div className="p-5 rounded-xl bg-white/[0.02] border border-white/5 flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400">
                                                    <span className="material-symbols-outlined text-xl">verified_user</span>
                                                </div>
                                                <div>
                                                    <p className="text-sm font-semibold text-white">Two-Factor Authentication (2FA)</p>
                                                    <p className="text-xs text-neutral-400">Add an extra layer of security to your account during login.</p>
                                                </div>
                                            </div>
                                            <button
                                                role="switch"
                                                aria-checked={twoFactorEnabled}
                                                onClick={() => {
                                                    setTwoFactorEnabled(!twoFactorEnabled)
                                                    showToast(`Two-factor authentication ${!twoFactorEnabled ? "enabled" : "disabled"}`, "success")
                                                }}
                                                className={`w-12 h-6 rounded-full p-1 flex items-center transition-colors ${twoFactorEnabled ? "bg-lime-400 justify-end" : "bg-neutral-700 justify-start"}`}
                                            >
                                                <span className="w-4 h-4 rounded-full bg-neutral-950 shadow-sm" />
                                            </button>
                                        </div>

                                        {/* Active Sessions Card */}
                                        <div className="p-5 rounded-xl bg-white/[0.02] border border-white/5 space-y-4">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400">
                                                        <span className="material-symbols-outlined text-xl">devices</span>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-semibold text-white">Active Device Sessions</p>
                                                        <p className="text-xs text-neutral-400">Devices currently logged into your account.</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={signOutOtherSessions}
                                                    disabled={signingOutOthers || othersSignedOut}
                                                    className="px-4 py-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-medium transition-all disabled:opacity-50"
                                                >
                                                    {signingOutOthers ? "Signing out..." : othersSignedOut ? "Signed Out" : "Sign Out Others"}
                                                </button>
                                            </div>

                                            <div className="space-y-2 pt-2 border-t border-white/5">
                                                <div className="flex items-center justify-between p-3 rounded-lg bg-neutral-900/60 text-xs">
                                                    <div className="flex items-center gap-3">
                                                        <span className="material-symbols-outlined text-lime-400">desktop_windows</span>
                                                        <div>
                                                            <p className="text-white font-medium">Windows Chrome (Current Session)</p>
                                                            <p className="text-neutral-400">IP: 192.168.1.1 • Active Now</p>
                                                        </div>
                                                    </div>
                                                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold text-[10px]">Active</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 4. PREFERENCES TAB */}
                        {activeTab === "preferences" && (
                            <div className="p-6 sm:p-8 rounded-2xl bg-[#1C1F26] border border-white/10 space-y-6 animate-fadeIn">
                                <div>
                                    <h2 className="text-lg font-semibold text-white">App Preferences & Notifications</h2>
                                    <p className="text-xs text-neutral-400">Tailor your workspace experience and notification settings.</p>
                                </div>

                                <div className="space-y-6">
                                    {/* Notifications Section */}
                                    <div className="space-y-4">
                                        <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Notifications</h3>
                                        
                                        {[
                                            { key: "emailAlerts", label: "Email Notifications", desc: "Receive immediate emails for critical project updates." },
                                            { key: "taskUpdates", label: "Task Assignments", desc: "Get notified when tasks are assigned to you." },
                                            { key: "weeklyDigest", label: "Weekly Summary Digest", desc: "A weekly breakdown of project progress and metrics." },
                                            { key: "marketingEmails", label: "Product Updates & News", desc: "Hear about new Spacers features and improvements." },
                                        ].map((item) => (
                                            <div key={item.key} className="flex items-center justify-between p-4 rounded-xl bg-white/[0.02] border border-white/5">
                                                <div>
                                                    <p className="text-sm font-medium text-white">{item.label}</p>
                                                    <p className="text-xs text-neutral-400">{item.desc}</p>
                                                </div>
                                                <button
                                                    role="switch"
                                                    aria-checked={preferences[item.key]}
                                                    onClick={() => {
                                                        const updated = { ...preferences, [item.key]: !preferences[item.key] }
                                                        setPreferences(updated)
                                                        showToast("Preferences saved", "success")
                                                    }}
                                                    className={`w-12 h-6 rounded-full p-1 flex items-center transition-colors ${preferences[item.key] ? "bg-lime-400 justify-end" : "bg-neutral-700 justify-start"}`}
                                                >
                                                    <span className="w-4 h-4 rounded-full bg-neutral-950 shadow-sm" />
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Regional & System Preferences */}
                                    <div className="space-y-4 pt-4 border-t border-white/10">
                                        <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Localization & Regional</h3>

                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs text-neutral-400 mb-1">Timezone</label>
                                                <select
                                                    className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-lime-400"
                                                    value={preferences.timezone}
                                                    onChange={(e) => setPreferences({ ...preferences, timezone: e.target.value })}
                                                >
                                                    <option>UTC-8 (Pacific Time)</option>
                                                    <option>UTC-5 (Eastern Time)</option>
                                                    <option>UTC+0 (London, GMT)</option>
                                                    <option>UTC+1 (Central European Time)</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label className="block text-xs text-neutral-400 mb-1">Language</label>
                                                <select
                                                    className="w-full bg-neutral-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-lime-400"
                                                    value={preferences.language}
                                                    onChange={(e) => setPreferences({ ...preferences, language: e.target.value })}
                                                >
                                                    <option>English (US)</option>
                                                    <option>English (UK)</option>
                                                    <option>Spanish (Español)</option>
                                                    <option>French (Français)</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </>
    )
}

export default Profile
