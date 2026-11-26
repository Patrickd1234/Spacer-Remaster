import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import Sidebar from "./partials/SidebarRouter"
import Header from "./partials/header"
import { supabase, getSessionUser } from "./supabase"
import { usePreferences } from "./PreferencesContext"
import { useRole } from "./RoleContext"
import TwoFactorSettings from "./components/TwoFactorSettings"
import ComingSoonCard from "./components/ComingSoonCard"
import { changePassword } from "./passwordChange"
import { passwordStrengthError, PASSWORD_HINT } from "./passwordRules"
import { LeaveOrganizationButton } from "./components/OrgExitControls"
import { useMyAvatar } from "./avatars/myAvatar"

export default function Settings() {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [activeTab, setActiveTab] = useState("workspace") // workspace, account, notifications, appearance, security, team, integrations
    const [saving, setSaving] = useState(false)
    const [toast, setToast] = useState(null)
    const { preferences, updatePreferences } = usePreferences()
    const { roleName, can } = useRole()
    const { url: avatarUrl, handleImageError } = useMyAvatar()

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

    // The organization's name (the only workspace setting stored so far) and its size
    const [organizationId, setOrganizationId] = useState(null)
    const [workspaceName, setWorkspaceName] = useState("")
    const [memberCount, setMemberCount] = useState(null)
    const canRenameWorkspace = can("organization.update")

    const showToast = (message, type = "success") => {
        setToast({ message, type })
        setTimeout(() => setToast(null), 3500)
    }

    useEffect(() => {
        let active = true
        const fetchUserData = async () => {
            const authUser = await getSessionUser()
            if (!authUser || !active) return
            const { data: userProfile, error: profileError } = await supabase
                .from("users")
                .select("id, name, email, organization_id")
                .eq("id", authUser.id)
                .maybeSingle()
            if (profileError) console.error("Loading your profile failed:", profileError)
            if (!active) return
            setUser({
                id: authUser.id,
                name: userProfile?.name || authUser.user_metadata?.full_name || "Workspace User",
                email: authUser.email || userProfile?.email || "",
                role: roleName
            })

            const orgId = userProfile?.organization_id
            if (!orgId) return
            setOrganizationId(orgId)
            const [{ data: orgData, error: orgError }, { count, error: countError }] = await Promise.all([
                supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
                supabase.from("users").select("id", { count: "exact", head: true }).eq("organization_id", orgId),
            ])
            if (orgError) console.error("Loading the workspace failed:", orgError)
            if (countError) console.error("Counting members failed:", countError)
            if (!active) return
            setWorkspaceName(orgData?.name || "")
            setMemberCount(countError ? null : count)
        }
        fetchUserData()
        return () => { active = false }
    }, [roleName])

    // Handlers
    const handleSaveWorkspace = async () => {
        const name = workspaceName.trim()
        if (!organizationId) return
        if (!name) {
            showToast("Give the workspace a name.", "error")
            return
        }
        setSaving(true)
        // .select() returns the updated row; the database silently skips the
        // update (no error) when the user isn't allowed to rename
        const { data: updatedRows, error } = await supabase
            .from("organizations")
            .update({ name })
            .eq("id", organizationId)
            .select("id")
        setSaving(false)
        if (error) {
            console.error("Renaming the workspace failed:", error)
            showToast("Couldn't save the workspace name. Please try again.", "error")
            return
        }
        if (!updatedRows?.length) {
            showToast("Only organization admins signed in with two-factor authentication can rename the workspace.", "error")
            return
        }
        showToast("Workspace name saved.")
        // Reload so the new name shows everywhere
        setTimeout(() => window.location.reload(), 1000)
    }

    const handleSaveNotifications = async (updated) => {
        const { error } = await updatePreferences("notifications", updated)
        if (error) {
            showToast("Couldn't save your notification preferences. Please try again.", "error")
            return
        }
        showToast("Notification preferences updated!")
    }

    const handleSaveAppearance = async (updatedAppearance) => {
        const { error } = await updatePreferences("appearance", updatedAppearance)
        if (error) {
            showToast("Couldn't save your appearance preferences. Please try again.", "error")
            return
        }
        showToast("Appearance preferences saved!")
    }


    const handlePasswordChange = async (e) => {
        e.preventDefault()
        if (passwordForm.next !== passwordForm.confirm) {
            setPasswordMsg({ type: "error", text: "New passwords do not match." })
            return
        }
        const strengthError = passwordStrengthError(passwordForm.next)
        if (strengthError) {
            setPasswordMsg({ type: "error", text: strengthError })
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
        { id: "team", label: "Members", icon: "group" },
        { id: "integrations", label: "Connected Apps", icon: "extension" }
    ]

    return (
        <>
            <Sidebar onCollapsedChange={setSidebarCollapsed} />
            <Header />

            {/* Toast Notification */}
            {toast && (
                <div className="fixed top-20 right-6 z-[150] flex items-center gap-3 px-4 py-3 rounded-xl bg-field border border-line shadow-2xl animate-bounce">
                    <span className={`material-symbols-outlined ${toast.type === "error" ? "text-error" : "text-primary-fixed"}`}>
                        {toast.type === "error" ? "error" : "check_circle"}
                    </span>
                    <p className="text-sm text-white font-medium">{toast.message}</p>
                </div>
            )}

            <main className={`${sidebarCollapsed ? "md:ml-[72px]" : "md:ml-[260px]"} flex-1 flex flex-col min-h-screen bg-canvas text-white transition-all duration-300 ease-out`}>
                <div className="p-lg space-y-lg max-w-7xl w-full mx-auto">

                    {/* Header & Breadcrumb */}
                    <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-md">
                        <div>
                            <div className="flex items-center gap-2 text-muted text-xs mb-1">
                                <Link to="/" className="hover:text-white transition-colors flex items-center gap-1">
                                    <span className="material-symbols-outlined text-sm">home</span>
                                    <span>Home</span>
                                </Link>
                                <span>/</span>
                                <span className="text-white font-medium">Settings</span>
                            </div>
                            <h1 className="text-2xl font-semibold text-white flex items-center gap-3">
                                Workspace Settings
                            </h1>
                            <p className="text-muted text-sm mt-1">
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
                                        className={`w-full flex items-center gap-md px-md py-3 rounded-xl text-sm transition-all duration-200 text-left ${isActive
                                            ? "bg-primary-container text-on-accent font-semibold shadow-sm"
                                            : "text-muted hover:bg-raised hover:text-white"
                                            }`}
                                    >
                                        <span className={`material-symbols-outlined text-xl ${isActive ? "text-on-accent" : "text-muted"}`}>
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
                                    <div className="border-b border-line pb-md">
                                        <h2 className="text-lg font-semibold text-white">General Workspace Settings</h2>
                                        <p className="text-muted text-xs mt-1">
                                            Your organization's name as everyone in it sees it.
                                        </p>
                                    </div>

                                    <div className="space-y-md">
                                        {/* Workspace Name */}
                                        <div>
                                            <label htmlFor="workspace-name" className="block text-xs font-medium text-soft mb-2">Workspace Name</label>
                                            <input
                                                id="workspace-name"
                                                type="text"
                                                maxLength={100}
                                                disabled={!canRenameWorkspace}
                                                className="w-full bg-field border border-line focus:border-accent-ink rounded-lg px-3 py-2 text-white text-sm placeholder-muted focus:outline-none transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                                placeholder="e.g. My Organization"
                                                value={workspaceName}
                                                onChange={(e) => setWorkspaceName(e.target.value)}
                                            />
                                            {!canRenameWorkspace && (
                                                <p className="text-muted text-xs mt-1">Only organization admins can rename the workspace.</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action Footer */}
                                    <div className="flex items-center justify-end gap-md pt-lg border-t border-line">
                                        <button
                                            type="button"
                                            onClick={handleSaveWorkspace}
                                            disabled={saving || !canRenameWorkspace}
                                            className="px-lg py-2.5 bg-primary-container text-on-accent font-semibold rounded-xl flex items-center gap-sm hover:scale-[0.98] transition-all disabled:opacity-50"
                                        >
                                            <span className="material-symbols-outlined text-lg">save</span>
                                            {saving ? "Saving..." : "Save Name"}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* 2. ACCOUNT OVERVIEW TAB */}
                            {activeTab === "account" && (
                                <div className="glass-card rounded-2xl p-lg space-y-lg">
                                    <div className="border-b border-line pb-md flex items-center justify-between">
                                        <div>
                                            <h2 className="text-lg font-semibold text-white">Account Summary</h2>
                                            <p className="text-muted text-xs mt-1">
                                                Your current credentials and user profile information.
                                            </p>
                                        </div>
                                        <Link
                                            to="/profile"
                                            className="px-md py-2 bg-field border border-line text-white hover:bg-raised text-xs font-semibold rounded-xl flex items-center gap-sm transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-lg">edit</span>
                                            Edit Full Profile
                                        </Link>
                                    </div>

                                    <div className="flex items-center gap-lg p-md rounded-xl bg-panel border border-line">
                                        <div className="w-16 h-16 rounded-2xl overflow-hidden bg-primary-container text-on-accent font-bold text-2xl flex items-center justify-center border-2 border-primary-fixed/40">
                                            {avatarUrl
                                                ? <img src={avatarUrl} alt="" onError={handleImageError} className="w-full h-full object-cover" />
                                                : user.name ? user.name.slice(0, 2).toUpperCase() : "U"}
                                        </div>
                                        <div className="space-y-1">
                                            <h3 className="text-lg font-bold text-white">{user.name}</h3>
                                            <p className="text-muted text-xs">{user.email}</p>
                                            <div className="flex items-center gap-sm text-xs text-muted pt-1">
                                                <span className="px-2 py-0.5 rounded bg-field text-primary-fixed border border-primary-fixed/20 font-semibold">
                                                    {user.role}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                                        <div className="p-md rounded-xl bg-field/50 border border-line space-y-1">
                                            <p className="text-xs text-muted uppercase tracking-wider">User Identifier</p>
                                            <p className="font-mono text-xs text-white truncate">{user.id || "usr_8f9a2b1c4e"}</p>
                                        </div>
                                        <div className="p-md rounded-xl bg-field/50 border border-line space-y-1">
                                            <p className="text-xs text-muted uppercase tracking-wider">Account Status</p>
                                            <div className="flex items-center gap-2">
                                                <span className="w-2.5 h-2.5 rounded-full bg-primary-fixed"></span>
                                                <span className="text-sm font-medium text-white">Active & Verified</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-md rounded-xl border border-red-500/30 flex flex-wrap items-center justify-between gap-md">
                                        <div className="space-y-1">
                                            <h3 className="text-sm font-semibold text-white">Leave organization</h3>
                                            <p className="text-xs text-muted">
                                                Give up your access to this organization for good. Your sign-in stays yours.
                                            </p>
                                        </div>
                                        <div className="space-y-2">
                                            <LeaveOrganizationButton />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* 3. NOTIFICATIONS TAB */}
                            {activeTab === "notifications" && (
                                <div className="glass-card rounded-2xl p-lg space-y-lg">
                                    <div className="border-b border-line pb-md">
                                        <h2 className="text-lg font-semibold text-white">Notifications & Alerts</h2>
                                        <p className="text-muted text-xs mt-1">
                                            Choose which emails Spacer sends you. In-app notifications always appear in the bell.
                                        </p>
                                    </div>

                                    <div className="space-y-md">
                                        {[
                                            { key: "emailAlerts", label: "Email Notifications", desc: "Turn off to stop every email from Spacer." },
                                            { key: "taskAssigned", label: "Task Assignments & Due Dates", desc: "Email when a task is assigned to you, and when one of your tasks is due today or tomorrow. Also controls the daily task reminders in the bell." },
                                            { key: "projectUpdates", label: "Added to a Project", desc: "Email when someone adds you to a project." }
                                        ].map((item) => (
                                            <div key={item.key} className="flex items-center justify-between p-md rounded-xl bg-panel border border-line hover:border-outline transition-colors">
                                                <div>
                                                    <p className="text-sm font-semibold text-white">{item.label}</p>
                                                    <p className="text-xs text-muted">{item.desc}</p>
                                                </div>
                                                <button
                                                    role="switch"
                                                    aria-checked={notifications[item.key]}
                                                    onClick={() => {
                                                        const next = { ...notifications, [item.key]: !notifications[item.key] }
                                                        handleSaveNotifications(next)
                                                    }}
                                                    className={`w-12 h-6 rounded-full p-1 flex items-center transition-all duration-300 ${notifications[item.key] ? "bg-primary-container justify-end" : "bg-field justify-start"
                                                        }`}
                                                >
                                                    <span className={`w-4 h-4 rounded-full shadow-md transition-transform ${notifications[item.key] ? "bg-surface1" : "bg-muted"}`} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>

                                </div>
                            )}

                            {/* 4. APPEARANCE & INTERFACE TAB */}
                            {activeTab === "appearance" && (
                                <div className="glass-card rounded-2xl p-lg space-y-lg">
                                    <div className="border-b border-line pb-md">
                                        <h2 className="text-lg font-semibold text-white">Appearance & Interface Customization</h2>
                                        <p className="text-muted text-xs mt-1">
                                            Configure layout alignment, display density, and animation speed.
                                        </p>
                                    </div>

                                    {/* Theme Mode Picker */}
                                    <div className="space-y-2">
                                        <label className="block text-xs font-medium text-soft">Colour Theme</label>
                                        <p className="text-xs text-muted">Switch between Dark and Light interface themes.</p>
                                        <div className="flex gap-sm">
                                            {[
                                                { id: "dark",  label: "Dark",  icon: "dark_mode" },
                                                { id: "light", label: "Light", icon: "light_mode" }
                                            ].map((t) => (
                                                <button
                                                    key={t.id}
                                                    onClick={() => handleSaveAppearance({ ...appearance, theme: t.id })}
                                                    className={`flex-1 flex items-center justify-center gap-2 py-2 px-md border rounded-xl text-xs transition-all ${
                                                        (appearance.theme || "dark") === t.id
                                                            ? "border-primary-fixed bg-field text-primary-fixed"
                                                            : "border-line bg-panel text-muted hover:border-outline"
                                                    }`}
                                                >
                                                    <span className="material-symbols-outlined text-sm">{t.icon}</span>
                                                    <span>{t.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Layout Options Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-lg">

                                        {/* Sidebar Placement */}
                                        <div className="space-y-2">
                                            <label className="block text-xs font-medium text-soft">Sidebar Position</label>
                                            <p className="text-xs text-muted">Choose which side of the screen your sidebar displays.</p>
                                            <div className="flex gap-sm">
                                                {[
                                                    { id: "left", label: "Left Alignment", icon: "align_horizontal_left" },
                                                    { id: "right", label: "Right Alignment", icon: "align_horizontal_right" }
                                                ].map((pos) => (
                                                    <button
                                                        key={pos.id}
                                                        onClick={() => handleSaveAppearance({ ...appearance, sidebarPosition: pos.id })}
                                                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-md border rounded-xl text-xs transition-all ${(appearance.sidebarPosition || "left") === pos.id
                                                            ? "border-primary-fixed bg-field text-primary-fixed"
                                                            : "border-line bg-panel text-muted hover:border-outline"
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
                                            <label className="block text-xs font-medium text-soft">Layout Density</label>
                                            <p className="text-xs text-muted">Adjust spaces, padding and sizing parameters.</p>
                                            <div className="flex gap-sm">
                                                {[
                                                    { id: "compact", label: "Compact", icon: "density_medium" },
                                                    { id: "comfortable", label: "Comfortable", icon: "density_small" },
                                                    { id: "spacious", label: "Spacious", icon: "density_large" }
                                                ].map((den) => (
                                                    <button
                                                        key={den.id}
                                                        onClick={() => handleSaveAppearance({ ...appearance, density: den.id })}
                                                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-md border rounded-xl text-xs transition-all ${(appearance.density || "comfortable") === den.id
                                                            ? "border-primary-fixed bg-field text-primary-fixed"
                                                            : "border-line bg-panel text-muted hover:border-outline"
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
                                            <label className="block text-xs font-medium text-soft">Animations & Motion</label>
                                            <p className="text-xs text-muted">Transition speed profiles for interface interactions.</p>
                                            <div className="flex gap-sm">
                                                {[
                                                    { id: "smooth", label: "Smooth (Default)", icon: "motion_photos_on" },
                                                    { id: "fast", label: "Fast & Snappy", icon: "bolt" },
                                                    { id: "none", label: "None (Reduced)", icon: "motion_photos_off" }
                                                ].map((speed) => (
                                                    <button
                                                        key={speed.id}
                                                        onClick={() => handleSaveAppearance({ ...appearance, animationSpeed: speed.id })}
                                                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-md border rounded-xl text-xs transition-all ${(appearance.animationSpeed || "smooth") === speed.id
                                                            ? "border-primary-fixed bg-field text-primary-fixed"
                                                            : "border-line bg-panel text-muted hover:border-outline"
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
                                            <label className="block text-xs font-medium text-soft">Card Styling (Glassmorphism)</label>
                                            <p className="text-xs text-muted">Control translucency blur strength on interface cards.</p>
                                            <div className="flex gap-sm">
                                                {[
                                                    { id: "soft", label: "Soft Glow", icon: "blur_on" },
                                                    { id: "intense", label: "Intense Frost", icon: "opacity" },
                                                    { id: "flat", label: "Flat Solid", icon: "layers_clear" }
                                                ].map((gl) => (
                                                    <button
                                                        key={gl.id}
                                                        onClick={() => handleSaveAppearance({ ...appearance, glassmorphism: gl.id })}
                                                        className={`flex-1 flex items-center justify-center gap-2 py-2 px-md border rounded-xl text-xs transition-all ${(appearance.glassmorphism || "soft") === gl.id
                                                            ? "border-primary-fixed bg-field text-primary-fixed"
                                                            : "border-line bg-panel text-muted hover:border-outline"
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
                                    <div className="border-b border-line pb-md">
                                        <h2 className="text-lg font-semibold text-white">Security & Authentication</h2>
                                        <p className="text-muted text-xs mt-1">
                                            Manage your multi-factor authentication, passwords, and API tokens.
                                        </p>
                                    </div>

                                    {/* Two-factor authentication (Supabase MFA) */}
                                    <TwoFactorSettings onNotify={showToast} />

                                    {/* Password Change Section */}
                                    <div className="space-y-md pt-md border-t border-line">
                                        <h3 className="text-xs font-medium text-soft uppercase tracking-wider">Change Password</h3>
                                        {passwordMsg && (
                                            <div className={`p-md rounded-xl text-sm font-medium ${passwordMsg.type === "error" ? "bg-error-container/20 text-error border border-error-container" : "bg-primary-container/20 text-primary-fixed border border-primary-fixed/30"}`}>
                                                {passwordMsg.text}
                                            </div>
                                        )}
                                        <form onSubmit={handlePasswordChange} className="space-y-md max-w-md">
                                            <div>
                                                <label className="block text-xs text-muted mb-1">Current Password</label>
                                                <input
                                                    type="password"
                                                    required
                                                    autoComplete="current-password"
                                                    className="w-full bg-field border border-line rounded-xl px-md py-2 text-white text-sm focus:border-accent-ink focus:outline-none"
                                                    value={passwordForm.current}
                                                    onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-muted mb-1">New Password</label>
                                                <input
                                                    type="password"
                                                    required
                                                    className="w-full bg-field border border-line rounded-xl px-md py-2 text-white text-sm focus:border-accent-ink focus:outline-none"
                                                    value={passwordForm.next}
                                                    onChange={(e) => setPasswordForm({ ...passwordForm, next: e.target.value })}
                                                />
                                                <p className="text-[11px] text-muted mt-1">{PASSWORD_HINT}</p>
                                            </div>
                                            <div>
                                                <label className="block text-xs text-muted mb-1">Confirm New Password</label>
                                                <input
                                                    type="password"
                                                    required
                                                    className="w-full bg-field border border-line rounded-xl px-md py-2 text-white text-sm focus:border-accent-ink focus:outline-none"
                                                    value={passwordForm.confirm}
                                                    onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                                                />
                                            </div>
                                            <button
                                                type="submit"
                                                disabled={saving}
                                                className="px-md py-2 bg-primary-container text-on-accent font-semibold rounded-xl hover:scale-[0.98] transition-all disabled:opacity-50"
                                            >
                                                {saving ? "Updating..." : "Update Password"}
                                            </button>
                                        </form>
                                    </div>

                                    {/* Personal Access Tokens: not built yet */}
                                    <div className="pt-md border-t border-line">
                                        <ComingSoonCard icon="key" title="Personal Access Tokens" description="Tokens for the Spacer CLI and API webhooks" />
                                    </div>
                                </div>
                            )}

                            {/* 6. TEAM & PERMISSIONS TAB */}
                            {activeTab === "team" && (
                                <div className="glass-card rounded-2xl p-lg space-y-lg">
                                    <div className="border-b border-line pb-md">
                                        <h2 className="text-lg font-semibold text-white">Members</h2>
                                        <p className="text-muted text-xs mt-1">
                                            Who is in your organization. Roles and departments are managed in the Directory.
                                        </p>
                                    </div>

                                    <div className="p-md rounded-xl bg-panel border border-line flex flex-wrap items-center justify-between gap-md">
                                        <div>
                                            <p className="text-sm font-semibold text-white">
                                                {memberCount == null ? "Counting members…" : `${memberCount} ${memberCount === 1 ? "member" : "members"}`}
                                            </p>
                                            <p className="text-xs text-muted">Everyone who has joined this organization.</p>
                                        </div>
                                        <Link
                                            to="/general/directory"
                                            className="flex items-center gap-2 px-md py-2 rounded-xl border border-line text-sm text-white hover:border-line-strong transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">badge</span>
                                            Open Directory
                                        </Link>
                                    </div>
                                </div>
                            )}

                            {/* 7. CONNECTED APPS TAB */}
                            {activeTab === "integrations" && (
                                <div className="glass-card rounded-2xl p-lg space-y-lg">
                                    <div className="border-b border-line pb-md">
                                        <h2 className="text-lg font-semibold text-white">Connected Services & Integrations</h2>
                                        <p className="text-muted text-xs mt-1">
                                            Connect Spacer to the tools your team already uses.
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
