import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { supabase } from "./supabase"

function Signup() {
    const [status, setStatus] = useState("idle")
    const [fullName, setFullName] = useState("")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [errorMsg, setErrorMsg] = useState("")
    const [isGoogleLoading, setIsGoogleLoading] = useState(false)
    const navigate = useNavigate()

    const [isDemoMode, setIsDemoMode] = useState(localStorage.getItem("use_mock_supabase") === "true")
    const googleAuthReady = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

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

    const handleGoogleSignUp = async () => {
        if (!googleAuthReady) {
            setErrorMsg('Google sign-in is currently unavailable until Supabase Google auth is configured.')
            return
        }

        setErrorMsg("")
        setIsGoogleLoading(true)

        const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: `${window.location.origin}/`
            }
        })

        if (error) {
            console.error(error)
            setErrorMsg(error.message)
        }

        setIsGoogleLoading(false)
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setErrorMsg("")
        setStatus("submitting")

        try {
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

            if (data?.user) {
                const { error: insertError } = await supabase.from("users").insert({
                    id: data.user.id,
                    email: email,
                    name: fullName,
                })
                if (insertError) {
                    console.error("Error inserting user profile:", insertError)
                }

                try {
                    await supabase.from('activity_log').insert({
                        entity_type: 'user',
                        entity_id: data.user.id,
                        actor_id: data.user.id,
                        action: 'signup',
                        new_state: { email, full_name: fullName }
                    })
                } catch (logError) {
                    console.error('Error logging signup activity:', logError)
                }
            }

            setStatus("success")
            setTimeout(() => {
                setStatus("idle")
                navigate("/login")
            }, 1500)
        } catch (err) {
            console.error("Signup error:", err)

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
                            className="underline text-[var(--primary-color)] hover:brightness-110 font-bold ml-1 cursor-pointer"
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

    const isEmailError = typeof errorMsg === "string" && errorMsg.toLowerCase().includes("email")
    const isPasswordError = typeof errorMsg === "string" && errorMsg.toLowerCase().includes("password")

    return (
        <div className="min-h-screen bg-[var(--bg-base)] flex overflow-hidden">
            {/* Top Error Toast */}
            {errorMsg && (
                <div className="fixed top-8 right-8 z-50 flex items-center gap-4 bg-error-container/90 backdrop-blur-md border border-error rounded-xl p-4 shadow-2xl max-w-sm animate-in fade-in slide-in-from-top-10">
                    <div className="w-8 h-8 rounded border border-outline-variant/20 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-on-error-container text-[18px]">error</span>
                    </div>
                    <div className="text-on-error-container text-[14px] leading-tight">
                        {errorMsg}
                    </div>
                </div>
            )}

            {/* Demo Mode Toggle */}
            <div className="absolute top-4 left-4 z-50 opacity-10 hover:opacity-100 transition-opacity">
                <button onClick={toggleDemoMode} className="text-xs bg-[var(--bg-border)] text-on-surface px-2 py-1 rounded">
                    Demo: {isDemoMode ? "ON" : "OFF"}
                </button>
            </div>

            {/* Left Side: Visual/Brand (Hidden on mobile) */}
            <div className="hidden lg:flex w-[55%] relative flex-col px-16 py-12 border-r border-[var(--bg-border)]/30">
                {/* Abstract Glowing Backgrounds */}
                <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full blur-[120px] opacity-40 mix-blend-screen pointer-events-none" style={{ backgroundColor: "rgba(var(--primary-color-rgb), 0.12)" }} />
                <div className="absolute bottom-[-10%] right-[10%] w-[400px] h-[400px] rounded-full blur-[120px] opacity-40 mix-blend-screen pointer-events-none" style={{ backgroundColor: "rgba(var(--primary-color-rgb), 0.1)" }} />

                {/* Branding */}
                <div className="relative z-10 mb-12">
                    <div className="flex items-center gap-2 mb-8">
                        <span className="material-symbols-outlined text-[var(--primary-color)] font-bold text-[24px]">token</span>
                        <h1 className="text-[16px] font-bold tracking-widest text-on-surface uppercase">Spacer</h1>
                    </div>
                    <h2 className="text-4xl font-bold leading-tight mb-4 text-on-surface">
                        One workspace for <br />
                        <span className="text-[var(--primary-color)]">every team.</span>
                    </h2>
                    <p className="text-on-surface-variant text-base mb-8 max-w-md">
                        HR, Design, Development, and Marketing — bring all company operations into one unified platform.
                    </p>
                </div>

                <div className="relative z-10 mt-auto border-l-2 border-[var(--primary-color)] pl-4">
                    <p className="text-sm text-on-surface-variant italic">
                        "Set up your organization in minutes and invite team leads seamlessly."
                    </p>
                </div>
            </div>

            {/* Right Side: Sign Up Form */}
            <div className="w-full lg:w-[45%] flex flex-col justify-center px-8 sm:px-16 lg:px-24 bg-[var(--bg-base)] relative z-10 overflow-y-auto py-12">
                <div className="w-full max-w-[420px] mx-auto">
                    <div className="w-10 h-10 mb-6 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[var(--primary-color)] text-[36px]">token</span>
                    </div>

                    <h2 className="text-[36px] font-bold text-on-surface mb-2 tracking-tight">Create Account</h2>
                    <p className="text-on-surface-variant text-[15px] mb-8 leading-relaxed">
                        Join your team and start collaborating on Spacer.
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Full Name Input */}
                        <div className="relative">
                            <input 
                                type="text" 
                                id="fullname"
                                placeholder="Full Name" 
                                className="w-full bg-[var(--bg-lowest)] border border-[var(--bg-border)] focus:border-[var(--primary-color)] rounded-xl px-4 py-3.5 text-on-surface text-[14px] placeholder:text-on-surface-variant focus:outline-none transition-colors"
                                value={fullName} 
                                onChange={(e) => setFullName(e.target.value)} 
                                required 
                            />
                        </div>

                        {/* Email Input */}
                        <div className="relative">
                            <input 
                                type="email" 
                                id="email"
                                placeholder="Email address" 
                                className={`w-full bg-[var(--bg-lowest)] border ${isEmailError ? 'border-error focus:border-error' : 'border-[var(--bg-border)] focus:border-[var(--primary-color)]'} rounded-xl px-4 py-3.5 text-on-surface text-[14px] placeholder:text-on-surface-variant focus:outline-none transition-colors`}
                                value={email} 
                                onChange={(e) => setEmail(e.target.value)} 
                                required 
                            />
                        </div>

                        {/* Password Input */}
                        <div className="relative">
                            <input 
                                type={showPassword ? "text" : "password"} 
                                id="password"
                                placeholder="Password" 
                                className={`w-full bg-[var(--bg-lowest)] border ${isPasswordError ? 'border-error focus:border-error' : 'border-[var(--bg-border)] focus:border-[var(--primary-color)]'} rounded-xl px-4 py-3.5 text-on-surface text-[14px] placeholder:text-on-surface-variant focus:outline-none transition-colors`}
                                value={password} 
                                onChange={(e) => setPassword(e.target.value)} 
                                required 
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 top-[14px] text-on-surface-variant hover:text-on-surface transition-colors"
                            >
                                <span className="material-symbols-outlined text-[20px]">
                                    {showPassword ? "visibility_off" : "visibility"}
                                </span>
                            </button>
                        </div>

                        {/* Terms Checkbox */}
                        <div className="flex items-start gap-3 pt-2">
                            <input id="terms" name="terms" required type="checkbox" className="mt-0.5 rounded border-[var(--bg-border)] bg-[var(--bg-lowest)] text-[var(--primary-color)] focus:ring-[var(--primary-color)]" />
                            <label htmlFor="terms" className="text-on-surface-variant text-[13px] leading-normal">
                                I agree to the <a href="#" className="text-[var(--primary-color)] hover:underline">Terms &amp; Conditions</a> and Privacy Policy
                            </label>
                        </div>

                        {/* Sign Up Button */}
                        <button 
                            type="submit" 
                            disabled={status === "submitting"}
                            className="w-full bg-[var(--primary-color)] hover:bg-[var(--primary-color-dim)] text-[var(--bg-base)] font-bold text-[15px] py-3.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                            {status === "submitting" ? (
                                <>
                                    <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                                    Creating Account...
                                </>
                            ) : (
                                "Create Account"
                            )}
                        </button>

                        <div className="flex items-center gap-4 my-4">
                            <div className="h-px bg-[var(--bg-border)] flex-1"></div>
                            <span className="text-on-surface-variant text-xs">or</span>
                            <div className="h-px bg-[var(--bg-border)] flex-1"></div>
                        </div>

                        <button
                            type="button"
                            onClick={handleGoogleSignUp}
                            disabled={isGoogleLoading || !googleAuthReady}
                            className="w-full flex items-center justify-center gap-3 border border-[var(--bg-border)] bg-[var(--bg-lowest)] hover:bg-[var(--bg-surface)] text-on-surface font-medium text-sm py-3.5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:border-outline"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                            </svg>
                            {isGoogleLoading ? 'Connecting to Google...' : googleAuthReady ? 'Sign up with Google' : 'Google sign-in pending setup'}
                        </button>

                        {!googleAuthReady && (
                            <p className="text-center text-xs text-on-surface-variant mt-3">
                                Google sign-in is currently unavailable until Supabase Google auth is configured.
                            </p>
                        )}

                        <div className="text-center mt-6">
                            <p className="text-on-surface-variant text-[14px]">
                                Already have an account? <Link to="/login" className="text-[var(--primary-color)] font-semibold hover:underline">Sign In</Link>
                            </p>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}

export default Signup