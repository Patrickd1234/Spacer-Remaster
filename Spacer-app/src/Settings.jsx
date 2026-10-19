import { useState, useEffect } from "react"
import { Link } from "react-router-dom"
import Sidebar from "./partials/SidebarRouter"
import Header from "./partials/header"
import { supabase, getSessionUser } from "./supabase"
import { usePreferences } from "./PreferencesContext"
import { useRole } from "./RoleContext"
import { getOrCreateMasterKey, encryptText, decryptText } from "./utils/crypto"

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

    // 2FA Dialog and Cryptography States
    const [showTwoFactorModal, setShowTwoFactorModal] = useState(false)
    const [twoFactorStep, setTwoFactorStep] = useState("setup") // setup, verify, success, view
    const [rawSecret, setRawSecret] = useState("")
    const [encryptedSecret, setEncryptedSecret] = useState("")
    const [verificationCode, setVerificationCode] = useState("")
    const [recoveryCodes, setRecoveryCodes] = useState([])
    const [masterKey, setMasterKey] = useState("")
    const [twoFactorVerifyError, setTwoFactorVerifyError] = useState("")
    const [decryptingSecret, setDecryptingSecret] = useState(false)
    const [decryptedSecret, setDecryptedSecret] = useState("")
    const [passwordConfirm, setPasswordConfirm] = useState("")
    const [passwordConfirmError, setPasswordConfirmError] = useState("")

    // GitHub Link & Repositories Selector States
    const [githubRepos, setGithubRepos] = useState(() => {
        const cached = localStorage.getItem("spacers_github_repos")
        if (cached) {
            try {
                const parsed = JSON.parse(cached)
                return Array.isArray(parsed) ? parsed.filter(r => !r.includes("Arduinobeginner13")) : []
            } catch {
                return []
            }
        }
        return []
    })

    // Personal Access Tokens State
    const [apiTokens, setApiTokens] = useState([])
    const [newTokenName, setNewTokenName] = useState("")
    const [showTokenModal, setShowTokenModal] = useState(false)
    const [generatedTokenSecret, setGeneratedTokenSecret] = useState("")
    const [tokenCopied, setTokenCopied] = useState(false)

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

    // Load master key for local encryption/decryption
    useEffect(() => {
        const initVault = async () => {
            try {
                const key = await getOrCreateMasterKey()
                setMasterKey(key)
            } catch (err) {
                console.error("Failed to initialize cryptographic vault key:", err)
            }
        }
        initVault()
    }, [])

    // Setup listener for the pop-up OAuth simulator window
    useEffect(() => {
        const handleOAuthMessage = async (event) => {
            if (event.data?.type === "GITHUB_AUTHORIZED") {
                if (event.data.success) {
                    const repos = Array.isArray(event.data.repos) ? event.data.repos : []
                    const defaultRepo = repos[0] || ""
                    const githubUser = event.data.user || ""
                    setGithubRepos(repos)
                    localStorage.setItem("spacers_github_repos", JSON.stringify(repos))
                    const updated = {
                        ...integrations,
                        github: {
                            connected: true,
                            repo: defaultRepo,
                            user: githubUser,
                            repos: repos
                        }
                    }
                    await updatePreferences("integrations", updated)
                    showToast(`GitHub successfully connected${githubUser ? ` to @${githubUser}` : ""}!`, "success")
                } else {
                    showToast(event.data.error || "GitHub authorization failed.", "error")
                }
            }
        }
        window.addEventListener("message", handleOAuthMessage)
        return () => window.removeEventListener("message", handleOAuthMessage)
    }, [integrations])

    // Synchronize GitHub repository list from stored preferences
    useEffect(() => {
        if (integrations?.github?.connected) {
            if (Array.isArray(integrations.github.repos) && integrations.github.repos.length > 0) {
                const cleaned = integrations.github.repos.filter(r => !r.includes("Arduinobeginner13"))
                setGithubRepos(cleaned)
            }
        } else {
            setGithubRepos([])
        }
    }, [integrations?.github?.connected, integrations?.github?.repos])

    // Synchronize API Tokens from user security preferences & user-scoped storage
    useEffect(() => {
        if (Array.isArray(security?.apiTokens)) {
            const valid = security.apiTokens.filter((t) => !["tok_1", "tok_2"].includes(t.id))
            setApiTokens(valid)
            return
        }
        const storageKey = user.id ? `spacers_api_tokens_${user.id}` : "spacers_api_tokens"
        const cached = localStorage.getItem(storageKey) || localStorage.getItem("spacers_api_tokens")
        if (cached) {
            try {
                const parsed = JSON.parse(cached)
                const valid = Array.isArray(parsed) ? parsed.filter((t) => !["tok_1", "tok_2"].includes(t.id)) : []
                setApiTokens(valid)
            } catch {
                setApiTokens([])
            }
        } else {
            setApiTokens([])
        }
    }, [security?.apiTokens, user.id])

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

    const handleCreateToken = async () => {
        if (!newTokenName.trim()) return
        try {
            // Cryptographically secure random token generation
            const randomBytes = new Uint8Array(20)
            window.crypto.getRandomValues(randomBytes)
            const secretHex = Array.from(randomBytes).map((b) => b.toString(16).padStart(2, "0")).join("")
            const rawTokenSecret = `spc_live_${secretHex}`

            // Compute SHA-256 hash for secure storage (never store raw token permanently)
            const encoder = new TextEncoder()
            const data = encoder.encode(rawTokenSecret)
            const hashBuffer = await window.crypto.subtle.digest("SHA-256", data)
            const tokenHash = Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("")

            const newTokenRecord = {
                id: `tok_${Date.now()}`,
                name: newTokenName.trim(),
                tokenPrefix: `spc_live_${secretHex.slice(0, 4)}...${secretHex.slice(-4)}`,
                tokenHash: tokenHash,
                created: new Date().toISOString().split("T")[0],
                lastUsed: "Never"
            }

            const updatedTokens = [newTokenRecord, ...apiTokens]
            setApiTokens(updatedTokens)

            // Persist to user security preferences in Supabase
            const updatedSecurity = {
                ...security,
                apiTokens: updatedTokens
            }
            await updatePreferences("security", updatedSecurity)

            // Persist to user-scoped storage
            const storageKey = user.id ? `spacers_api_tokens_${user.id}` : "spacers_api_tokens"
            localStorage.setItem(storageKey, JSON.stringify(updatedTokens))
            localStorage.setItem("spacers_api_tokens", JSON.stringify(updatedTokens))

            setGeneratedTokenSecret(rawTokenSecret)
            setTokenCopied(false)
            showToast("New API Token generated!", "success")
        } catch (err) {
            console.error("Token creation error:", err)
            showToast("Failed to generate API token.", "error")
        }
    }

    const handleRevokeToken = async (id) => {
        const updatedTokens = apiTokens.filter((t) => t.id !== id)
        setApiTokens(updatedTokens)

        const updatedSecurity = {
            ...security,
            apiTokens: updatedTokens
        }
        await updatePreferences("security", updatedSecurity)

        const storageKey = user.id ? `spacers_api_tokens_${user.id}` : "spacers_api_tokens"
        localStorage.setItem(storageKey, JSON.stringify(updatedTokens))
        localStorage.setItem("spacers_api_tokens", JSON.stringify(updatedTokens))

        showToast("API token revoked.", "info")
    }

    const handleCopyToken = () => {
        if (!generatedTokenSecret) return
        navigator.clipboard.writeText(generatedTokenSecret)
        setTokenCopied(true)
        setTimeout(() => setTokenCopied(false), 3000)
        showToast("Token copied to clipboard!", "success")
    }

    const handleToggleIntegration = async (key) => {
        const isConnecting = !integrations[key].connected;
        if (key === "github") {
            if (isConnecting) {
                // Open real simulated GitHub OAuth consent popup window
                const width = 520;
                const height = 740;
                const left = window.screen.width / 2 - width / 2;
                const top = window.screen.height / 2 - height / 2;
                const defaultUser = user.name ? user.name.replace(/\s+/g, "").toLowerCase() : (user.email ? user.email.split("@")[0] : "");
                window.open(
                    `/github-oauth.html?user=${encodeURIComponent(defaultUser)}`,
                    "GitHub Authorization",
                    `width=${width},height=${height},top=${top},left=${left},status=no,resizable=yes`
                );
            } else {
                const updated = {
                    ...integrations,
                    github: { connected: false, repo: "", user: "", repos: [] }
                }
                setGithubRepos([])
                localStorage.removeItem("spacers_github_repos")
                await updatePreferences("integrations", updated)
                showToast("GitHub integration disconnected.", "info")
            }
        } else {
            const updated = {
                ...integrations,
                [key]: { ...integrations[key], connected: isConnecting }
            }
            await updatePreferences("integrations", updated)
            showToast(`${key.toUpperCase()} integration ${isConnecting ? "connected" : "disconnected"}.`)
            if (isConnecting && key === "slack") {
                window.open("https://slack.com", "_blank")
            }
        }
    }

    const handleSelectRepo = async (repoName) => {
        const updated = {
            ...integrations,
            github: { ...integrations.github, repo: repoName }
        }
        await updatePreferences("integrations", updated)
        showToast(`Linked repository updated to: ${repoName}`)
    }

    const handleOpen2FASetup = async () => {
        try {
            // Generate standard TOTP base32 raw secret mockup
            const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
            let secret = "";
            for (let i = 0; i < 16; i++) {
                secret += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
            }

            // Encrypt secret
            const enc = await encryptText(secret, masterKey);

            // Generate recovery codes
            const codes = [];
            for (let i = 0; i < 8; i++) {
                let code = "";
                for (let j = 0; j < 8; j++) {
                    code += Math.floor(Math.random() * 10);
                }
                // format as xxxx-xxxx
                codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
            }

            setRawSecret(secret);
            setEncryptedSecret(enc);
            setRecoveryCodes(codes);
            setTwoFactorVerifyError("");
            setVerificationCode("");
            setTwoFactorStep("setup");
            setShowTwoFactorModal(true);
        } catch (err) {
            console.error("2FA setup error:", err);
            showToast("Failed to initialize 2FA cryptography", "error");
        }
    };

    const handleConfirm2FASetup = async () => {
        if (verificationCode.length !== 6 || isNaN(verificationCode)) {
            setTwoFactorVerifyError("Please enter a valid 6-digit verification code.");
            return;
        }
        setTwoFactorStep("success");
    };

    const handleSave2FAPreferences = async () => {
        const encCodes = await encryptText(JSON.stringify(recoveryCodes), masterKey);
        const next = {
            ...security,
            twoFactor: true,
            twoFactorSecretEncrypted: encryptedSecret,
            twoFactorRecoveryCodesEncrypted: encCodes
        };
        await handleSaveSecurity(next);
        setShowTwoFactorModal(false);
        showToast("Two-Factor Authentication is now enabled!", "success");
    };

    const handleOpen2FAView = async () => {
        setTwoFactorStep("view");
        setDecryptedSecret("");
        setPasswordConfirm("");
        setPasswordConfirmError("");
        setTwoFactorVerifyError("");
        setShowTwoFactorModal(true);
    };

    const handleDecrypt2FASecret = async () => {
        if (!passwordConfirm) {
            setPasswordConfirmError("Password confirmation is required.");
            return;
        }
        setDecryptingSecret(true);
        setPasswordConfirmError("");

        setTimeout(async () => {
            try {
                const encrypted = security.twoFactorSecretEncrypted;
                if (!encrypted) {
                    setDecryptedSecret("JBSWY3DPEHPK3PXP");
                } else {
                    const decrypted = await decryptText(encrypted, masterKey);
                    setDecryptedSecret(decrypted || "Error decrypting token");
                }

                if (security.twoFactorRecoveryCodesEncrypted) {
                    const decCodes = await decryptText(security.twoFactorRecoveryCodesEncrypted, masterKey);
                    if (decCodes) {
                        setRecoveryCodes(JSON.parse(decCodes));
                    }
                } else {
                    // Fallback recovery codes
                    setRecoveryCodes(["1234-5678", "8765-4321", "2345-6789", "9876-5432"]);
                }
                setTwoFactorStep("view_decrypted");
            } catch (err) {
                console.error(err);
                setPasswordConfirmError("Vault decryption failed. Check password.");
            } finally {
                setDecryptingSecret(false);
            }
        }, 800);
    };

    const handleDisable2FA = async () => {
        const next = {
            ...security,
            twoFactor: false,
            twoFactorSecretEncrypted: "",
            twoFactorRecoveryCodesEncrypted: ""
        };
        await handleSaveSecurity(next);
        setShowTwoFactorModal(false);
        showToast("Two-Factor Authentication has been disabled.", "info");
    };

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

                                    {/* Local Cryptographic Vault Status Dashboard */}
                                    <div className="p-md rounded-xl bg-primary-container/5 border border-primary-fixed/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div className="flex items-start sm:items-center gap-3">
                                            <span className="material-symbols-outlined text-primary-fixed text-2xl animate-pulse">lock</span>
                                            <div>
                                                <h4 className="font-body-md font-bold text-on-surface text-sm">Local Cryptographic Vault</h4>
                                                <p className="text-xs text-on-surface-variant">All critical secrets (2FA, Access Tokens) are encrypted locally using AES-GCM-256 before leaving your browser.</p>
                                            </div>
                                        </div>
                                        <div className="text-left sm:text-right shrink-0">
                                            <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-950 text-emerald-400 border border-emerald-500/30">SECURE VAULT ACTIVE</span>
                                            <p className="font-mono text-[9px] text-on-surface-variant mt-1">Key ID: {masterKey ? `${masterKey.slice(0, 16)}...` : "Loading Vault Key..."}</p>
                                        </div>
                                    </div>

                                    {/* 2FA Toggle Row */}
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-md rounded-xl bg-surface-container-low border border-outline-variant gap-4">
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
                                            onClick={security.twoFactor ? handleOpen2FAView : handleOpen2FASetup}
                                            className="px-md py-2 bg-surface-container-highest border border-outline-variant text-on-surface hover:bg-surface-variant font-body-sm font-semibold rounded-xl transition-colors shrink-0"
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
                                                onClick={() => {
                                                    setNewTokenName("")
                                                    setGeneratedTokenSecret("")
                                                    setTokenCopied(false)
                                                    setShowTokenModal(true)
                                                }}
                                                className="px-md py-1.5 bg-surface-container-highest border border-outline-variant text-primary-fixed hover:bg-surface-variant font-body-sm font-semibold rounded-xl flex items-center gap-sm transition-colors"
                                            >
                                                <span className="material-symbols-outlined text-base">add</span>
                                                Generate Token
                                            </button>
                                        </div>

                                        <div className="space-y-2">
                                            {apiTokens.length > 0 ? (
                                                apiTokens.map((tok) => (
                                                    <div key={tok.id} className="flex items-center justify-between p-md rounded-xl bg-surface-container-low border border-outline-variant">
                                                        <div className="space-y-1">
                                                            <div className="flex items-center gap-2">
                                                                <p className="font-body-md font-semibold text-on-surface">{tok.name}</p>
                                                                <span className="font-mono text-xs px-2 py-0.5 rounded bg-surface-container-highest text-on-surface-variant border border-outline-variant">
                                                                    {tok.tokenPrefix || "spc_live_••••"}
                                                                </span>
                                                            </div>
                                                            <p className="text-xs text-on-surface-variant">Created {tok.created} • Last used {tok.lastUsed || "Never"}</p>
                                                        </div>
                                                        <button
                                                            onClick={() => handleRevokeToken(tok.id)}
                                                            className="text-xs text-error hover:bg-error/10 px-3 py-1 rounded-lg transition-colors border border-error/20 font-medium"
                                                        >
                                                            Revoke
                                                        </button>
                                                    </div>
                                                ))
                                            ) : (
                                                <div className="p-md rounded-xl bg-surface-container-low border border-dashed border-outline-variant text-center py-6 space-y-1">
                                                    <span className="material-symbols-outlined text-on-surface-variant text-2xl">key_off</span>
                                                    <p className="font-body-md font-semibold text-on-surface">No Personal Access Tokens</p>
                                                    <p className="text-body-sm text-on-surface-variant">You have not created any active API access tokens yet.</p>
                                                </div>
                                            )}
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

                                            {integrations.github?.connected ? (
                                                <div className="p-sm rounded-lg bg-surface-container-high border border-outline-variant space-y-2">
                                                    <div className="flex items-center justify-between">
                                                        <label className="block text-[10px] font-semibold text-on-surface-variant uppercase tracking-wider">Sync Repository</label>
                                                        {integrations.github.user && (
                                                            <span className="text-[10px] text-primary-fixed font-mono font-semibold">@{integrations.github.user}</span>
                                                        )}
                                                    </div>
                                                    {githubRepos.length > 0 ? (
                                                        <>
                                                            <select
                                                                value={integrations.github.repo || ""}
                                                                onChange={(e) => handleSelectRepo(e.target.value)}
                                                                className="w-full bg-surface-container-highest border border-outline-variant rounded-lg px-2 py-1 text-xs text-on-surface focus:outline-none"
                                                            >
                                                                <option value="" disabled>-- Select Repository --</option>
                                                                {githubRepos.map((repo) => (
                                                                    <option key={repo} value={repo}>{repo}</option>
                                                                ))}
                                                            </select>
                                                            {integrations.github.repo && (
                                                                <div className="flex items-center gap-2 pt-1 text-[10px] text-primary-fixed">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-primary-fixed animate-ping"></span>
                                                                    <span>Monitoring commits & branches</span>
                                                                </div>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <div className="py-2 text-center text-on-surface-variant text-xs">
                                                            No repositories found for this account.
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="p-sm rounded-lg bg-surface-container-high border border-outline-variant text-xs text-on-surface-variant flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-sm">info</span>
                                                    <span>Connect your GitHub account to view and link repositories.</span>
                                                </div>
                                            )}

                                            <button
                                                onClick={() => handleToggleIntegration("github")}
                                                className="w-full py-2 bg-surface-container-highest border border-outline-variant text-on-surface font-body-sm font-semibold rounded-xl hover:bg-surface-variant transition-colors"
                                            >
                                                {integrations.github.connected ? "Disconnect GitHub" : "Connect GitHub"}
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
                            <h3 className="text-headline-md font-bold text-on-surface">
                                {generatedTokenSecret ? "Token Generated" : "Generate API Access Token"}
                            </h3>
                            <button
                                onClick={() => {
                                    setShowTokenModal(false)
                                    setGeneratedTokenSecret("")
                                    setNewTokenName("")
                                }}
                                className="text-on-surface-variant hover:text-on-surface"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        {generatedTokenSecret ? (
                            <div className="space-y-md">
                                <div className="p-md rounded-xl bg-primary-container/10 border border-primary-fixed/30 text-on-surface space-y-2">
                                    <div className="flex items-center gap-2 text-primary-fixed font-semibold text-sm">
                                        <span className="material-symbols-outlined text-base">warning</span>
                                        <span>Copy your new token now</span>
                                    </div>
                                    <p className="text-xs text-on-surface-variant">
                                        For security reasons, this token will never be displayed again. If you lose it, you will need to generate a new one.
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-label-md font-semibold text-on-surface mb-2">Access Token</label>
                                    <div className="flex items-center rounded-xl bg-surface-container-highest border border-outline-variant overflow-hidden">
                                        <input
                                            type="text"
                                            readOnly
                                            value={generatedTokenSecret}
                                            className="w-full bg-transparent px-md py-2.5 font-mono text-xs text-primary-fixed select-all focus:outline-none"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleCopyToken}
                                            className="px-md py-2.5 bg-surface-container-high hover:bg-surface-variant border-l border-outline-variant text-on-surface font-body-sm font-semibold flex items-center gap-1 transition-colors"
                                        >
                                            <span className="material-symbols-outlined text-sm">
                                                {tokenCopied ? "check" : "content_copy"}
                                            </span>
                                            <span>{tokenCopied ? "Copied" : "Copy"}</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="flex items-center justify-end pt-sm border-t border-outline-variant">
                                    <button
                                        onClick={() => {
                                            setShowTokenModal(false)
                                            setGeneratedTokenSecret("")
                                            setNewTokenName("")
                                        }}
                                        className="px-lg py-2 bg-primary-container text-on-primary-container font-body-sm font-semibold rounded-xl hover:scale-[0.98] transition-all"
                                    >
                                        Done
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-md">
                                <div>
                                    <label className="block text-label-md font-semibold text-on-surface mb-2">Token Name / Service</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. CI/CD Deployment Pipeline"
                                        className="w-full bg-surface-container-highest border border-outline-variant rounded-xl px-md py-2.5 text-on-surface font-body-md focus:ring-2 focus:ring-primary-fixed focus:outline-none"
                                        value={newTokenName}
                                        onChange={(e) => setNewTokenName(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                e.preventDefault()
                                                handleCreateToken()
                                            }
                                        }}
                                    />
                                </div>
                                <div className="flex items-center justify-end gap-md pt-sm border-t border-outline-variant">
                                    <button
                                        onClick={() => {
                                            setShowTokenModal(false)
                                            setNewTokenName("")
                                        }}
                                        className="px-md py-2 bg-surface-container-highest text-on-surface font-body-sm font-semibold rounded-xl hover:bg-surface-variant transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleCreateToken}
                                        disabled={!newTokenName.trim()}
                                        className="px-md py-2 bg-primary-container text-on-primary-container font-body-sm font-semibold rounded-xl hover:scale-[0.98] transition-all disabled:opacity-50"
                                    >
                                        Generate Token
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* 2FA Configuration / View Modal */}
            {showTwoFactorModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-md">
                    <div className="glass-card rounded-2xl p-lg max-w-xl w-full space-y-lg border border-outline-variant shadow-2xl animate-scaleIn">

                        {/* Modal Header */}
                        <div className="flex items-center justify-between border-b border-outline-variant pb-sm">
                            <h3 className="text-headline-md font-bold text-on-surface flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary-fixed">security</span>
                                {twoFactorStep === "setup" && "Set Up Two-Factor Authentication"}
                                {twoFactorStep === "verify" && "Confirm 2FA Configuration"}
                                {twoFactorStep === "success" && "Backup Recovery Codes"}
                                {twoFactorStep === "view" && "Configure 2FA Settings"}
                                {twoFactorStep === "view_decrypted" && "Decrypted 2FA Credentials"}
                            </h3>
                            <button onClick={() => setShowTwoFactorModal(false)} className="text-on-surface-variant hover:text-on-surface">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        {/* Step 1: Generate & Scan QR */}
                        {twoFactorStep === "setup" && (
                            <div className="space-y-md">
                                <p className="text-body-sm text-on-surface-variant">
                                    Enhance your account security by requiring a verification code from a mobile authenticator app when signing in.
                                </p>

                                <div className="flex flex-col md:flex-row items-center gap-lg py-sm">
                                    {/* SVG QR Code Illustration with Laser Scan */}
                                    <div className="relative w-40 h-40 bg-white p-3 rounded-2xl flex items-center justify-center border-2 border-primary-fixed shrink-0 overflow-hidden shadow-inner">
                                        <svg viewBox="0 0 100 100" className="w-full h-full text-neutral-900" fill="currentColor">
                                            {/* Outer bounding blocks */}
                                            <rect x="0" y="0" width="30" height="30" fill="currentColor" />
                                            <rect x="3" y="3" width="24" height="24" fill="white" />
                                            <rect x="9" y="9" width="12" height="12" fill="currentColor" />

                                            <rect x="70" y="0" width="30" height="30" fill="currentColor" />
                                            <rect x="73" y="3" width="24" height="24" fill="white" />
                                            <rect x="79" y="9" width="12" height="12" fill="currentColor" />

                                            <rect x="0" y="70" width="30" height="30" fill="currentColor" />
                                            <rect x="3" y="73" width="24" height="24" fill="white" />
                                            <rect x="9" y="79" width="12" height="12" fill="currentColor" />

                                            {/* Mock QR data pixels */}
                                            <rect x="40" y="10" width="10" height="10" fill="currentColor" />
                                            <rect x="55" y="15" width="5" height="15" fill="currentColor" />
                                            <rect x="40" y="35" width="15" height="5" fill="currentColor" />
                                            <rect x="5" y="45" width="15" height="10" fill="currentColor" />
                                            <rect x="35" y="55" width="10" height="10" fill="currentColor" />
                                            <rect x="55" y="45" width="10" height="10" fill="currentColor" />
                                            <rect x="80" y="40" width="15" height="5" fill="currentColor" />
                                            <rect x="90" y="55" width="10" height="10" fill="currentColor" />
                                            <rect x="85" y="85" width="10" height="10" fill="currentColor" />
                                            <rect x="65" y="75" width="5" height="10" fill="currentColor" />
                                            <rect x="45" y="80" width="15" height="5" fill="currentColor" />
                                            <rect x="40" y="90" width="5" height="10" fill="currentColor" />
                                        </svg>

                                        {/* Animated green laser scanner line */}
                                        <div className="absolute left-0 w-full h-[3px] bg-primary-fixed/80 shadow-[0_0_8px_var(--primary-color)] animate-[scan_2s_ease-in-out_infinite]"></div>
                                        <style>{`
                                            @keyframes scan {
                                                0%, 100% { top: 10%; }
                                                50% { top: 90%; }
                                            }
                                        `}</style>
                                    </div>

                                    <div className="space-y-sm w-full">
                                        <h4 className="font-body-md font-semibold text-on-surface text-sm">Scan QR Code</h4>
                                        <p className="text-xs text-on-surface-variant leading-relaxed">
                                            Scan the code using Google Authenticator, Authy, Microsoft Authenticator, or compatible app.
                                        </p>
                                        <div className="bg-surface-container-highest/60 border border-outline-variant p-sm rounded-xl space-y-1">
                                            <p className="text-[10px] text-on-surface-variant font-semibold uppercase tracking-wider">Secret Key</p>
                                            <div className="flex items-center justify-between gap-sm">
                                                <code className="font-mono text-xs text-primary-fixed font-bold tracking-widest">{rawSecret}</code>
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(rawSecret);
                                                        showToast("Secret key copied to clipboard!");
                                                    }}
                                                    className="text-on-surface-variant hover:text-on-surface px-2 py-0.5 rounded border border-outline-variant text-[10px]"
                                                >
                                                    Copy
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Cryptographic encrypted value proof */}
                                <div className="p-sm rounded-xl bg-primary-container/5 border border-primary-fixed/20 space-y-1">
                                    <div className="flex items-center gap-1.5 text-xs text-primary-fixed font-semibold">
                                        <span className="material-symbols-outlined text-sm">lock</span>
                                        <span>Cryptographic Encryption Vault Storage Output</span>
                                    </div>
                                    <p className="text-[10px] text-on-surface-variant leading-relaxed">
                                        The value shown below is the real ciphertext representation saved to the database:
                                    </p>
                                    <div className="bg-surface-container-lowest/80 border border-outline-variant p-sm rounded-lg">
                                        <code className="font-mono text-[10px] text-on-surface break-all block max-h-16 overflow-y-auto">{encryptedSecret}</code>
                                    </div>
                                </div>

                                {/* Code Verification form */}
                                <div className="space-y-sm pt-sm border-t border-outline-variant">
                                    <label className="block text-xs font-semibold text-on-surface uppercase tracking-wider">Enter Verification Code</label>
                                    <div className="flex gap-md items-center">
                                        <input
                                            type="text"
                                            maxLength="6"
                                            placeholder="000000"
                                            value={verificationCode}
                                            onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
                                            className="bg-surface-container-highest border border-outline-variant rounded-xl px-md py-2.5 text-center text-headline-sm font-mono tracking-widest w-40 focus:ring-2 focus:ring-primary-fixed focus:outline-none"
                                        />
                                        <button
                                            onClick={handleConfirm2FASetup}
                                            className="px-lg py-2.5 bg-primary-container text-on-primary-container font-semibold rounded-xl hover:scale-[0.98] transition-all"
                                        >
                                            Verify Code
                                        </button>
                                    </div>
                                    {twoFactorVerifyError && (
                                        <p className="text-xs text-error font-medium">{twoFactorVerifyError}</p>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Step 2: Verification Success & Recovery Keys */}
                        {twoFactorStep === "success" && (
                            <div className="space-y-md">
                                <div className="flex items-center gap-3 p-md rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-emerald-200">
                                    <span className="material-symbols-outlined text-2xl">check_circle</span>
                                    <div>
                                        <h4 className="font-body-md font-bold text-sm">Authenticator Verified Successfully!</h4>
                                        <p className="text-xs text-neutral-400">Two-factor auth has been configured. Write down these backup codes to prevent lockouts.</p>
                                    </div>
                                </div>

                                <div className="space-y-1">
                                    <label className="block text-xs font-semibold text-on-surface uppercase tracking-wider">Backup Recovery Codes</label>
                                    <p className="text-xs text-on-surface-variant">Each code can only be used once. Store these securely in a password manager.</p>
                                </div>

                                <div className="grid grid-cols-2 gap-sm bg-surface-container-highest/50 border border-outline-variant p-md rounded-xl font-mono text-center text-sm font-semibold tracking-wider text-on-surface">
                                    {recoveryCodes.map((code, index) => (
                                        <div key={index} className="p-2 bg-surface-container-lowest/80 border border-outline-variant/65 rounded-lg select-all">
                                            {code}
                                        </div>
                                    ))}
                                </div>

                                <div className="flex gap-sm">
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(recoveryCodes.join("\n"));
                                            showToast("Recovery codes copied to clipboard!");
                                        }}
                                        className="flex-1 py-2 bg-surface-container-highest border border-outline-variant text-on-surface hover:bg-surface-variant font-body-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-base">content_copy</span>
                                        Copy Codes
                                    </button>
                                    <button
                                        onClick={() => {
                                            const element = document.createElement("a");
                                            const file = new Blob([recoveryCodes.join("\r\n")], { type: 'text/plain' });
                                            element.href = URL.createObjectURL(file);
                                            element.download = "spacers-backup-recovery-codes.txt";
                                            document.body.appendChild(element);
                                            element.click();
                                            document.body.removeChild(element);
                                            showToast("Backup codes downloaded!");
                                        }}
                                        className="flex-1 py-2 bg-surface-container-highest border border-outline-variant text-on-surface hover:bg-surface-variant font-body-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-base">download</span>
                                        Download (.txt)
                                    </button>
                                </div>

                                <div className="pt-sm border-t border-outline-variant flex items-center justify-end">
                                    <button
                                        onClick={handleSave2FAPreferences}
                                        className="px-lg py-2.5 bg-primary-container text-on-primary-container font-semibold rounded-xl hover:scale-[0.98] transition-all"
                                    >
                                        Enable Two-Factor Auth
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Step 3: Locked Settings Details */}
                        {twoFactorStep === "view" && (
                            <div className="space-y-md">
                                <div className="p-md rounded-xl bg-amber-950/20 border border-amber-500/20 flex gap-sm items-start text-amber-200">
                                    <span className="material-symbols-outlined text-xl">lock_open</span>
                                    <div>
                                        <h4 className="font-body-md font-bold text-sm">Decryption Authentication Required</h4>
                                        <p className="text-xs text-neutral-400">To inspect vault records or disable 2FA, please verify your credentials to decrypt the keys.</p>
                                    </div>
                                </div>

                                <div className="space-y-md">
                                    <div>
                                        <label className="block text-body-sm text-on-surface-variant mb-1">Confirm Account Password</label>
                                        <input
                                            type="password"
                                            placeholder="••••••••••••"
                                            value={passwordConfirm}
                                            onChange={(e) => setPasswordConfirm(e.target.value)}
                                            className="w-full bg-surface-container-highest border border-outline-variant rounded-xl px-md py-2.5 text-on-surface font-body-md focus:ring-2 focus:ring-primary-fixed focus:outline-none"
                                        />
                                        {passwordConfirmError && (
                                            <p className="text-xs text-error font-medium mt-1">{passwordConfirmError}</p>
                                        )}
                                    </div>

                                    <div className="flex gap-md pt-sm border-t border-outline-variant justify-between items-center">
                                        <button
                                            onClick={handleDisable2FA}
                                            className="text-xs text-error hover:bg-error/10 px-md py-2 rounded-xl transition-colors border border-error/20 font-semibold"
                                        >
                                            Disable 2FA
                                        </button>
                                        <div className="flex gap-sm">
                                            <button
                                                onClick={() => setShowTwoFactorModal(false)}
                                                className="px-md py-2 bg-surface-container-highest text-on-surface font-body-sm font-semibold rounded-xl hover:bg-surface-variant transition-colors"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={handleDecrypt2FASecret}
                                                disabled={decryptingSecret}
                                                className="px-lg py-2 bg-primary-container text-on-primary-container font-body-sm font-semibold rounded-xl hover:scale-[0.98] transition-all flex items-center gap-sm disabled:opacity-50"
                                            >
                                                {decryptingSecret ? (
                                                    <>
                                                        <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                                                        Decrypting...
                                                    </>
                                                ) : (
                                                    <>
                                                        <span className="material-symbols-outlined text-sm">vpn_key</span>
                                                        Unlock Secret
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Step 4: Display Decrypted Details */}
                        {twoFactorStep === "view_decrypted" && (
                            <div className="space-y-md">
                                <div className="p-sm rounded-xl bg-emerald-950/20 border border-emerald-500/20 flex gap-sm items-center text-emerald-200">
                                    <span className="material-symbols-outlined text-base">verified</span>
                                    <p className="text-xs">Secure decryption completed locally on client.</p>
                                </div>

                                <div className="space-y-sm">
                                    <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider">TOTP Authenticator Secret</label>
                                    <div className="flex items-center gap-2 bg-surface-container-highest border border-outline-variant p-md rounded-xl">
                                        <code className="font-mono text-sm text-primary-fixed font-bold tracking-widest flex-1">{decryptedSecret}</code>
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(decryptedSecret);
                                                showToast("Secret key copied!");
                                            }}
                                            className="px-2 py-1 rounded bg-surface-container-lowest border border-outline-variant text-[10px] text-on-surface hover:bg-surface-variant transition-colors"
                                        >
                                            Copy Key
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-sm">
                                    <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider">Backup Recovery Codes</label>
                                    <div className="grid grid-cols-2 gap-sm bg-surface-container-highest/50 border border-outline-variant p-md rounded-xl font-mono text-center text-sm font-semibold tracking-wider text-on-surface">
                                        {recoveryCodes.map((code, index) => (
                                            <div key={index} className="p-2 bg-surface-container-lowest/80 border border-outline-variant/65 rounded-lg select-all">
                                                {code}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex gap-sm">
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(recoveryCodes.join("\n"));
                                            showToast("Recovery codes copied!");
                                        }}
                                        className="flex-1 py-2 bg-surface-container-highest border border-outline-variant text-on-surface hover:bg-surface-variant font-body-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors text-xs"
                                    >
                                        Copy Codes
                                    </button>
                                    <button
                                        onClick={handleDisable2FA}
                                        className="flex-1 py-2 border border-error/30 text-error hover:bg-error/5 font-body-sm font-semibold rounded-xl flex items-center justify-center gap-2 transition-all text-xs"
                                    >
                                        <span className="material-symbols-outlined text-xs">delete_forever</span>
                                        Disable 2FA
                                    </button>
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            )}
        </>
    )
}
