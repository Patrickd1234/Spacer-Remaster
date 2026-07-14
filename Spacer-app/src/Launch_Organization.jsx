import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "./supabase"

export default function LaunchOrganization() {
    const navigate = useNavigate()
    const [orgName, setOrgName] = useState("")
    const [teamName, setTeamName] = useState("")
    const [deptHeadEmail, setDeptHeadEmail] = useState("")
    const [teamMemberEmails, setTeamMemberEmails] = useState("")
    const [status, setStatus] = useState("idle") // "idle" | "submitting" | "success" | "error"
    const [errorMsg, setErrorMsg] = useState("")

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!orgName.trim() || !teamName.trim() || !deptHeadEmail.trim()) {
            setErrorMsg("Please fill in all required fields.")
            return
        }

        setStatus("submitting")
        setErrorMsg("")

        try {
            // Check if user is authenticated
            const { data: userData, error: userError } = await supabase.auth.getUser();
            if (userError || !userData?.user) {
                throw new Error("You must be logged in to launch an organization.");
            }

            const { error } = await supabase.functions.invoke('launch-organization', {
                body: {
                    organization_name: orgName.trim(),
                    team_spaces: [
                        {
                            name: teamName.trim(),
                            team_lead_email: deptHeadEmail.trim(),
                            member_emails: teamMemberEmails
                                .split(/[\n,]/)
                                .map((e) => e.trim())
                                .filter(Boolean)
                        }
                    ]
                }
            });

            if (error) {
                throw error;
            }

            setStatus("success")
            setTimeout(() => {
                navigate("/onboarding")
            }, 1500)

        } catch (err) {
            console.error("Error launching organization:", err)
            setErrorMsg(err.message || "Something went wrong launching your organization.")
            setStatus("error")
        }
    }

    return (
        <>
            <main class="flex h-screen w-full">
                {/* BEGIN: LeftPane (Branding & Visualization) */}
                <section class="hidden lg:flex flex-col w-1/2 p-16 relative overflow-hidden bg-surface-dim" data-purpose="branding-visuals">
                    {/* Top Branding Section */}
                    <div class="z-10 mb-20">
                        <div class="flex items-center gap-2 mb-4">
                            <div class="w-6 h-6 bg-brand rounded-sm flex items-center justify-center">
                                <svg class="w-4 h-4 text-black" fill="currentColor" viewbox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>
                            </div>
                            <span class="font-bold text-lg tracking-widest uppercase">SPACER</span>
                        </div>
                        <p class="text-gray-400 max-w-sm text-sm leading-relaxed">
                            One workspace for every company. HR, Design, Dev and Marketing — each in their own space, all in one place.
                        </p>
                    </div>
                    {/* Workspace Hierarchy Visualization */}
                    <div class="relative z-10 flex flex-col items-start space-y-4">
                        {/* Organization Level */}
                        <div class="flex items-center gap-3 bg-surface-bright/20 border border-white/10 p-3 rounded-custom w-80 glass-panel">
                            <div class="w-8 h-8 bg-blue-500/20 rounded flex items-center justify-center border border-blue-500/30">
                                <svg class="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewbox="0 0 24 24"><path d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
                            </div>
                            <span class="font-medium text-sm">Circle Corp</span>
                            <div class="ml-auto text-gray-500">
                                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewbox="0 0 24 24"><path d="M9 5l7 7-7 7"></path></svg>
                            </div>
                        </div>
                        {/* Tree Connections & Team Level */}
                        <div class="ml-6 border-l border-white/10 pl-8 space-y-6 py-2">
                            {/* Team Header */}
                            <div class="relative">
                                <div class="absolute -left-8 top-4 w-8 h-px bg-white/10"></div>
                                <div class="flex items-center gap-2 mb-4">
                                    <span class="text-sm font-semibold">Development Team</span>
                                    <svg class="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewbox="0 0 24 24"><path d="M19 9l-7 7-7-7"></path></svg>
                                </div>
                                {/* Project Items */}
                                <div class="space-y-3 ml-4">
                                    <div class="flex items-center gap-3 bg-white/5 border border-white/5 p-2 px-4 rounded-custom w-64">
                                        <span class="text-gray-400 text-xs">✨ Project Launch</span>
                                        <svg class="ml-auto w-3 h-3 text-gray-600" fill="none" stroke="currentColor" viewbox="0 0 24 24"><path d="M19 9l-7 7-7-7"></path></svg>
                                    </div>
                                    <div class="flex items-center gap-3 bg-white/10 border border-white/10 p-2 px-4 rounded-custom w-64 neon-glow">
                                        <span class="text-white text-xs">💻 App Redesign</span>
                                        <svg class="ml-auto w-3 h-3 text-white" fill="none" stroke="currentColor" viewbox="0 0 24 24"><path d="M19 9l-7 7-7-7"></path></svg>
                                    </div>
                                </div>
                            </div>
                            {/* My Space Section */}
                            <div class="relative pt-4">
                                <div class="absolute -left-8 top-8 w-8 h-px bg-white/10"></div>
                                <div class="flex items-center gap-2 mb-4">
                                    <span class="text-sm font-semibold">My Space <span class="text-gray-500 font-normal">(personal workspace)</span></span>
                                </div>
                                {/* Task Card */}
                                <div class="ml-4 p-4 bg-surface-container border border-white/5 rounded-custom w-72 shadow-2xl">
                                    <p class="text-[10px] text-gray-500 mb-2 font-medium">My Task</p>
                                    <div class="p-3 bg-white/5 rounded-md border border-white/5">
                                        <p class="text-xs font-medium mb-1">Fix auth token expiry bug</p>
                                        <p class="text-[10px] text-gray-500">Sessions dropping before timeout period ends — users getting logged...</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    {/* Decorative background glow */}
                    <div class="absolute -bottom-24 -left-24 w-96 h-96 bg-brand opacity-5 blur-[120px] rounded-full"></div>
                </section>
                {/* END: LeftPane */}
                {/* Central Divider */}
                <div class="vertical-divider h-full"></div>
                {/* BEGIN: RightPane (Onboarding Form) */}
                <section class="flex-1 flex flex-col justify-center items-center px-8 lg:px-20 bg-surface" data-purpose="onboarding-form">
                    <div class="max-w-md w-full">
                        {/* Step Indicator */}
                        <span class="text-xs font-medium text-gray-500 mb-6 block">Step 1 of 3</span>
                        {/* Header */}
                        <header class="mb-10">
                            <h1 class="text-4xl font-bold text-white mb-4 tracking-tight">Create Your Organization</h1>
                            <p class="text-gray-400 text-sm leading-relaxed">
                                One workspace for every company. HR, Design, Dev and Marketing — each in their own space, all in one place.
                            </p>
                        </header>
                        {/* Form */}
                        <form action="#" class="space-y-6" method="POST">
                            {/* Field: Company Name */}
                            <div data-purpose="input-group">
                                <label class="block text-sm font-medium text-gray-300 mb-2" for="company-name">
                                    Company Name <span class="text-red-500">*</span>
                                </label>
                                <input class="w-full bg-surface-dim border border-white/10 rounded-custom px-4 py-3 text-sm focus:border-brand focus:ring-1 focus:ring-brand transition-all outline-none placeholder:text-gray-600" id="company-name" placeholder="Enter company name" required="" type="text" />
                            </div>
                            {/* Field: Email */}
                            <div data-purpose="input-group">
                                <label class="block text-sm font-medium text-gray-300 mb-2" for="email">
                                    Company Email/Personal Email <span class="text-red-500">*</span>
                                </label>
                                <input class="w-full bg-surface-dim border border-white/10 rounded-custom px-4 py-3 text-sm focus:border-brand focus:ring-1 focus:ring-brand transition-all outline-none placeholder:text-gray-600" id="email" placeholder="Enter company email" required="" type="email" />
                            </div>
                            {/* Field: Password */}
                            <div class="relative" data-purpose="input-group">
                                <label class="block text-sm font-medium text-gray-300 mb-2" for="password">
                                    Password <span class="text-red-500">*</span>
                                </label>
                                <div class="relative">
                                    <input class="w-full bg-surface-dim border border-white/10 rounded-custom px-4 py-3 text-sm focus:border-brand focus:ring-1 focus:ring-brand transition-all outline-none placeholder:text-gray-600 pr-10" id="password" placeholder="Enter Password" required="" type="password" />
                                    <button class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300" type="button">
                                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewbox="0 0 24 24"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
                                    </button>
                                </div>
                            </div>
                            {/* Terms Checkbox */}
                            <div class="flex items-start gap-3">
                                <div class="flex items-center h-5">
                                    <input class="h-4 w-4 rounded border-white/10 bg-surface-dim text-brand focus:ring-brand" id="terms" name="terms" required="" type="checkbox" />
                                </div>
                                <label class="text-sm text-gray-400" for="terms">
                                    To establish an Organization, please accept our <a class="text-brand hover:underline" href="#">Terms &amp; Services</a>
                                </label>
                            </div>
                            {/* Submit Button */}
                            <button class="w-full py-4 px-6 bg-surface-container border border-white/5 text-gray-600 font-bold rounded-custom transition-all hover:bg-white/5 cursor-not-allowed mt-4" disabled="" type="submit">
                                Create Account
                            </button>
                            {/* Sign In Link */}
                            <p class="text-center text-sm text-gray-400 mt-6">
                                Already have an account? <a class="text-brand hover:underline" href="#">Sign in</a>
                            </p>
                        </form>
                    </div>
                </section>
                {/* END: RightPane */}
            </main>
        </>
    )
}