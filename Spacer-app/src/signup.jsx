import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { supabase } from "./supabase"

function Signup() {
    const [status, setStatus] = useState("idle") // "idle" | "submitting" | "success"
    const [fullName, setFullName] = useState("")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [errorMsg, setErrorMsg] = useState("")
    const navigate = useNavigate()

    const [isDemoMode, setIsDemoMode] = useState(localStorage.getItem("use_mock_supabase") === "true")

    const toggleDemoMode = () => {
        const newValue = !isDemoMode
        localStorage.setItem("use_mock_supabase", String(newValue))
        setIsDemoMode(newValue)
        if (newValue) {
            localStorage.removeItem("sb-vrzepdjjjpodztqkfsbh-auth-token")
        } else {
            localStorage.removeItem("mock_session")
        }
        window.location.reload()
    }

    const enableDemoMode = () => {
        localStorage.setItem("use_mock_supabase", "true")
        localStorage.removeItem("sb-vrzepdjjjpodztqkfsbh-auth-token")
        window.location.reload()
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setErrorMsg("")
        setStatus("submitting")

        try {
            // Sign up user in Supabase Auth
            const { data, error } = await supabase.auth.signUp({
                email: email,
                password: password,
                options: {
                    data: {
                        full_name: fullName,
                    }
                }
            })

            if (error) {
                throw error
            }

            // Call the invite-team-post-launch edge function right after signing up
            try {
                await supabase.functions.invoke('invite-team-post-launch', {
                    body: {
                        organization_id: data?.user?.user_metadata?.organization_id || '',
                        new_team_space_name: 'General',
                        invites: []
                    }
                })
            } catch (funcError) {
                console.error("Error calling invite-team-post-launch:", funcError)
            }

            // Insert user into public.users table if auth sign up succeeded
            if (data?.user) {
                const { error: insertError } = await supabase.from("users").insert({
                    id: data.user.id,
                    email: email,
                    name: fullName,
                })
                if (insertError) {
                    console.error("Error inserting user profile:", insertError)
                }
            }

            setStatus("success")
            setTimeout(() => {
                setStatus("idle")
                // Redirect to login page
                navigate("/login")
            }, 1500)
        } catch (err) {
            console.error("Signup error:", err)

            // Clean up empty or serialized empty object error messages from Supabase Client
            let displayMessage = err.message || ""
            if (displayMessage === "{}" || !displayMessage) {
                displayMessage = "Internal Server Error (Failed to send signup email)"
            }

            const isEmailIssue =
                err.code === "over_email_send_rate_limit" ||
                err.code === "unexpected_failure" ||
                err.name === "AuthRetryableFetchError" ||
                err.status === 500 ||
                displayMessage.toLowerCase().includes("rate limit") ||
                displayMessage.toLowerCase().includes("confirmation email") ||
                displayMessage.toLowerCase().includes("email") ||
                displayMessage.toLowerCase().includes("server error")

            if (isEmailIssue) {
                setErrorMsg(
                    <span>
                        Email delivery issue encountered ({displayMessage}).{" "}
                        <button
                            type="button"
                            onClick={enableDemoMode}
                            className="underline text-primary-fixed hover:brightness-110 font-bold ml-1 cursor-pointer"
                        >
                            Click here to activate Demo/Mock Mode
                        </button>{" "}
                        to run the app entirely in your browser.
                    </span>
                )
            } else {
                setErrorMsg(displayMessage || "Something went wrong during signup.")
            }
            setStatus("idle")
        }
    }

    return (
        <div className="bg-surface text-gray-200 font-sans antialiased overflow-hidden min-h-screen relative">
            {/* Demo Mode Toggle Badge */}
            <div className="absolute top-4 right-4 z-50">
                <div className="glass-panel px-3 py-1.5 rounded-full flex items-center gap-2 text-xs bg-surface-container-low/80 border border-outline-variant/30 backdrop-blur-md shadow-lg">
                    <span className={`w-2.5 h-2.5 rounded-full ${isDemoMode ? "bg-primary-fixed animate-pulse shadow-[0_0_8px_#aff82a]" : "bg-outline"}`}></span>
                    <span className="font-semibold text-on-surface uppercase tracking-wider text-[10px]">Demo Mode: {isDemoMode ? "ON" : "OFF"}</span>
                    <button
                        type="button"
                        onClick={toggleDemoMode}
                        className="px-2 py-0.5 bg-primary-fixed text-on-primary-fixed text-[10px] font-bold rounded hover:brightness-110 transition-all cursor-pointer uppercase tracking-wider"
                    >
                        Toggle
                    </button>
                </div>
            </div>

            {/* BEGIN: MainLayout */}
            <main className="flex h-screen w-full overflow-hidden">
                {/* BEGIN: LeftBrandSide */}
                <section className="hidden lg:flex flex-col w-1/2 relative p-12 bg-surface-lowest overflow-hidden border-r border-white/5">
                    {/* Decorative Background Glows */}
                    <div className="absolute -top-24 -left-24 w-96 h-96 bg-brand/10 rounded-full blur-[120px] animate-glow"></div>
                    <div className="absolute bottom-1/4 -right-24 w-64 h-64 bg-brand/5 rounded-full blur-[80px]"></div>
                    
                    {/* Brand Logo & Header */}
                    <header className="relative z-10 mb-12">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(182,255,51,0.4)]">
                                <svg className="w-5 h-5 text-surface" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>
                            </div>
                            <span className="text-xl font-bold tracking-tight text-white uppercase">SPACER</span>
                        </div>
                        <p className="text-gray-400 max-w-sm text-sm leading-relaxed">
                            One workspace for every company. HR, Design, Dev and Marketing — each in their own space, all in one place.
                        </p>
                    </header>

                    {/* Visualization Illustration (Mockup of Organization Chart) */}
                    <div className="relative flex-1 flex flex-col justify-center items-start">
                        {/* Main Org Node */}
                        <div className="glass-card inner-glow p-4 rounded-eight w-64 flex items-center justify-between mb-8">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded bg-blue-500/20 flex items-center justify-center text-blue-400">
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.54 1.118l-3.976-2.888a1 0 00-1.175 0l-3.976 2.888c-.784.57-1.838-.197-1.539-1.118l1.518-4.674a1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 0 00.951-.69l1.519-4.674z" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                                </div>
                                <span className="font-medium text-white">Circle Corp</span>
                            </div>
                            <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"></path></svg>
                        </div>

                        {/* Connection Line Vertical */}
                        <div className="ml-4 w-px h-64 bg-gradient-to-b from-gray-700 via-gray-800 to-transparent"></div>

                        {/* Nested Branch: Development */}
                        <div className="absolute top-[55%] left-4 space-y-4">
                            <div className="flex items-center gap-4">
                                <div className="w-8 h-px bg-gray-700"></div>
                                <div className="glass-card inner-glow px-4 py-2 rounded-eight text-sm flex items-center gap-2">
                                    <span className="text-white">Development Team</span>
                                    <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7"></path></svg>
                                </div>
                            </div>

                            {/* Sub-task cards */}
                            <div className="ml-12 flex flex-col gap-3">
                                <div className="glass-card inner-glow p-3 rounded-eight text-xs w-48 border-l-2 border-l-brand">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-gray-400">Fix auth token bug</span>
                                        <span className="text-[10px] text-brand bg-brand/10 px-1 rounded">Urgent</span>
                                    </div>
                                    <div className="w-full bg-gray-800 h-1 rounded-full mt-2">
                                        <div className="bg-brand h-full rounded-full w-2/3"></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Floating UI Element Right */}
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 glass-card p-4 rounded-eight w-72 shadow-2xl scale-110">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-xs font-semibold text-gray-400">Website Redesign</span>
                                <div className="flex -space-x-2">
                                    <div className="w-5 h-5 rounded-full bg-brand/20 border border-brand/50"></div>
                                    <div className="w-5 h-5 rounded-full bg-purple-500/20 border border-purple-500/50"></div>
                                    <div className="w-5 h-5 rounded-full bg-blue-500/20 border border-blue-500/50"></div>
                                </div>
                            </div>
                            <p className="text-sm text-white mb-2">Fix auth token expiry bug</p>
                            <p className="text-[10px] text-gray-500 mb-4">Sessions dropping before timeout period ends — users getting logged...</p>
                            <div className="flex items-center gap-4 text-[10px] text-gray-400">
                                <span className="flex items-center gap-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg> 5</span>
                                <span className="flex items-center gap-1"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg> 2/5</span>
                            </div>
                        </div>
                    </div>
                    <footer className="mt-auto relative z-10 text-[10px] text-gray-600">
                        © 2024 SPACER Inc. All rights reserved.
                    </footer>
                </section>
                {/* END: LeftBrandSide */}

                {/* BEGIN: RegistrationSide */}
                <section className="flex-1 flex flex-col justify-center items-center px-6 md:px-24 bg-surface-dim overflow-y-auto">
                    <div className="w-full max-w-md">
                        {/* BEGIN: FormHeader */}
                        <div className="mb-8 text-center lg:text-left">
                            <h1 className="text-3xl md:text-4xl font-bold text-white mb-3 tracking-tight">Create Your Account</h1>
                            <p className="text-gray-400 text-sm leading-relaxed">
                                One workspace for every company. HR, Design, Dev and Marketing — each in their own space, all in one place.
                            </p>
                        </div>
                        {/* END: FormHeader */}

                        {/* Error Message */}
                        {errorMsg && (
                            <div className="mb-6 p-4 bg-error-container/20 border border-error text-error text-xs rounded-lg leading-relaxed">
                                {errorMsg}
                            </div>
                        )}

                        {/* BEGIN: RegistrationForm */}
                        <form onSubmit={handleSubmit} className="space-y-5">
                            {/* Full Name Field */}
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-2" htmlFor="fullname">
                                    Full Name <span className="text-red-500">*</span>
                                </label>
                                <input 
                                    className="w-full bg-surface-container border border-white/5 rounded-eight px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand transition-all" 
                                    id="fullname" 
                                    name="fullname" 
                                    placeholder="Enter your full name" 
                                    type="text" 
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    required
                                />
                            </div>

                            {/* Email Field */}
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-2" htmlFor="email">
                                    Email Address <span className="text-red-500">*</span>
                                </label>
                                <input 
                                    className="w-full bg-surface-container border border-white/5 rounded-eight px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand transition-all" 
                                    id="email" 
                                    name="email" 
                                    placeholder="name@company.com" 
                                    type="email" 
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>

                            {/* Password Field */}
                            <div>
                                <label className="block text-xs font-medium text-gray-400 mb-2" htmlFor="password">
                                    Password <span className="text-red-500">*</span>
                                </label>
                                <div className="relative">
                                    <input 
                                        className="w-full bg-surface-container border border-white/5 rounded-eight px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-brand focus:border-brand transition-all pr-10" 
                                        id="password" 
                                        name="password" 
                                        placeholder="Enter Password" 
                                        type="password" 
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                    />
                                    <button className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300" type="button">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                                    </button>
                                </div>
                            </div>

                            {/* Terms Checkbox */}
                            <div className="flex items-start gap-3">
                                <div className="flex items-center h-5">
                                    <input className="h-4 w-4 rounded border-white/10 bg-surface-container text-brand focus:ring-brand focus:ring-offset-surface-dim" id="terms" name="terms" required type="checkbox" />
                                </div>
                                <label className="text-xs text-gray-400 leading-normal" htmlFor="terms">
                                    To establish an Organization, please accept our <a className="text-brand hover:underline" href="#">Terms &amp; Services</a>
                                </label>
                            </div>

                            {/* Submit Button */}
                            <button 
                                className="w-full bg-brand text-surface-lowest font-bold py-3.5 rounded-eight hover:opacity-90 active:scale-[0.99] transition-all shadow-[0_0_20px_rgba(182,255,51,0.2)] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" 
                                type="submit"
                                disabled={status === "submitting"}
                            >
                                {status === "submitting" ? (
                                    <>
                                        <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                                        <span>Creating Account...</span>
                                    </>
                                ) : (
                                    <span>Create Account</span>
                                )}
                            </button>
                        </form>
                        {/* END: RegistrationForm */}

                        {/* BEGIN: FormFooter */}
                        <div className="mt-8 text-center">
                            <p className="text-sm text-gray-500">
                                Already have an account? <Link className="text-brand hover:underline font-medium" to="/login">Sign in</Link>
                            </p>
                        </div>
                        {/* END: FormFooter */}
                    </div>
                </section>
                {/* END: RegistrationSide */}
            </main>
            {/* END: MainLayout */}
        </div>
    )
}

export default Signup