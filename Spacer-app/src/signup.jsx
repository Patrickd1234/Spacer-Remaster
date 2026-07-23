import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { supabase } from "./supabase"

function Signup() {
    const [status, setStatus] = useState("idle") // "idle" | "submitting" | "success"
    const [fullName, setFullName] = useState("")
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
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
                            className="underline text-[#aff82a] font-bold ml-1 cursor-pointer"
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
        <div className="flex min-h-screen bg-[#111318] text-white font-sans overflow-hidden relative">
            {/* Demo Mode Toggle Badge */}
            <div className="absolute top-4 right-4 z-50">
                <div className="px-3 py-1.5 rounded-full flex items-center gap-2 text-xs bg-[#191c21] border border-[#2D3139]">
                    <span className={`w-2 h-2 rounded-full ${isDemoMode ? "bg-[#aff82a] animate-pulse" : "bg-gray-500"}`}></span>
                    <span className="text-[#8c947b] uppercase font-bold text-[10px]">Demo Mode: {isDemoMode ? "ON" : "OFF"}</span>
                    <button
                        type="button"
                        onClick={toggleDemoMode}
                        className="px-2 py-0.5 bg-[#5b644d] text-white text-[10px] font-bold rounded hover:bg-[#6c765c] transition-all cursor-pointer uppercase"
                    >
                        Toggle
                    </button>
                </div>
            </div>

            {/* Left Side: Product Showcase / Graphics */}
            <div className="hidden lg:flex lg:w-[55%] relative flex-col justify-between p-12 overflow-hidden border-r border-[#2D3139] bg-[#0F1115]">
                <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-[#4361EE]/10 rounded-full blur-[120px] pointer-events-none" />
                <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-[#aff82a]/10 rounded-full blur-[120px] pointer-events-none" />

                <div className="flex items-center gap-2 z-10">
                    <span className="material-symbols-outlined text-white font-bold text-[24px]">token</span>
                    <h1 className="text-[16px] font-bold tracking-widest text-white uppercase">Spacer</h1>
                </div>

                <div className="relative z-10 my-auto max-w-[480px]">
                    <h2 className="text-4xl font-bold leading-tight mb-4 text-white">
                        One workspace for <br />
                        <span className="text-[#aff82a]">every team.</span>
                    </h2>
                    <p className="text-[#8c947b] text-base mb-8">
                        HR, Design, Development, and Marketing — bring all company operations into one unified platform.
                    </p>

                    <div className="bg-[#191c21] border border-[#2D3139] rounded-2xl p-6 shadow-2xl space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-[#8c947b]">Spacer Workspace</span>
                            <span className="bg-[#aff82a]/10 text-[#aff82a] border border-[#aff82a]/30 text-[10px] font-bold px-2 py-0.5 rounded">
                                Live
                            </span>
                        </div>
                        <div className="space-y-3">
                            <div className="flex items-center gap-3 bg-[#1C1F26] p-2.5 rounded-lg border border-[#2D3139]">
                                <span className="material-symbols-outlined text-[#aff82a] text-[18px]">code</span>
                                <span className="text-xs text-white font-medium">Development Space</span>
                            </div>
                            <div className="flex items-center gap-3 bg-[#1C1F26] p-2.5 rounded-lg border border-[#2D3139]">
                                <span className="material-symbols-outlined text-pink-400 text-[18px]">campaign</span>
                                <span className="text-xs text-white font-medium">Marketing Campaign</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="z-10 border-l-2 border-[#aff82a] pl-4">
                    <p className="text-sm text-[#8c947b] italic">
                        "Set up your organization in minutes and invite team leads seamlessly."
                    </p>
                </div>
            </div>

            {/* Right Side: Sign Up Form */}
            <div className="w-full lg:w-[45%] flex flex-col justify-center px-8 sm:px-16 lg:px-20 bg-[#181a20] relative z-10 overflow-y-auto py-12">
                <div className="w-full max-w-[400px] mx-auto">
                    <div className="w-10 h-10 mb-6 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[#aff82a] text-[32px]">token</span>
                    </div>

                    <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">Create Account</h2>
                    <p className="text-[#8c947b] text-sm mb-8 leading-relaxed">
                        Join your team and start collaborating on Spacer.
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {errorMsg && (
                            <div className="p-3 bg-red-500/10 border border-red-500/40 text-red-400 text-xs rounded-xl">
                                {errorMsg}
                            </div>
                        )}

                        {/* Full Name */}
                        <div>
                            <input
                                type="text"
                                id="fullname"
                                placeholder="Full Name"
                                className="w-full bg-[#111318] border border-[#2D3139] focus:border-[#aff82a] rounded-xl px-4 py-3.5 text-white text-sm placeholder-[#8c947b] focus:outline-none transition-colors"
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                required
                            />
                        </div>

                        {/* Email Address */}
                        <div>
                            <input
                                type="email"
                                id="email"
                                placeholder="Email address"
                                className="w-full bg-[#111318] border border-[#2D3139] focus:border-[#aff82a] rounded-xl px-4 py-3.5 text-white text-sm placeholder-[#8c947b] focus:outline-none transition-colors"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        {/* Password */}
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                id="password"
                                placeholder="Password"
                                className="w-full bg-[#111318] border border-[#2D3139] focus:border-[#aff82a] rounded-xl px-4 py-3.5 text-white text-sm placeholder-[#8c947b] focus:outline-none transition-colors"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 top-3.5 text-[#8c947b] hover:text-white transition-colors"
                            >
                                <span className="material-symbols-outlined text-[20px]">
                                    {showPassword ? "visibility_off" : "visibility"}
                                </span>
                            </button>
                        </div>

                        {/* Terms Checkbox */}
                        <div className="flex items-start gap-3 pt-2">
                            <input id="terms" name="terms" required type="checkbox" className="mt-0.5 rounded border-[#2D3139] bg-[#111318] text-[#aff82a] focus:ring-[#aff82a]" />
                            <label htmlFor="terms" className="text-[#8c947b] text-xs leading-normal">
                                I agree to the <a href="#" className="text-[#aff82a] hover:underline">Terms &amp; Conditions</a> and Privacy Policy
                            </label>
                        </div>

                        {/* Sign Up Button */}
                        <button
                            type="submit"
                            disabled={status === "submitting"}
                            className="w-full bg-[#5b644d] hover:bg-[#6c765c] text-white font-medium text-sm py-3.5 rounded-xl border border-[#5b644d] transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
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

                        <div className="text-center mt-6">
                            <p className="text-[#8c947b] text-sm">
                                Already have an account? <Link to="/login" className="text-[#aff82a] hover:underline font-medium">Sign In</Link>
                            </p>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}

export default Signup