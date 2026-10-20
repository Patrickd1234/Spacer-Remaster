import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { callEdgeFunction } from "./edgeFunctions"

export default function LaunchOrganization({ onOrganizationChanged }) {
    const navigate = useNavigate()
    const [orgName, setOrgName] = useState("")
    const [teamName, setTeamName] = useState("")
    const [deptHeadEmail, setDeptHeadEmail] = useState("")
    const [teamMemberEmails, setTeamMemberEmails] = useState("")
    const [status, setStatus] = useState("idle") // "idle" | "submitting" | "success" | "error"
    const [errorMsg, setErrorMsg] = useState("")

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!orgName.trim() || !teamName.trim()) {
            setErrorMsg("Please fill in all required fields.")
            return
        }

        setStatus("submitting")
        setErrorMsg("")

        try {
            // Makes the caller the organization's super admin (edge function)
            const { error } = await callEdgeFunction('launch-organization', {
                organization_name: orgName.trim(),
                team_spaces: [
                    {
                        name: teamName.trim(),
                        team_lead_email: deptHeadEmail.trim() || undefined,
                        member_emails: teamMemberEmails
                            .split(/[\n,]/)
                            .map((e) => e.trim())
                            .filter(Boolean)
                    }
                ]
            });

            if (error) {
                throw new Error(error);
            }

            setStatus("success")
            // App.jsx only lets members of an organization past this point
            await onOrganizationChanged?.()
            navigate("/onboarding", { replace: true })

        } catch (err) {
            console.error("Error launching organization:", err)
            setErrorMsg(err.message || "Something went wrong launching your organization.")
            setStatus("error")
        }
    }

    return (
        <main className="flex h-screen w-full">
            {/* BEGIN: LeftPane (Branding & Visualization) */}
            <section className="hidden lg:flex flex-col w-1/2 p-16 relative overflow-hidden bg-surface-dim" data-purpose="branding-visuals">
                {/* Top Branding Section */}
                <div className="z-10 mb-20">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-6 h-6 bg-brand rounded-sm flex items-center justify-center">
                            <svg className="w-4 h-4 text-black" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>
                        </div>
                        <span className="font-bold text-lg tracking-widest uppercase">SPACER</span>
                    </div>
                    <p className="text-gray-400 max-w-sm text-sm leading-relaxed">
                        One workspace for every company. HR, Design, Dev and Marketing — each in their own space, all in one place.
                    </p>
                </div>
                {/* Workspace Hierarchy Visualization */}
                <div className="relative z-10 flex flex-col items-start space-y-4">
                    {/* Organization Level */}
                    <div className="flex items-center gap-3 bg-surface-bright/20 border border-white/10 p-3 rounded-custom w-80 glass-panel">
                        <div className="w-8 h-8 bg-blue-500/20 rounded flex items-center justify-center border border-blue-500/30">
                            <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                        </div>
                        <span className="font-medium text-sm">{orgName.trim() || "Your Organization"}</span>
                        <div className="ml-auto text-gray-500">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"></path></svg>
                        </div>
                    </div>
                    {/* Tree Connections & Team Level */}
                    <div className="ml-6 border-l border-white/10 pl-8 space-y-6 py-2">
                        {/* Team Header */}
                        <div className="relative">
                            <div className="absolute -left-8 top-4 w-8 h-px bg-white/10"></div>
                            <div className="flex items-center gap-2 mb-4">
                                <span className="text-sm font-semibold">{teamName.trim() || "Development Team"}</span>
                                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7"></path></svg>
                            </div>
                            {/* Project Items */}
                            <div className="space-y-3 ml-4">
                                <div className="flex items-center gap-3 bg-white/5 border border-white/5 p-2 px-4 rounded-custom w-64">
                                    <span className="text-gray-400 text-xs">✨ Project Launch</span>
                                    <svg className="ml-auto w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7"></path></svg>
                                </div>
                                <div className="flex items-center gap-3 bg-white/10 border border-white/10 p-2 px-4 rounded-custom w-64 neon-glow">
                                    <span className="text-white text-xs">💻 App Redesign</span>
                                    <svg className="ml-auto w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7"></path></svg>
                                </div>
                            </div>
                        </div>
                        {/* My Space Section */}
                        <div className="relative pt-4">
                            <div className="absolute -left-8 top-8 w-8 h-px bg-white/10"></div>
                            <div className="flex items-center gap-2 mb-4">
                                <span className="text-sm font-semibold">My Space <span className="text-gray-500 font-normal">(personal workspace)</span></span>
                            </div>
                            {/* Task Card */}
                            <div className="ml-4 p-4 bg-surface-container border border-white/5 rounded-custom w-72 shadow-2xl">
                                <p className="text-[10px] text-gray-500 mb-2 font-medium">My Task</p>
                                <div className="p-3 bg-white/5 rounded-md border border-white/5">
                                    <p className="text-xs font-medium mb-1">Fix auth token expiry bug</p>
                                    <p className="text-[10px] text-gray-500">Sessions dropping before timeout period ends — users getting logged...</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                {/* Decorative background glow */}
                <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-brand opacity-5 blur-[120px] rounded-full"></div>
            </section>
            {/* END: LeftPane */}
            {/* Central Divider */}
            <div className="vertical-divider h-full"></div>
            {/* BEGIN: RightPane (Launch Organization Form) */}
            <section className="flex-1 flex flex-col justify-center items-center px-8 lg:px-20 bg-surface overflow-y-auto py-12" data-purpose="onboarding-form">
                <div className="max-w-md w-full">
                    {/* Step Indicator */}
                    <span className="text-xs font-medium text-gray-500 mb-4 block">Step 1 of 3</span>
                    {/* Header */}
                    <header className="mb-8">
                        <h1 className="text-3xl lg:text-4xl font-bold text-white mb-3 tracking-tight">Create Your Organization</h1>
                        <p className="text-gray-400 text-sm leading-relaxed">
                            Set up your organization workspace and kickstart your first team space.
                        </p>
                    </header>

                    {/* Error / Alert Message */}
                    {errorMsg && (
                        <div className="mb-6 p-3 rounded-custom bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                            {errorMsg}
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Field: Organization Name */}
                        <div data-purpose="input-group">
                            <label className="block text-sm font-medium text-gray-300 mb-2" htmlFor="org-name">
                                Organization / Company Name <span className="text-brand">*</span>
                            </label>
                            <input
                                id="org-name"
                                type="text"
                                value={orgName}
                                onChange={(e) => setOrgName(e.target.value)}
                                placeholder="e.g. Acme Corporation"
                                required
                                className="w-full bg-surface-dim border border-white/10 rounded-custom px-4 py-3 text-sm text-white focus:border-brand focus:ring-1 focus:ring-brand transition-all outline-none placeholder:text-gray-600"
                            />
                        </div>

                        {/* Field: First Team Space */}
                        <div data-purpose="input-group">
                            <label className="block text-sm font-medium text-gray-300 mb-2" htmlFor="team-name">
                                First Team Space Name <span className="text-brand">*</span>
                            </label>
                            <input
                                id="team-name"
                                type="text"
                                value={teamName}
                                onChange={(e) => setTeamName(e.target.value)}
                                placeholder="e.g. Development Team"
                                required
                                className="w-full bg-surface-dim border border-white/10 rounded-custom px-4 py-3 text-sm text-white focus:border-brand focus:ring-1 focus:ring-brand transition-all outline-none placeholder:text-gray-600"
                            />
                        </div>

                        {/* Field: Department / Team Lead Email */}
                        <div data-purpose="input-group">
                            <label className="block text-sm font-medium text-gray-300 mb-2" htmlFor="lead-email">
                                Team Lead Email <span className="text-xs text-gray-500 font-normal">(optional — they join when they sign up with this email)</span>
                            </label>
                            <input
                                id="lead-email"
                                type="email"
                                value={deptHeadEmail}
                                onChange={(e) => setDeptHeadEmail(e.target.value)}
                                placeholder="lead@company.com"
                                className="w-full bg-surface-dim border border-white/10 rounded-custom px-4 py-3 text-sm text-white focus:border-brand focus:ring-1 focus:ring-brand transition-all outline-none placeholder:text-gray-600"
                            />
                        </div>

                        {/* Field: Member Emails */}
                        <div data-purpose="input-group">
                            <div className="flex justify-between items-center mb-2">
                                <label className="block text-sm font-medium text-gray-300" htmlFor="member-emails">
                                    Team Member Emails
                                </label>
                                <span className="text-xs text-gray-500">Optional</span>
                            </div>
                            <textarea
                                id="member-emails"
                                rows={3}
                                value={teamMemberEmails}
                                onChange={(e) => setTeamMemberEmails(e.target.value)}
                                placeholder="Enter emails separated by commas or new lines..."
                                className="w-full bg-surface-dim border border-white/10 rounded-custom px-4 py-3 text-sm text-white focus:border-brand focus:ring-1 focus:ring-brand transition-all outline-none placeholder:text-gray-600 resize-none"
                            />
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={status === "submitting" || status === "success"}
                            className={`w-full py-4 px-6 font-bold rounded-custom transition-all mt-4 flex items-center justify-center gap-2 ${
                                status === "submitting"
                                    ? "bg-surface-bright text-gray-400 cursor-wait"
                                    : status === "success"
                                    ? "bg-green-500 text-black font-semibold"
                                    : "bg-brand text-black hover:opacity-90 cursor-pointer shadow-[0_0_15px_rgba(182,255,51,0.25)]"
                            }`}
                        >
                            {status === "submitting" && (
                                <svg className="animate-spin h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                                </svg>
                            )}
                            <span>
                                {status === "submitting"
                                    ? "Launching Organization..."
                                    : status === "success"
                                    ? "Organization Launched! Redirecting..."
                                    : "Launch Organization"}
                            </span>
                        </button>
                    </form>
                </div>
            </section>
            {/* END: RightPane */}
        </main>
    )
}