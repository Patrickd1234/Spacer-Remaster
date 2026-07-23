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
                            className="underline text-[#aff82a] hover:brightness-110 font-bold ml-1 cursor-pointer"
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
        <div className="min-h-screen bg-[#181a20] flex overflow-hidden">
            {/* Top Error Toast */}
            {errorMsg && (
                <div className="fixed top-8 right-8 z-50 flex items-center gap-4 bg-[#8C2A32]/90 backdrop-blur-md border border-[#C53F4A] rounded-xl p-4 shadow-2xl max-w-sm animate-in fade-in slide-in-from-top-10">
                    <div className="w-8 h-8 rounded border border-white/20 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-white text-[18px]">error</span>
                    </div>
                    <div className="text-white text-[14px] leading-tight">
                        {errorMsg}
                    </div>
                </div>
            )}

            {/* Demo Mode Toggle */}
            <div className="absolute top-4 left-4 z-50 opacity-10 hover:opacity-100 transition-opacity">
                <button onClick={toggleDemoMode} className="text-xs bg-[#2D3139] text-white px-2 py-1 rounded">
                    Demo: {isDemoMode ? "ON" : "OFF"}
                </button>
            </div>

            {/* Left Side: Visual/Brand (Hidden on mobile) */}
            <div className="hidden lg:flex w-[55%] relative flex-col px-16 py-12 border-r border-[#2D3139]/30">
                {/* Abstract Glowing Backgrounds */}
                <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#2A3A4A] rounded-full blur-[120px] opacity-40 mix-blend-screen pointer-events-none" />
                <div className="absolute bottom-[-10%] right-[10%] w-[400px] h-[400px] bg-[#3B2A4A] rounded-full blur-[120px] opacity-40 mix-blend-screen pointer-events-none" />

                {/* Branding */}
                <div className="relative z-10 mb-12">
                    <div className="flex items-center gap-2 mb-8">
                        <span className="material-symbols-outlined text-[#aff82a] font-bold text-[24px]">token</span>
                        <h1 className="text-[16px] font-bold tracking-widest text-white uppercase">Spacer</h1>
                    </div>
                    <h2 className="text-4xl font-bold leading-tight mb-4 text-white">
                        One workspace for <br />
                        <span className="text-[#aff82a]">every team.</span>
                    </h2>
                    <p className="text-[#8c947b] text-base mb-8 max-w-md">
                        HR, Design, Development, and Marketing — bring all company operations into one unified platform.
                    </p>
                </div>

                <div className="relative z-10 mt-auto border-l-2 border-[#aff82a] pl-4">
                    <p className="text-sm text-[#8c947b] italic">
                        "Set up your organization in minutes and invite team leads seamlessly."
                    </p>
                </div>
            </div>

            {/* Right Side: Sign Up Form */}
            <div className="w-full lg:w-[45%] flex flex-col justify-center px-8 sm:px-16 lg:px-24 bg-[#181a20] relative z-10 overflow-y-auto py-12">
                <div className="w-full max-w-[420px] mx-auto">
                    <div className="w-10 h-10 mb-6 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[#aff82a] text-[36px]">token</span>
                    </div>

                    <h2 className="text-[36px] font-bold text-white mb-2 tracking-tight">Create Account</h2>
                    <p className="text-[#8c947b] text-[15px] mb-8 leading-relaxed">
                        Join your team and start collaborating on Spacer.
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Full Name Input */}
                        <div className="relative">
                            <input 
                                type="text" 
                                id="fullname"
                                placeholder="Full Name" 
                                className="w-full bg-[#111318] border border-[#2D3139] focus:border-[#aff82a] rounded-xl px-4 py-3.5 text-white text-[14px] placeholder-[#8c947b] focus:outline-none transition-colors"
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
                                className={`w-full bg-[#111318] border ${isEmailError ? 'border-red-500 focus:border-red-500' : 'border-[#2D3139] focus:border-[#aff82a]'} rounded-xl px-4 py-3.5 text-white text-[14px] placeholder-[#8c947b] focus:outline-none transition-colors`}
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
                                className={`w-full bg-[#111318] border ${isPasswordError ? 'border-red-500 focus:border-red-500' : 'border-[#2D3139] focus:border-[#aff82a]'} rounded-xl px-4 py-3.5 text-white text-[14px] placeholder-[#8c947b] focus:outline-none transition-colors`}
                                value={password} 
                                onChange={(e) => setPassword(e.target.value)} 
                                required 
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-4 top-[14px] text-[#8c947b] hover:text-white transition-colors"
                            >
                                <span className="material-symbols-outlined text-[20px]">
                                    {showPassword ? "visibility_off" : "visibility"}
                                </span>
                            </button>
                        </div>

                        {/* Terms Checkbox */}
                        <div className="flex items-start gap-3 pt-2">
                            <input id="terms" name="terms" required type="checkbox" className="mt-0.5 rounded border-[#2D3139] bg-[#111318] text-[#aff82a] focus:ring-[#aff82a]" />
                            <label htmlFor="terms" className="text-[#8c947b] text-[13px] leading-normal">
                                I agree to the <a href="#" className="text-[#aff82a] hover:underline">Terms &amp; Conditions</a> and Privacy Policy
                            </label>
                        </div>

                        {/* Sign Up Button */}
                        <button 
                            type="submit" 
                            disabled={status === "submitting"}
                            className="w-full bg-[#aff82a] hover:bg-[#9de022] text-[#1C1F26] font-bold text-[15px] py-3.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
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
                            <p className="text-[#8c947b] text-[14px]">
                                Already have an account? <Link to="/login" className="text-[#aff82a] font-semibold hover:underline">Sign In</Link>
                            </p>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}

export default Signup