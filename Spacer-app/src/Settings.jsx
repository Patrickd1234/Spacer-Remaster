import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import Sidebar from "./partials/sidebar"
import Header from "./partials/header"
import { supabase } from "./supabase"
import { usePreferences } from "./PreferencesContext"
import { useRole } from "./RoleContext"

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
    const security = preferences?.security || {}
    const integrations = preferences?.integrations || {}

    // Password form state
    const [passwordForm, setPasswordForm] = useState({ current: "", next: "", confirm: "" })
    const [passwordMsg, setPasswordMsg] = useState(null)

    // Personal Access Tokens State
    const [apiTokens, setApiTokens] = useState([
        { id: "tok_1", name: "CI/CD Deployment Pipeline", created: "2026-05-12", lastUsed: "2 hours ago" },
        { id: "tok_2", name: "Figma Spacers Plugin", created: "2026-06-01", lastUsed: "Yesterday" }
    ])
    const [newTokenName, setNewTokenName] = useState("")
    const [showTokenModal, setShowTokenModal] = useState(false)

    // User & Org details from Supabase / localStorage
    const [user, setUser] = useState({
        id: "",
        name: "",
        email: "",
        role: "Member"
    })

    // Workspace Settings State
    const [workspace, setWorkspace] = useState({
        name: "Acme Workspace",
        slug: "acme-corp",
        description: "Primary workspace for cross-functional project tracking and engineering collaboration.",
        defaultPage: "/",
        defaultVisibility: "team",
        dataRetention: "90_days",
        autoJoinDomain: true,
        allowedDomain: "acme.com"
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
                const { data: authData } = await supabase.auth.getUser()
                const authUser = authData?.user

                if (authUser) {
                    const { data: userProfile } = await supabase
                        .from("users")
                        .select("*")
                        .eq("id", authUser.id)
                        .maybeSingle()

                    setUser({
                        id: authUser.id,
                        name: userProfile?.name || authUser.user_metadata?.full_name || "Workspace User",
                        email: authUser.email || "",
                        role: isSuperAdmin ? "Superadmin" : isAdmin ? "Admin" : membershipData?.role || "Member"
                    })
                }

                // Restore local workspace settings if available
                const savedWorkspace = localStorage.getItem("spacers_settings_workspace")
                if (savedWorkspace) setWorkspace(JSON.parse(savedWorkspace))
            } catch (err) {
                console.error("Error initializing settings:", err)
            } finally {
                setLoading(false)
            }
        }
        fetchUserData()
    }, [])

    // Handlers
    const handleSaveWorkspace = () => {
        setSaving(true)
        setTimeout(() => {
            localStorage.setItem("spacers_settings_workspace", JSON.stringify(workspace))
            setSaving(false)
            showToast("Workspace settings saved successfully!")
        }, 500)
    }

    const handleSaveNotifications = async (updated) => {
        await updatePreferences("notifications", updated)
        showToast("Notification preferences updated!")
    }

    const handleSaveAppearance = async (updatedAppearance) => {
        await updatePreferences("appearance", updatedAppearance)
        showToast("Appearance preferences saved!")
    }

    const handleSaveSecurity = async (updatedSecurity) => {
        await updatePreferences("security", updatedSecurity)
        showToast("Security settings updated!")
    }

    const handlePasswordChange = async (e) => {
        e.preventDefault()
        if (passwordForm.next !== passwordForm.confirm) {
            setPasswordMsg({ type: "error", text: "New passwords do not match." })
            return
        }
        if (passwordForm.next.length < 6) {
            setPasswordMsg({ type: "error", text: "Password must be at least 6 characters." })
            return
        }

        setSaving(true)
        const { error } = await supabase.auth.updateUser({ password: passwordForm.next })
        setSaving(false)

        if (error) {
            setPasswordMsg({ type: "error", text: error.message })
        } else {
            setPasswordMsg({ type: "success", text: "Password updated successfully!" })
            setPasswordForm({ current: "", next: "", confirm: "" })
            showToast("Password updated successfully!")
        }
    }

    const handleCreateToken = () => {
        if (!newTokenName.trim()) return
        const newToken = {
            id: `tok_${Date.now()}`,
            name: newTokenName.trim(),
            created: new Date().toISOString().split("T")[0],
            lastUsed: "Never"
        }
        setApiTokens([newToken, ...apiTokens])
        setNewTokenName("")
        setShowTokenModal(false)
        showToast("New API Token generated!")
    }

    const handleRevokeToken = (id) => {
        setApiTokens(apiTokens.filter((t) => t.id !== id))
        showToast("API token revoked.", "info")
    }

    const handleToggleIntegration = async (key) => {
        const updated = {
            ...integrations,
            [key]: { ...integrations[key], connected: !integrations[key].connected }
        }
        await updatePreferences("integrations", updated)
        showToast(`${key.toUpperCase()} integration ${updated[key].connected ? "connected" : "disconnected"}.`)
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
                <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-container-highest border border-outline-variant shadow-2xl animate-bounce">
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
                                        className={`w-full flex items-center gap-md px-md py-3 rounded-xl font-body-md transition-all duration-200 text-left ${
                                            isActive
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
                                                    value={workspace.slug}
                                                    onChange={(e) => setWorkspace({ ...workspace, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })}
                                                />
                                            </div>
                                        </div>

                                        {/* Description */}
                                        <div>
                                            <label className="block text-label-md font-semibold text-on-surface mb-2">Workspace Description</label>
                                            <textarea
                                                rows="3"
                                                className="w-full bg-surface-container-highest border border-outline-variant rounded-xl p-md text-on-surface font-body-md focus:ring-2 focus:ring-primary-fixed focus:outline-none"
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
                                                    className={`w-12 h-6 rounded-full p-1 flex items-center transition-all duration-300 ${
                                                        notifications[item.key] ? "bg-primary-container justify-end" : "bg-surface-container-highest justify-start"
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
                                        <h2 className="text-headline-md font-semibold text-on-surface">Appearance & Interface Theme</h2>
                                        <p className="text-on-surface-variant font-body-sm mt-1">
                                            Customize visual themes, density, and layout parameters.
                                        </p>
                                    </div>

                                    {/* Theme Cards */}
                                    <div className="space-y-sm">
                                        <label className="block text-label-md font-semibold text-on-surface">Color Theme</label>
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-md">
                                            {[
                                                { id: "dark", label: "Obsidian Dark", desc: "Default sleek dark aesthetic", color: "#101509" },
                                                { id: "high_contrast", label: "High Contrast", desc: "Enhanced border clarity", color: "#050704" },
                                                { id: "system", label: "System Sync", desc: "Follow OS preference", color: "#191d11" }
                                            ].map((t) => (
                                                <button
                                                    key={t.id}
                                                    onClick={() => handleSaveAppearance({ ...appearance, theme: t.id })}
                                                    className={`p-md rounded-xl border text-left flex flex-col justify-between h-28 transition-all ${
                                                        appearance.theme === t.id
                                                            ? "border-primary-fixed bg-surface-container-high ring-1 ring-primary-fixed"
                                                            : "border-outline-variant bg-surface-container-low hover:border-outline"
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between w-full">
                                                        <span className="font-body-md font-bold text-on-surface">{t.label}</span>
                                                        {appearance.theme === t.id && (
                                                            <span className="material-symbols-outlined text-primary-fixed text-sm">check_circle</span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs text-on-surface-variant">{t.desc}</p>
                                                    <div className="w-full h-2 rounded-full mt-2" style={{ backgroundColor: t.color, border: "1px solid #424934" }} />
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Accent Color Palette */}
                                    <div className="space-y-sm pt-md border-t border-outline-variant">
                                        <label className="block text-label-md font-semibold text-on-surface">Accent Color Palette</label>
                                        <div className="flex items-center gap-md">
                                            {[
                                                { id: "lime", name: "Electric Lime", hex: "#aff82a" },
                                                { id: "cyan", name: "Cyber Cyan", hex: "#00f0ff" },
                                                { id: "purple", name: "Neon Purple", hex: "#a855f7" },
                                                { id: "gold", name: "Amber Gold", hex: "#f59e0b" }
                                            ].map((acc) => (
                                                <button
                                                    key={acc.id}
                                                    onClick={() => handleSaveAppearance({ ...appearance, accentColor: acc.id })}
                                                    className={`flex items-center gap-2 px-md py-2 rounded-xl border font-body-sm transition-all ${
                                                        appearance.accentColor === acc.id
                                                            ? "border-on-surface bg-surface-container-highest"
                                                            : "border-outline-variant bg-surface-container-low hover:border-outline"
                                                    }`}
                                                >
                                                    <span className="w-4 h-4 rounded-full" style={{ backgroundColor: acc.hex }} />
                                                    <span className="text-on-surface font-medium">{acc.name}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Density & Animation Controls */}
                                    <div className="space-y-md pt-md border-t border-outline-variant">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="font-body-md font-semibold text-on-surface">Compact View Mode</p>
                                                <p className="text-body-sm text-on-surface-variant">Reduce padding across cards and tables for higher data density.</p>
                                            </div>
                                            <button
                                                role="switch"
                                                aria-checked={appearance.compactUi}
                                                onClick={() => handleSaveAppearance({ ...appearance, compactUi: !appearance.compactUi })}
                                                className={`w-12 h-6 rounded-full p-1 flex items-center transition-all ${
                                                    appearance.compactUi ? "bg-primary-container justify-end" : "bg-surface-container-highest justify-start"
                                                }`}
                                            >
                                                <span className={`w-4 h-4 rounded-full ${appearance.compactUi ? "bg-on-primary-container" : "bg-on-surface-variant"}`} />
                                            </button>
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

                                    {/* 2FA Toggle */}
                                    <div className="flex items-center justify-between p-md rounded-xl bg-surface-container-low border border-outline-variant">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="font-body-md font-semibold text-on-surface">Two-Factor Authentication (2FA)</p>
                                                <span className={`text-xs px-2 py-0.5 rounded font-semibold ${security.twoFactor ? "bg-primary-container/30 text-primary-fixed" : "bg-surface-container-highest text-on-surface-variant"}`}>
                                                    {security.twoFactor ? "ENABLED" : "DISABLED"}
                                                </span>
                                            </div>
                                            <p className="text-body-sm text-on-surface-variant mt-0.5">Secure your account with TOTP authenticator app verification.</p>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const next = { ...security, twoFactor: !security.twoFactor }
                                                handleSaveSecurity(next)
                                            }}
                                            className="px-md py-2 bg-surface-container-highest border border-outline-variant text-on-surface hover:bg-surface-variant font-body-sm font-semibold rounded-xl transition-colors"
                                        >
                                            {security.twoFactor ? "Configure 2FA" : "Enable 2FA"}
                                        </button>
                                    </div>

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

                                    {/* Personal Access Tokens */}
                                    <div className="space-y-md pt-md border-t border-outline-variant">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <h3 className="text-label-md font-semibold text-on-surface uppercase tracking-wider">Personal Access Tokens</h3>
                                                <p className="text-body-sm text-on-surface-variant">Tokens used for authenticating with Spacers CLI and API webhooks.</p>
                                            </div>
                                            <button
                                                onClick={() => setShowTokenModal(true)}
                                                className="px-md py-1.5 bg-surface-container-highest border border-outline-variant text-primary-fixed hover:bg-surface-variant font-body-sm font-semibold rounded-xl flex items-center gap-sm transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-base">add</span>
                                                Generate Token
                                            </button>
                                        </div>

                                        <div className="space-y-2">
                                            {apiTokens.map((tok) => (
                                                <div key={tok.id} className="flex items-center justify-between p-md rounded-xl bg-surface-container-low border border-outline-variant">
                                                    <div>
                                                        <p className="font-body-md font-semibold text-on-surface">{tok.name}</p>
                                                        <p className="text-xs text-on-surface-variant">Created {tok.created} • Last used {tok.lastUsed}</p>
                                                    </div>
                                                    <button
                                                        onClick={() => handleRevokeToken(tok.id)}
                                                        className="text-xs text-error hover:bg-error/10 px-3 py-1 rounded-lg transition-colors border border-error/20"
                                                    >
                                                        Revoke
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
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
                                                <p className="text-body-sm text-on-surface-variant">Allow anyone with an @acme.com email address to automatically join workspace.</p>
                                            </div>
                                            <button
                                                role="switch"
                                                aria-checked={workspace.autoJoinDomain}
                                                onClick={() => setWorkspace({ ...workspace, autoJoinDomain: !workspace.autoJoinDomain })}
                                                className={`w-12 h-6 rounded-full p-1 flex items-center transition-all ${
                                                    workspace.autoJoinDomain ? "bg-primary-container justify-end" : "bg-surface-container-highest justify-start"
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
                                        {/* GitHub */}
                                        <div className="p-md rounded-xl bg-surface-container-low border border-outline-variant flex flex-col justify-between space-y-4">
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center border border-outline-variant">
                                                        <span className="material-symbols-outlined text-on-surface">code</span>
                                                    </div>
                                                    <div>
                                                        <h3 className="font-body-md font-bold text-on-surface">GitHub Sync</h3>
                                                        <p className="text-xs text-on-surface-variant">Link PRs & commits to tasks</p>
                                                    </div>
                                                </div>
                                                <span className={`text-xs px-2 py-0.5 rounded font-semibold ${integrations.github.connected ? "bg-primary-container/20 text-primary-fixed" : "bg-surface-container-highest text-on-surface-variant"}`}>
                                                    {integrations.github.connected ? "CONNECTED" : "OFFLINE"}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => handleToggleIntegration("github")}
                                                className="w-full py-2 bg-surface-container-highest border border-outline-variant text-on-surface font-body-sm font-semibold rounded-xl hover:bg-surface-variant transition-colors"
                                            >
                                                {integrations.github.connected ? "Configure GitHub" : "Connect GitHub"}
                                            </button>
                                        </div>

                                        {/* Slack */}
                                        <div className="p-md rounded-xl bg-surface-container-low border border-outline-variant flex flex-col justify-between space-y-4">
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-surface-container-highest flex items-center justify-center border border-outline-variant">
                                                        <span className="material-symbols-outlined text-on-surface">chat</span>
                                                    </div>
                                                    <div>
                                                        <h3 className="font-body-md font-bold text-on-surface">Slack Bot</h3>
                                                        <p className="text-xs text-on-surface-variant">Post daily task digests</p>
                                                    </div>
                                                </div>
                                                <span className={`text-xs px-2 py-0.5 rounded font-semibold ${integrations.slack.connected ? "bg-primary-container/20 text-primary-fixed" : "bg-surface-container-highest text-on-surface-variant"}`}>
                                                    {integrations.slack.connected ? "CONNECTED" : "OFFLINE"}
                                                </span>
                                            </div>
                                            <button
                                                onClick={() => handleToggleIntegration("slack")}
                                                className="w-full py-2 bg-surface-container-highest border border-outline-variant text-on-surface font-body-sm font-semibold rounded-xl hover:bg-surface-variant transition-colors"
                                            >
                                                {integrations.slack.connected ? "Configure Slack" : "Connect Slack"}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            </main>

            {/* API Token Creation Modal */}
            {showTokenModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-md">
                    <div className="glass-card rounded-2xl p-lg max-w-md w-full space-y-md border border-outline-variant shadow-2xl animate-scaleIn">
                        <div className="flex items-center justify-between border-b border-outline-variant pb-sm">
                            <h3 className="text-headline-md font-bold text-on-surface">Generate API Access Token</h3>
                            <button onClick={() => setShowTokenModal(false)} className="text-on-surface-variant hover:text-on-surface">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div>
                            <label className="block text-label-md font-semibold text-on-surface mb-2">Token Name / Service</label>
                            <input
                                type="text"
                                placeholder="e.g. Mobile CLI App"
                                className="w-full bg-surface-container-highest border border-outline-variant rounded-xl px-md py-2.5 text-on-surface font-body-md focus:ring-2 focus:ring-primary-fixed focus:outline-none"
                                value={newTokenName}
                                onChange={(e) => setNewTokenName(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center justify-end gap-md pt-sm">
                            <button
                                onClick={() => setShowTokenModal(false)}
                                className="px-md py-2 bg-surface-container-highest text-on-surface font-body-sm font-semibold rounded-xl hover:bg-surface-variant transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateToken}
                                className="px-md py-2 bg-primary-container text-on-primary-container font-body-sm font-semibold rounded-xl hover:scale-[0.98] transition-all"
                            >
                                Generate Token
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
