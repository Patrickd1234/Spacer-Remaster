import { useState, useEffect } from "react"
import { Link, useNavigate } from "react-router-dom"
import { supabase } from "./supabase"

function Signup() {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false)
    const [selectedDept, setSelectedDept] = useState("Choose your team...")
    const [searchTerm, setSearchTerm] = useState("")
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

    const departments = ["Engineering", "Marketing", "HR", "Design", "Operations", "Security"]
    const filteredDepts = departments.filter((dept) =>
        dept.toLowerCase().includes(searchTerm.toLowerCase())
    )

    useEffect(() => {
        const closeDropdown = () => {
            setIsDropdownOpen(false)
        }
        window.addEventListener("click", closeDropdown)
        return () => window.removeEventListener("click", closeDropdown)
    }, [])

    const toggleDropdown = (e) => {
        e.stopPropagation()
        setIsDropdownOpen(!isDemoMode)
    }

    const selectDepartment = (dept) => {
        setSelectedDept(dept)
        setIsDropdownOpen(false)
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
            if (err.code === "over_email_send_rate_limit" || (err.message && err.message.toLowerCase().includes("rate limit"))) {
                setErrorMsg(
                    <span>
                        Email rate limit exceeded. This is a limit on the remote Supabase email provider.{" "}
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
                setErrorMsg(err.message || "Something went wrong during signup.")
            }
            setStatus("idle")
        }
    }

    return (
        <div className="bg-background text-on-background min-h-screen flex items-center justify-center p-md relative overflow-hidden">
            {/* Demo Mode Toggle Badge */}
            <div className="absolute top-md right-md z-50">
                <div className="glass-panel px-md py-sm rounded-full flex items-center gap-sm text-body-sm bg-surface-container-low/60 border border-outline-variant/30 backdrop-blur-md">
                    <span className={`w-2.5 h-2.5 rounded-full ${isDemoMode ? "bg-primary-fixed animate-pulse shadow-[0_0_8px_#aff82a]" : "bg-outline"}`}></span>
                    <span className="font-label-md text-on-surface uppercase tracking-wider text-[10px]">Demo Mode: {isDemoMode ? "ON" : "OFF"}</span>
                    <button 
                        type="button" 
                        onClick={toggleDemoMode}
                        className="px-sm py-[2px] bg-primary-fixed text-on-primary-fixed text-[10px] font-bold rounded hover:brightness-110 transition-all cursor-pointer uppercase tracking-wider"
                    >
                        Toggle
                    </button>
                </div>
            </div>

            {/* Background Atmospheric Effect */}
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary-fixed/5 blur-[120px] rounded-full"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary-container/5 blur-[120px] rounded-full"></div>
            </div>

            {/* Sign Up Container */}
            <main className="relative z-10 w-full max-w-[480px]">
                {/* Brand Header */}
                <div className="text-center mb-xl">
                    <h1 className="font-headline-xl text-headline-xl text-primary-fixed tracking-tight">Spacers</h1>
                    <p className="font-body-md text-on-surface-variant mt-xs">Mission Control Onboarding</p>
                    {isDemoMode && (
                        <div className="mt-sm inline-flex items-center gap-xs px-sm py-[2px] bg-primary-fixed/15 border border-primary-fixed/30 rounded text-primary-fixed text-[11px] font-bold uppercase tracking-wider">
                            <span className="material-symbols-outlined text-[14px]">info</span> Running in Browser Demo Mode
                        </div>
                    )}
                </div>

                {/* Form Card */}
                <div className="glass-panel rounded-xl p-lg shadow-2xl">
                    <form className="space-y-lg" id="signupForm" onSubmit={handleSubmit}>
                        {/* Error Message */}
                        {errorMsg && (
                            <div className="p-sm bg-error-container/20 border border-error text-error text-body-sm rounded-lg">
                                {errorMsg}
                            </div>
                        )}

                        {/* Full Name Field */}
                        <div className="space-y-xs">
                            <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider" htmlFor="full_name">Full Name</label>
                            <div className="relative group transition-all duration-200 focus-within:scale-[1.01]">
                                <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary-fixed transition-colors">person</span>
                                <input className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-md pl-11 pr-md text-on-surface focus:outline-none focus:ring-1 focus:ring-primary-fixed focus:border-primary-fixed transition-all placeholder:text-outline" id="full_name" name="full_name" placeholder="John Doe" type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                            </div>
                        </div>

                        {/* Email Field */}
                        <div className="space-y-xs">
                            <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider" htmlFor="email">Email Address</label>
                            <div className="relative group transition-all duration-200 focus-within:scale-[1.01]">
                                <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary-fixed transition-colors">mail</span>
                                <input className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-md pl-11 pr-md text-on-surface focus:outline-none focus:ring-1 focus:ring-primary-fixed focus:border-primary-fixed transition-all placeholder:text-outline" id="email" name="email" placeholder="john.doe@circlecorp.io" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                            </div>
                        </div>

                        {/* Password Field */}
                        <div className="space-y-xs">
                            <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider" htmlFor="password">Password</label>
                            <div className="relative group transition-all duration-200 focus-within:scale-[1.01]">
                                <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary-fixed transition-colors">lock</span>
                                <input className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-md pl-11 pr-md text-on-surface focus:outline-none focus:ring-1 focus:ring-primary-fixed focus:border-primary-fixed transition-all placeholder:text-outline" id="password" name="password" placeholder="••••••••" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                            </div>
                        </div>

                        {/* Department Selector (Custom Dropdown) */}

                        {/* Action Button */}
                        <button
                            className={`w-full font-bold py-md rounded-lg neon-glow active:scale-[0.98] transition-all flex items-center justify-center gap-sm ${status === "success"
                                ? "bg-green-500 text-white"
                                : "bg-primary-fixed text-on-primary-fixed hover:brightness-110"
                                }`}
                            type="submit"
                            disabled={status === "submitting"}
                        >
                            {status === "idle" && (
                                <>
                                    <span>Sign Up</span>
                                    <span className="material-symbols-outlined">arrow_forward</span>
                                </>
                            )}
                            {status === "submitting" && (
                                <>
                                    <span className="material-symbols-outlined animate-spin">progress_activity</span>
                                    <span>Processing...</span>
                                </>
                            )}
                            {status === "success" && (
                                <>
                                    <span className="material-symbols-outlined">check_circle</span>
                                    <span>Success</span>
                                </>
                            )}
                        </button>

                        {/* Footer Links */}
                        <div className="pt-md text-center">
                            <p className="font-body-sm text-on-surface-variant">
                                Already have an account?{" "}
                                <Link className="text-primary-fixed font-semibold hover:underline" to="/login">Log in</Link>
                            </p>
                        </div>
                    </form>
                </div>

                {/* Branding Decoration */}
                <div className="mt-lg flex items-center justify-center gap-lg opacity-40 grayscale hover:grayscale-0 transition-all duration-700">
                    <div className="flex items-center gap-xs font-label-md text-label-md text-on-surface-variant">
                        <span className="material-symbols-outlined text-md">shield</span> Secure
                    </div>
                    <div className="w-1 h-1 bg-outline rounded-full"></div>
                    <div className="flex items-center gap-xs font-label-md text-label-md text-on-surface-variant">
                        <span className="material-symbols-outlined text-md">bolt</span> Fast
                    </div>
                    <div className="w-1 h-1 bg-outline rounded-full"></div>
                    <div className="flex items-center gap-xs font-label-md text-label-md text-on-surface-variant">
                        <span className="material-symbols-outlined text-md">deployed_code</span> Modular
                    </div>
                </div>
            </main>
        </div>
    )
}

export default Signup