import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import Sidebar from "./partials/SidebarRouter"
import Header from "./partials/header"
import { supabase, getSessionUser } from "./supabase"
import { usePreferences } from "./PreferencesContext"
import { useRole } from "./RoleContext"
import TwoFactorSettings from "./components/TwoFactorSettings"
import ComingSoonCard from "./components/ComingSoonCard"
import { changePassword, MIN_PASSWORD_LENGTH } from "./passwordChange"

export default function Settings() {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [activeTab, setActiveTab] = useState("workspace") // workspace, account, notifications, appearance, security, team, integrations
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [toast, setToast] = useState(null)
    const { preferences, updatePreferences } = usePreferences()
    const { isSuperAdmin, isAdmin, membershipData } = useRole()

    const notifications = preferences?.notifications || {}
    const appearance = preferences?.appearance || {}

    // Password form state
    const [passwordForm, setPasswordForm] = useState({ current: "", next: "", confirm: "" })
    const [passwordMsg, setPasswordMsg] = useState(null)

    // User & Org details from Supabase / localStorage
    const [user, setUser] = useState({
        id: "",
        name: "",
        email: "",
        role: "Member"
    })

    // Workspace Settings State
    const [workspace, setWorkspace] = useState({
        name: "",
        slug: "",
        description: "",
        defaultPage: "/",
        defaultVisibility: "team",
        dataRetention: "90_days",
        autoJoinDomain: true,
        allowedDomain: ""
    })

    // Integrations State (now from context)

    const showToast = (message, type = "success") => {
        setToast({ message, type })
        setTimeout(() => setToast(null), 3500)
    }

    // Load initial settings from localStorage / Supabase
    useEffect(() => {
        const fetchUserData = async () => {
            try {
                const authData = { user: await getSessionUser() }
                const authUser = authData?.user

                let fetchedOrgName = ""
                let derivedSlug = ""
                let derivedDomain = ""
                let derivedDescription = ""

                if (authUser) {
                    const { data: userProfile } = await supabase
                        .from("users")
                        .select("id, name, email, organization_id")
                        .eq("id", authUser.id)
                        .maybeSingle()

                    setUser({
                        id: authUser.id,
                        name: userProfile?.name || authUser.user_metadata?.full_name || "Workspace User",
                        email: authUser.email || userProfile?.email || "",
                        role: isSuperAdmin ? "Superadmin" : isAdmin ? "Admin" : membershipData?.role || "Member"
                    })

                    const userEmail = authUser.email || userProfile?.email || ""
                    const emailDomain = userEmail.includes("@") ? userEmail.split("@")[1].toLowerCase() : ""

                    const orgId = userProfile?.organization_id
                    if (orgId) {
                        const { data: orgData } = await supabase
                            .from("organizations")
                            .select("id, name")
                            .eq("id", orgId)
                            .maybeSingle()

                        if (orgData?.name) {
                            fetchedOrgName = orgData.name.toLowerCase().includes("redtech") ? "Spacer" : orgData.name
                            derivedSlug = fetchedOrgName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "workspace"
                            derivedDomain = emailDomain && !["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com"].includes(emailDomain)
                                ? emailDomain
                                : `${derivedSlug}.com`
                            derivedDescription = `${fetchedOrgName} workspace for cross-functional project tracking and engineering collaboration.`
                        }
                    } else if (emailDomain) {
                        derivedSlug = emailDomain.split(".")[0] || "workspace"
                        derivedDomain = emailDomain
                        derivedDescription = "Primary workspace for cross-functional project tracking and engineering collaboration."
                    }
                }

                // Restore local workspace settings if available, while ensuring real organization data takes precedence
                const savedWorkspace = localStorage.getItem("spacers_settings_workspace")
                let parsed = null
                if (savedWorkspace) {
                    try {
                        parsed = JSON.parse(savedWorkspace)
                    } catch (e) {
                        console.warn("Could not parse saved workspace settings:", e)
                    }
                }

                // Filter out any stale mock "Acme" values from localStorage
                const cleanCachedName = parsed?.name && !parsed.name.toLowerCase().includes("acme") ? parsed.name : ""
                const cleanCachedSlug = parsed?.slug && !parsed.slug.toLowerCase().includes("acme") ? parsed.slug : ""
                const cleanCachedDomain = parsed?.allowedDomain && !parsed.allowedDomain.toLowerCase().includes("acme") ? parsed.allowedDomain : ""
                const cleanCachedDesc = parsed?.description && !parsed.description.toLowerCase().includes("acme") ? parsed.description : ""

                const resolvedName = fetchedOrgName || cleanCachedName || "Workspace"
                const resolvedSlug = cleanCachedSlug || derivedSlug || (resolvedName ? resolvedName.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") : "workspace")
                const resolvedDomain = cleanCachedDomain || derivedDomain || `${resolvedSlug}.com`
                const resolvedDesc = cleanCachedDesc || derivedDescription || `${resolvedName} workspace for cross-functional project tracking and engineering collaboration.`

                setWorkspace(prev => ({
                    ...prev,
                    ...(parsed || {}),
                    name: resolvedName,
                    slug: resolvedSlug,
                    allowedDomain: resolvedDomain,
                    description: resolvedDesc
                }))
            } catch (err) {
                console.error("Error initializing settings:", err)
            } finally {
                setLoading(false)
            }
        }
        fetchUserData()
    }, [isSuperAdmin, isAdmin, membershipData])

    // Handlers
    const handleSaveWorkspace = async () => {
        setSaving(true)
        try {
            const authData = { user: await getSessionUser() }
            const authUser = authData?.user
            if (authUser) {
                const { data: userProfile } = await supabase
                    .from("users")
                    .select("organization_id")
                    .eq("id", authUser.id)
                    .maybeSingle()

                const orgId = userProfile?.organization_id
                if (orgId) {
                    const { error } = await supabase
                        .from("organizations")
                        .update({ name: workspace.name })
                        .eq("id", orgId)

                    if (error) {
                        alert("Error saving organization settings: " + error.message)
                        setSaving(false)
                        return
                    }
                }
            }
            localStorage.setItem("spacers_settings_workspace", JSON.stringify(workspace))
            showToast("Workspace settings saved successfully!")

            // Reload page to reflect name changes globally
            setTimeout(() => {
                window.location.reload()
            }, 1000)
        } catch (err) {
            console.error("Save workspace error:", err)
        } finally {
            setSaving(false)
        }
    }

    const handleSaveNotifications = async (updated) => {
        await updatePreferences("notifications", updated)
        showToast("Notification preferences updated!")
    }

    const handleSaveAppearance = async (updatedAppearance) => {
        await updatePreferences("appearance", updatedAppearance)
        showToast("Appearance preferences saved!")
    }


    const handlePasswordChange = async (e) => {
        e.preventDefault()
        if (passwordForm.next !== passwordForm.confirm) {
            setPasswordMsg({ type: "error", text: "New passwords do not match." })
            return
        }
        if (passwordForm.next.length < MIN_PASSWORD_LENGTH) {
            setPasswordMsg({ type: "error", text: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` })
            return
        }

        setSaving(true)
        // Server checks the current password, then signs out other devices
        const { error } = await changePassword(passwordForm.current, passwordForm.next)
        setSaving(false)

        if (error) {
            setPasswordMsg({ type: "error", text: error })
        } else {
            setPasswordMsg({ type: "success", text: "Password updated. You've been signed out on your other devices." })
            setPasswordForm({ current: "", next: "", confirm: "" })
            showToast("Password updated successfully!")
        }
    }

    const tabs = [
        { id: "workspace", label: "General & Workspace", icon: "domain" },
        { id: "account", label: "Account Overview", icon: "person" },
        { id: "notifications", label: "Notifications & Alerts", icon: "notifications" },
        { id: "appearance", label: "Appearance & Interface", icon: "palette" },
        { id: "security", label: "Security & Access", icon: "security" },
        { id: "team", label: "Team & Permissions", icon: "group_add" },
        { id: "integrations", label: "Connected Apps", icon: "extension" }
    ]

    return (
        <>
            <Sidebar onCollapsedChange={setSidebarCollapsed} />
            <Header />

            {/* Toast Notification */}
            {toast && (
                <div className="fixed top-20 right-6 z-[150] flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-container-highest border border-outline-variant shadow-2xl animate-bounce">
                    <span className={`material-symbols-outlined ${toast.type === "error" ? "text-error" : "text-primary-fixed"}`}>
                        {toast.type === "error" ? "error" : "check_circle"}
                    </span>
                    <p className="font-body-md text-on-surface font-medium">{toast.message}</p>
                </div>
            )}

            <main className={`${sidebarCollapsed ? "ml-[72px]" : "ml-[260px]"} flex-1 flex flex-col min-h-screen bg-background text-on-background transition-all duration-300 ease-out`}>
                <div className="p-lg space-y-lg max-w-7xl w-full mx-auto">

                    {/* Header & Breadcrumb */}
                    <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant pb-md">
                        <div>
                            <div className="flex items-center gap-2 text-on-surface-variant text-xs mb-1">
                                <Link to="/" className="hover:text-on-surface transition-colors flex items-center gap-1">
                                    <span className="material-symbols-outlined text-sm">home</span>
                                    <span>Home</span>
                                </Link>
                                <span>/</span>
                                <span className="text-on-surface font-medium">Settings</span>
                            </div>
                            <h1 className="text-headline-xl font-bold text-on-surface flex items-center gap-3">
                                Workspace Settings
                                <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary-container/20 text-primary-fixed font-semibold border border-primary-fixed/30">
                                    Spacers v2.4
                                </span>
                            </h1>
                            <p className="text-on-surface-variant font-body-md mt-1">
                                Manage workspace configurations, preferences, security, and member access controls.
                            </p>
                        </div>
                    </section>

                    {/* Main Settings Layout Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-lg items-start">

                        {/* Navigation Sidebar Tabs */}
                        <div className="lg:col-span-3 glass-card rounded-2xl p-sm space-y-1">
                            {tabs.map((tab) => {
                                const isActive = activeTab === tab.id
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={`w-full flex items-center gap-md px-md py-3 rounded-xl font-body-md transition-all duration-200 text-left ${isActive
                                            ? "bg-primary-container text-on-primary-container font-semibold shadow-sm"
                                            : "text-on-surface-variant hover:bg-surface-variant hover:text-on-surface"
                                            }`}
                                    >
                                        <span className={`material-symbols-outlined text-xl ${isActive ? "text-on-primary-container" : "text-on-surface-variant"}`}>
                                            {tab.icon}
                                        </span>
                                        <span className="truncate">{tab.label}</span>
                                    </button>
                                )
                            })}
                        </div>

                        {/* Content Area */}
                        <div className="lg:col-span-9 space-y-lg">

                            {/* 1. GENERAL & WORKSPACE TAB */}
                            {activeTab === "workspace" && (
                                <div className="glass-card rounded-2xl p-lg space-y-lg">
                                    <div className="border-b border-outline-variant pb-md">
                                        <h2 className="text-headline-md font-semibold text-on-surface">General Workspace Settings</h2>
                                        <p className="text-on-surface-variant font-body-sm mt-1">
                                            Configure core workspace properties, defaults, and data policies.
                                        </p>
                                    </div>

                                    <div className="space-y-md">
                                        {/* Workspace Name */}
                                        <div>
                                            <label className="block text-label-md font-semibold text-on-surface mb-2">Workspace Name</label>
                                            <input
                                                type="text"
                                                className="w-full bg-surface-container-highest border border-outline-variant rounded-xl px-md py-2.5 text-on-surface font-body-md focus:ring-2 focus:ring-primary-fixed focus:outline-none"
                                                placeholder="e.g. My Organization"
                                                value={workspace.name}
                                                onChange={(e) => setWorkspace({ ...workspace, name: e.target.value })}
                                            />
                                        </div>

                                        {/* Workspace URL / Slug */}
                                        <div>
                                            <label className="block text-label-md font-semibold text-on-surface mb-2">Workspace URL</label>
                                            <div className="flex items-center rounded-xl bg-surface-container-highest border border-outline-variant overflow-hidden">
                                                <span className="px-md py-2.5 text-on-surface-variant font-body-sm bg-surface-container-high border-r border-outline-variant select-none">
                                                    https://spacers.app/
                                                </span>
                                                <input
                                                    type="text"
                                                    className="w-full bg-transparent px-md py-2.5 text-on-surface font-body-md focus:outline-none"
                                                    placeholder="workspace-slug"
                                                    value={workspace.slug}
                                                    onChange={(e) => setWorkspace({ ...workspace, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })}
                                                />
                                            </div>
                                        </div>

                                        {/* Allowed Email Domain */}
                                        <div>
                                            <label className="block text-label-md font-semibold text-on-surface mb-2">Allowed Email Domain</label>
                                            <div className="flex items-center rounded-xl bg-surface-container-highest border border-outline-variant overflow-hidden">
                                                <span className="px-md py-2.5 text-on-surface-variant font-body-sm bg-surface-container-high border-r border-outline-variant select-none">
                                                    @
                                                </span>
                                                <input
                                                    type="text"
                                                    className="w-full bg-transparent px-md py-2.5 text-on-surface font-body-md focus:outline-none"
                                                    placeholder="company.com"
                                                    value={workspace.allowedDomain}
                                                    onChange={(e) => setWorkspace({ ...workspace, allowedDomain: e.target.value.toLowerCase().replace(/[@\s]/g, "") })}
                                                />
                                            </div>
                                            <p className="text-on-surface-variant text-xs mt-1">
                                                Team members with this email domain can automatically join your workspace.
                                            </p>
                                        </div>

                                        {/* Description */}
                                        <div>
                                            <label className="block text-label-md font-semibold text-on-surface mb-2">Workspace Description</label>
                                            <textarea
                                                rows="3"
                                                className="w-full bg-surface-container-highest border border-outline-variant rounded-xl p-md text-on-surface font-body-md focus:ring-2 focus:ring-primary-fixed focus:outline-none"
                                                placeholder="Brief workspace description..."
                                                value={workspace.description}
                                                onChange={(e) => setWorkspace({ ...workspace, description: e.target.value })}
                                            />
                                        </div>

                                        {/* Default Landing Page & Visibility */}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-md pt-md border-t border-outline-variant">
                                            <div>
                                                <label className="block text-label-md font-semibold text-on-surface mb-2">Default Landing View</label>
                                                <select
                                                    className="w-full bg-surface-container-highest border border-outline-variant rounded-xl px-md py-2.5 text-on-surface font-body-md focus:ring-2 focus:ring-primary-fixed focus:outline-none"
                                                    value={workspace.defaultPage}
                                                    onChange={(e) => setWorkspace({ ...workspace, defaultPage: e.target.value })}
                                                >
                                                    <option value="/">Home Dashboard</option>
                                                    <option value="/calendar">Calendar View</option>
                                                    <option value="/department">Department Overview</option>
                                                    <option value="/reports">Reports & Analytics</option>
                                                </select>
                                            </div>

                                            <div>
                                                <label className="block text-label-md font-semibold text-on-surface mb-2">Default Project Privacy</label>
                                                <select
                                                    className="w-full bg-surface-container-highest border border-outline-variant rounded-xl px-md py-2.5 text-on-surface font-body-md focus:ring-2 focus:ring-primary-fixed focus:outline-none"
                                                    value={workspace.defaultVisibility}
                                                    onChange={(e) => setWorkspace({ ...workspace, defaultVisibility: e.target.value })}
                                                >
                                                    <option value="team">Team Members Only</option>
                                                    <option value="private">Private (Invite Only)</option>
                                                    <option value="public">Public to Workspace</option>
                                                </select>
                                            </div>
                                        </div>

                                        {/* Data Retention */}
                                        <div>
                                            <label className="block text-label-md font-semibold text-on-surface mb-2">Data & Activity Log Retention</label>
                                            <select
                                                className="w-full bg-surface-container-highest border border-outline-variant rounded-xl px-md py-2.5 text-on-surface font-body-md focus:ring-2 focus:ring-primary-fixed focus:outline-none"
                                                value={workspace.dataRetention}
                                                onChange={(e) => setWorkspace({ ...workspace, dataRetention: e.target.value })}
                                            >
                                                <option value="30_days">30 Days</option>
                                                <option value="90_days">90 Days (Recommended)</option>
                                                <option value="1_year">1 Year</option>
                                                <option value="indefinite">Indefinite (Enterprise)</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Action Footer */}
                                    <div className="flex items-center justify-end gap-md pt-lg border-t border-outline-variant">
                                        <button
                                            type="button"
                                            onClick={handleSaveWorkspace}
                                            disabled={saving}
                                            className="px-lg py-2.5 bg-primary-container text-on-primary-container font-semibold rounded-xl flex items-center gap-sm hover:scale-[0.98] transition-all disabled:opacity-50"
                                        >
                                            <span className="material-symbols-outlined text-lg">save</span>
                                            {saving ? "Saving..." : "Save Workspace Changes"}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* 2. ACCOUNT OVERVIEW TAB */}
                            {activeTab === "account" && (
                                <div className="glass-card rounded-2xl p-lg space-y-lg">
                                    <div className="border-b border-outline-variant pb-md flex items-center justify-between">
                                        <div>
                                            <h2 className="text-headline-md font-semibold text-on-surface">Account Summary</h2>
                                            <p className="text-on-surface-variant font-body-sm mt-1">
                                                Your current credentials and user profile information.
                                            </p>
                                        </div>
                                        <Link
                                            to="/profile"
                                            className="px-md py-2 bg-surface-container-highest border border-outline-variant text-on-surface hover:bg-surface-variant font-body-sm font-semibold rounded-xl flex items-center gap-sm transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-lg">edit</span>
                                            Edit Full Profile
                                        </Link>
                                    </div>

                                    <div className="flex items-center gap-lg p-md rounded-xl bg-surface-container-low border border-outline-variant">
                                        <div className="w-16 h-16 rounded-2xl bg-primary-container text-on-primary-container font-bold text-2xl flex items-center justify-center border-2 border-primary-fixed/40">
                                            {user.name ? user.name.slice(0, 2).toUpperCase() : "U"}
                                        </div>
                                        <div className="space-y-1">
                                            <h3 className="text-headline-md font-bold text-on-surface">{user.name}</h3>
                                            <p className="text-on-surface-variant font-body-sm">{user.email}</p>
                                            <div className="flex items-center gap-sm text-xs text-on-surface-variant pt-1">
                                                <span className="px-2 py-0.5 rounded bg-surface-container-highest text-primary-fixed border border-primary-fixed/20 font-semibold">
                                                    {user.role}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                                        <div className="p-md rounded-xl bg-surface-container-highest/50 border border-outline-variant space-y-1">
                                            <p className="text-label-md text-on-surface-variant uppercase tracking-wider">User Identifier</p>
                                            <p className="font-mono text-xs text-on-surface truncate">{user.id || "usr_8f9a2b1c4e"}</p>
                                        </div>
                                        <div className="p-md rounded-xl bg-surface-container-highest/50 border border-outline-variant space-y-1">
                                            <p className="text-label-md text-on-surface-variant uppercase tracking-wider">Account Status</p>
                                            <div className="flex items-center gap-2">
                                                <span className="w-2.5 h-2.5 rounded-full bg-primary-fixed"></span>
                                                <span className="text-body-md font-medium text-on-surface">Active & Verified</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 3. NOTIFICATIONS TAB */}
                            {activeTab === "notifications" && (
                                <div className="glass-card rounded-2xl p-lg space-y-lg">
                                    <div className="border-b border-outline-variant pb-md">
                                        <h2 className="text-headline-md font-semibold text-on-surface">Notifications & Alerts</h2>
                                        <p className="text-on-surface-variant font-body-sm mt-1">
                                            Control when and how you receive updates and automated digests.
                                        </p>
                                    </div>

                                    <div className="space-y-md">
                                        {[
                                            { key: "emailAlerts", label: "Email Notifications", desc: "Receive immediate emails for critical project updates and direct mentions." },
                                            { key: "taskAssigned", label: "Task Assignments & Due Dates", desc: "Get notified as soon as a task is assigned or its status changes." },
                                            { key: "projectUpdates", label: "Project Milestone Changes", desc: "Alerts when projects achieve milestone completions." },
                                            { key: "weeklyDigest", label: "Weekly Productivity Digest", desc: "Receive a weekly summary email of pending tasks and team reports." },
                                            { key: "desktopPush", label: "Browser Desktop Push Notifications", desc: "Enable real-time push alerts on your desktop browser." },
                                            { key: "soundEffects", label: "In-App Audio Effects", desc: "Play subtle sound effects on task completion and notifications." }
                                        ].map((item) => (
                                            <div key={item.key} className="flex items-center justify-between p-md rounded-xl bg-surface-container-low border border-outline-variant hover:border-outline transition-colors">
                                                <div>
                                                    <p className="font-body-md font-semibold text-on-surface">{item.label}</p>
                                                    <p className="text-body-sm text-on-surface-variant">{item.desc}</p>
                                                </div>
                                                <button
                                                    role="switch"
                                                    aria-checked={notifications[item.key]}
                                                    onClick={() => {
                                                        const next = { ...notifications, [item.key]: !notifications[item.key] }
                                                        handleSaveNotifications(next)
                                                    }}
                                                    className={`w-12 h-6 rounded-full p-1 flex items-center transition-all duration-300 ${notifications[item.key] ? "bg-primary-container justify-end" : "bg-surface-container-highest justify-start"
                                                        }`}
                                                >
                                                    <span className={`w-4 h-4 rounded-full shadow-md transition-transform ${notifications[item.key] ? "bg-on-primary-container" : "bg-on-surface-variant"}`} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="pt-md border-t border-outline-variant">
                                        <label className="block text-label-md font-semibold text-on-surface mb-2">Notification Delivery Frequency</label>
                                        <select
                                            className="w-full bg-surface-container-highest border border-outline-variant rounded-xl px-md py-2.5 text-on-surface font-body-md focus:ring-2 focus:ring-primary-fixed focus:outline-none"
                                            value={notifications.frequency}
                                            onChange={(e) => {
                                                const next = { ...notifications, frequency: e.target.value }
                                                handleSaveNotifications(next)
                                            }}
                                        >
                                            <option value="realtime">Real-time (Immediate)</option>
                                            <option value="hourly">Hourly Summary Batch</option>
                                            <option value="daily">Daily Morning Digest</option>
                                        </select>
                                    </div>
                                </div>
                            )}

                            {/* 4. APPEARANCE & INTERFACE TAB */}
                            {activeTab === "appearance" && (
                                <div className="glass-card rounded-2xl p-lg space-y-lg">
                                    <div className="border-b border-outline-variant pb-md">
                                        <h2 className="text-headline-md font-semibold text-on-surface">Appearance & Interface Customization</h2>
                                        <p className="text-on-surface-variant font-body-sm mt-1">
                                            Configure workspace themes, layout alignment, display densities, and animation speeds.
                                        </p>
                                    </div>

                                    {/* Theme Cards Grid */}
                                    <div className="space-y-sm">
                                        <label className="block text-label-md font-semibold text-on-surface">Color Theme Base</label>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-4 gap-md">
                                            {[
                                                { id: "dark", label: "Obsidian Dark", desc: "Sleek dark olive-grey", color: "#101509" },
                                                { id: "high_contrast", label: "High Contrast", desc: "Pure black and bright borders", color: "#000000" },
                                                { id: "midnight", label: "Midnight Blue", desc: "Deep space navy blue", color: "#0b0f19" },
                                                { id: "emerald", label: "Forest Emerald", desc: "Rich organic green theme", color: "#05100a" },
                                                { id: "amethyst", label: "Deep Amethyst", desc: "Dark luxurious violet", color: "#0c0714" },
                                                { id: "crimson", label: "Cyberpunk Red", desc: "Neon red hacker aesthetic", color: "#140505" },
                                                { id: "system", label: "System Sync", desc: "Syncs with OS preferences", color: "#191d11" }
                                            ].map((t) => (
                                                <button
                                                    key={t.id}
                                                    onClick={() => handleSaveAppearance({ ...appearance, theme: t.id })}
                                                    className={`p-md rounded-xl border text-left flex flex-col justify-between h-28 transition-all duration-200 ${appearance.theme === t.id
                                                        ? "border-primary-fixed bg-surface-container-high ring-1 ring-primary-fixed scale-[0.98]"
                                                        : "border-outline-variant bg-surface-container-low hover:border-outline hover:scale-[1.01]"
                                                        }`}
                                                >
                                                    <div className="flex items-center justify-between w-full">
                                                        <span className="font-body-md font-bold text-on-surface text-sm truncate">{t.label}</span>
                                                        {appearance.theme === t.id && (
                                                            <span className="material-symbols-outlined text-primary-fixed text-sm">check_circle</span>
                                                        )}
                                                    </div>
                                                    <p className="text-[10px] text-on-surface-variant leading-tight">{t.desc}</p>
                                                    <div className="w-full h-2 rounded-full mt-2" style={{ backgroundColor: t.color, border: "1px solid rgba(255,255,255,0.15)" }} />
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Accent Color Palette */}
                                    <div className="space-y-sm pt-md border-t border-outline-variant">
                                        <label className="block text-label-md font-semibold text-on-surface">Accent Highlight Color</label>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-sm">
                                            {[
                                                { id: "lime", name: "Electric Lime", hex: "#aff82a" },
                                                { id: "cyan", name: "Cyber Cyan", hex: "#00f0ff" },
                                                { id: "purple", name: "Neon Purple", hex: "#a855f7" },
                                                { id: "gold", name: "Amber Gold", hex: "#fbbf24" },
                                                { id: "rose", name: "Rose/Ruby", hex: "#f43f5e" },
                                                { id: "orange", name: "Sunset Orange", hex: "#f97316" },
                                                { id: "sapphire", name: "Sapphire Blue", hex: "#3b82f6" },
                                                { id: "green", name: "Forest Green", hex: "#22c55e" }
                                            ].map((acc) => (
                                                <button
                                                    key={acc.id}
                                                    onClick={() => handleSaveAppearance({ ...appearance, accentColor: acc.id })}
                                                    className={`flex items-center gap-2 px-md py-2.5 rounded-xl border font-body-sm transition-all duration-200 ${appearance.accentColor === acc.id
                                                        ? "border-primary-fixed bg-surface-container-highest ring-1 ring-primary-fixed"
                                                        : "border-outline-variant bg-surface-container-low hover:border-outline"
                                                        }`}
                                                >
                                                    <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: acc.hex }} />
                                                    <span className="text-on-surface font-medium truncate text-xs">{acc.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Layout Options Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-lg pt-md border-t border-outline-variant">

                                        {/* Sidebar Placement */}
                                        <div className="space-y-2">
                                            <label className="block text-label-md font-semibold text-on-surface">Sidebar Position</label>
                                            <p className="text-body-sm text-on-surface-variant">Choose which side of the screen your sidebar displays.</p>
                                            <div className="flex gap-sm">
                                                {[
                                                    { id: "left", label: "Left Alignment", icon: "align_horizontal_left" },
                                                    { id: "right", label: "Right Alignment", icon: "align_horizontal_right" }
                                                ].map((pos) => (
                                                    <button
                                                        key={pos.id}
                                                        onClick={() => handleSaveAppearance({ ...appearance, sidebarPosition: pos.id })}
                                                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-md border rounded-xl font-body-sm transition-all ${(appearance.sidebarPosition || "left") === pos.id
                                                            ? "border-primary-fixed bg-surface-container-highest text-primary-fixed"
                                                            : "border-outline-variant bg-surface-container-low text-on-surface-variant hover:border-outline"
                                                            }`}
                                                    >
                                                        <span className="material-symbols-outlined text-sm">{pos.icon}</span>
                                                        <span>{pos.label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Interface Density */}
                                        <div className="space-y-2">
                                            <label className="block text-label-md font-semibold text-on-surface">Layout Density</label>
                                            <p className="text-body-sm text-on-surface-variant">Adjust spaces, padding and sizing parameters.</p>
                                            <div className="flex gap-sm">
                                                {[
                                                    { id: "compact", label: "Compact", icon: "density_medium" },
                                                    { id: "comfortable", label: "Comfortable", icon: "density_small" },
                                                    { id: "spacious", label: "Spacious", icon: "density_large" }
                                                ].map((den) => (
                                                    <button
                                                        key={den.id}
                                                        onClick={() => handleSaveAppearance({ ...appearance, density: den.id })}
                                                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-md border rounded-xl font-body-sm transition-all ${(appearance.density || "comfortable") === den.id
                                                            ? "border-primary-fixed bg-surface-container-highest text-primary-fixed"
                                                            : "border-outline-variant bg-surface-container-low text-on-surface-variant hover:border-outline"
                                                            }`}
                                                    >
                                                        <span className="material-symbols-outlined text-sm">{den.icon}</span>
                                                        <span>{den.label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Animation Speed */}
                                        <div className="space-y-2">
                                            <label className="block text-label-md font-semibold text-on-surface">Animations & Motion</label>
                                            <p className="text-body-sm text-on-surface-variant">Transition speed profiles for interface interactions.</p>
                                            <div className="flex gap-sm">
                                                {[
                                                    { id: "smooth", label: "Smooth (Default)", icon: "motion_photos_on" },
                                                    { id: "fast", label: "Fast & Snappy", icon: "bolt" },
                                                    { id: "none", label: "None (Reduced)", icon: "motion_photos_off" }
                                                ].map((speed) => (
                                                    <button
                                                        key={speed.id}
                                                        onClick={() => handleSaveAppearance({ ...appearance, animationSpeed: speed.id })}
                                                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-md border rounded-xl font-body-sm transition-all ${(appearance.animationSpeed || "smooth") === speed.id
                                                            ? "border-primary-fixed bg-surface-container-highest text-primary-fixed"
                                                            : "border-outline-variant bg-surface-container-low text-on-surface-variant hover:border-outline"
                                                            }`}
                                                    >
                                                        <span className="material-symbols-outlined text-sm">{speed.icon}</span>
                                                        <span>{speed.label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Glassmorphism Strength */}
                                        <div className="space-y-2">
                                            <label className="block text-label-md font-semibold text-on-surface">Card Styling (Glassmorphism)</label>
                                            <p className="text-body-sm text-on-surface-variant">Control translucency blur strength on interface cards.</p>
                                            <div className="flex gap-sm">
                                                {[
                                                    { id: "soft", label: "Soft Glow", icon: "blur_on" },
                                                    { id: "intense", label: "Intense Frost", icon: "opacity" },
                                                    { id: "flat", label: "Flat Solid", icon: "layers_clear" }
                                                ].map((gl) => (
                                                    <button
                                                        key={gl.id}
                                                        onClick={() => handleSaveAppearance({ ...appearance, glassmorphism: gl.id })}
                                                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-md border rounded-xl font-body-sm transition-all ${(appearance.glassmorphism || "soft") === gl.id
                                                            ? "border-primary-fixed bg-surface-container-highest text-primary-fixed"
                                                            : "border-outline-variant bg-surface-container-low text-on-surface-variant hover:border-outline"
                                                            }`}
                                                    >
                                                        <span className="material-symbols-outlined text-sm">{gl.icon}</span>
                                                        <span>{gl.label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                    </div>
                                </div>
                            )}

                            {/* 5. SECURITY & ACCESS TAB */}
                            {activeTab === "security" && (
                                <div className="glass-card rounded-2xl p-lg space-y-lg">
                                    <div className="border-b border-outline-variant pb-md">
                                        <h2 className="text-headline-md font-semibold text-on-surface">Security & Authentication</h2>
                                        <p className="text-on-surface-variant font-body-sm mt-1">
                                            Manage your multi-factor authentication, passwords, and API tokens.
                                        </p>
                                    </div>

                                    {/* Two-factor authentication (Supabase MFA) */}
                                    <TwoFactorSettings onNotify={showToast} />

                                    {/* Password Change Section */}
                                    <div className="space-y-md pt-md border-t border-outline-variant">
                                        <h3 className="text-label-md font-semibold text-on-surface uppercase tracking-wider">Change Password</h3>
                                        {passwordMsg && (
                                            <div className={`p-md rounded-xl text-sm font-medium ${passwordMsg.type === "error" ? "bg-error-container/20 text-error border border-error-container" : "bg-primary-container/20 text-primary-fixed border border-primary-fixed/30"}`}>
                                                {passwordMsg.text}
                                            </div>
                                        )}
                                        <form onSubmit={handlePasswordChange} className="space-y-md max-w-md">
                                            <div>
                                                <label className="block text-body-sm text-on-surface-variant mb-1">Current Password</label>
                                                <input
                                                    type="password"
                                                    required
                                                    autoComplete="current-password"
                                                    className="w-full bg-surface-container-highest border border-outline-variant rounded-xl px-md py-2 text-on-surface font-body-md focus:ring-2 focus:ring-primary-fixed focus:outline-none"
                                                    value={passwordForm.current}
                                                    onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-body-sm text-on-surface-variant mb-1">New Password</label>
                                                <input
                                                    type="password"
                                                    required
                                                    className="w-full bg-surface-container-highest border border-outline-variant rounded-xl px-md py-2 text-on-surface font-body-md focus:ring-2 focus:ring-primary-fixed focus:outline-none"
                                                    value={passwordForm.next}
                                                    onChange={(e) => setPasswordForm({ ...passwordForm, next: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-body-sm text-on-surface-variant mb-1">Confirm New Password</label>
                                                <input
                                                    type="password"
                                                    required
                                                    className="w-full bg-surface-container-highest border border-outline-variant rounded-xl px-md py-2 text-on-surface font-body-md focus:ring-2 focus:ring-primary-fixed focus:outline-none"
                                                    value={passwordForm.confirm}
                                                    onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                                                />
                                            </div>
                                            <button
                                                type="submit"
                                                disabled={saving}
                                                className="px-md py-2 bg-primary-container text-on-primary-container font-semibold rounded-xl hover:scale-[0.98] transition-all disabled:opacity-50"
                                            >
                                                {saving ? "Updating..." : "Update Password"}
                                            </button>
                                        </form>
                                    </div>

                                    {/* Personal Access Tokens: not built yet */}
                                    <div className="pt-md border-t border-outline-variant">
                                        <ComingSoonCard icon="key" title="Personal Access Tokens" description="Tokens for the Spacer CLI and API webhooks" />
                                    </div>
                                </div>
                            )}

                            {/* 6. TEAM & PERMISSIONS TAB */}
                            {activeTab === "team" && (
                                <div className="glass-card rounded-2xl p-lg space-y-lg">
                                    <div className="border-b border-outline-variant pb-md">
                                        <h2 className="text-headline-md font-semibold text-on-surface">Team Roles & Permissions</h2>
                                        <p className="text-on-surface-variant font-body-sm mt-1">
                                            Manage member invitation policies and seat utilization.
                                        </p>
                                    </div>

                                    {/* Seat Utilization Bar */}
                                    <div className="p-md rounded-xl bg-surface-container-low border border-outline-variant space-y-2">
                                        <div className="flex items-center justify-between text-body-sm font-semibold">
                                            <span className="text-on-surface">Organization License Seats</span>
                                            <span className="text-primary-fixed">14 of 25 seats used</span>
                                        </div>
                                        <div className="h-2.5 rounded-full bg-surface-container-highest overflow-hidden">
                                            <div className="h-full rounded-full bg-primary-fixed w-[56%] transition-all duration-500" />
                                        </div>
                                    </div>

                                    {/* Permissions Switches */}
                                    <div className="space-y-md">
                                        <div className="flex items-center justify-between p-md rounded-xl bg-surface-container-low border border-outline-variant">
                                            <div>
                                                <p className="font-body-md font-semibold text-on-surface">Automated Domain Joining</p>
                                                <p className="text-body-sm text-on-surface-variant">
                                                    Allow anyone with an @{workspace.allowedDomain || (workspace.slug ? `${workspace.slug}.com` : "domain.com")} email address to automatically join workspace.
                                                </p>
                                            </div>
                                            <button
                                                role="switch"
                                                aria-checked={workspace.autoJoinDomain}
                                                onClick={() => setWorkspace({ ...workspace, autoJoinDomain: !workspace.autoJoinDomain })}
                                                className={`w-12 h-6 rounded-full p-1 flex items-center transition-all ${workspace.autoJoinDomain ? "bg-primary-container justify-end" : "bg-surface-container-highest justify-start"
                                                    }`}
                                            >
                                                <span className={`w-4 h-4 rounded-full ${workspace.autoJoinDomain ? "bg-on-primary-container" : "bg-on-surface-variant"}`} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 7. CONNECTED APPS TAB */}
                            {activeTab === "integrations" && (
                                <div className="glass-card rounded-2xl p-lg space-y-lg">
                                    <div className="border-b border-outline-variant pb-md">
                                        <h2 className="text-headline-md font-semibold text-on-surface">Connected Services & Integrations</h2>
                                        <p className="text-on-surface-variant font-body-sm mt-1">
                                            Extend Spacers functionality with external developer tools and services.
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                                        {/* Integrations: not built yet */}
                                        <ComingSoonCard icon="code" title="GitHub Sync" description="Link PRs & commits to tasks" />
                                        <ComingSoonCard icon="chat" title="Slack Bot" description="Post daily task digests" />
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            </main>

        </>
    )
}
