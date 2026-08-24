import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { supabase } from "./supabase"

function Login() {
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [errorMsg, setErrorMsg] = useState("")
    const [isGoogleLoading, setIsGoogleLoading] = useState(false)
    const navigate = useNavigate()

    const [isDemoMode, setIsDemoMode] = useState(localStorage.getItem("use_mock_supabase") === "true")
    const isFormFilled = email.trim() !== "" && password.trim() !== ""
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

    const handleSubmit = async (e) => {
        e.preventDefault()
        setErrorMsg("")

        if (isDemoMode && email === "test@example.com" && password === "password") {
            localStorage.setItem("userId", "demo-user")
            localStorage.setItem("userEmail", "test@example.com")
            navigate("/")
            return
        }

        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        })

        if (error) {
            console.error(error)
            setErrorMsg(error.message)
        } else {
            console.log("Logged in user:", data)
            if (data && data.user) {
                localStorage.setItem("userId", data.user.id)
                localStorage.setItem("userEmail", data.user.email)
                localStorage.setItem("autoOpenNotificationsAfterLogin", "true")
                try {
                    await supabase.from('activity_log').insert({
                        entity_type: 'user',
                        entity_id: data.user.id,
                        actor_id: data.user.id,
                        action: 'login',
                        new_state: { email: data.user.email, method: 'password' }
                    })
                } catch (logError) {
                    console.error('Error logging user login:', logError)
                }
            }
            navigate("/")
        }
    }

    const handleGoogleSignIn = async () => {
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

    const isEmailError = errorMsg.toLowerCase().includes("email") || errorMsg.toLowerCase().includes("user not found")
    const isPasswordError = errorMsg.toLowerCase().includes("password") || errorMsg.toLowerCase().includes("invalid login credentials")

    return (
        <div className="min-h-screen bg-[#181a20] flex overflow-hidden">
            {/* Top Error Toast */}
            {errorMsg && (
                <div className="fixed top-8 right-8 z-50 flex items-center gap-4 bg-[#8C2A32]/90 backdrop-blur-md border border-[#C53F4A] rounded-xl p-4 shadow-2xl max-w-sm animate-in fade-in slide-in-from-top-10">
                    <div className="w-8 h-8 rounded border border-white/20 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-white text-[18px]">error</span>
                    </div>
                    <p className="text-white text-[14px] leading-tight">
                        {errorMsg === "Invalid login credentials"
                            ? "Your email doesn't exist in our system, try creating an account or check your password."
                            : errorMsg}
                    </p>
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
                <div className="absolute bottom-[20%] left-[-5%] w-[300px] h-[300px] bg-[#1A4A3A] rounded-full blur-[100px] opacity-40 mix-blend-screen pointer-events-none" />

                {/* Branding */}
                <div className="relative z-10 mb-12">
                    <div className="flex items-center gap-2 mb-8">
                        <span className="material-symbols-outlined text-[#aff82a] font-bold text-[24px]">token</span>
                        <h1 className="text-[16px] font-bold tracking-widest text-white uppercase">Spacer</h1>
                    </div>
                    <p className="text-white text-[20px] leading-relaxed max-w-md">
                        One workspace for every team. HR, Design, Dev and Marketing—each in their own space, all in one place.
                    </p>
                </div>

                {/* Decorative Showcase */}
                <div className="relative z-10 w-full max-w-[420px] bg-[#1C1F26]/80 backdrop-blur-xl border border-[#2D3139] rounded-2xl p-6 shadow-2xl mt-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-bold text-xs">
                                WR
                            </div>
                            <div>
                                <h4 className="text-sm font-semibold text-white">Website Redesign</h4>
                                <p className="text-xs text-[#8c947b]">Development • Active</p>
                            </div>
                        </div>
                        <span className="bg-[#aff82a]/10 text-[#aff82a] border border-[#aff82a]/30 text-[11px] font-bold px-2.5 py-1 rounded-full">
                            On Track
                        </span>
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs text-[#8c947b]">
                            <span>Sprint Progress</span>
                            <span className="text-white font-medium">78%</span>
                        </div>
                        <div className="w-full bg-[#252a33] h-2 rounded-full overflow-hidden">
                            <div className="bg-[#aff82a] h-full rounded-full" style={{ width: "78%" }}></div>
                        </div>
                    </div>
                </div>

                <div className="relative z-10 mt-auto pt-8 border-l-2 border-[#aff82a] pl-4">
                    <p className="text-sm text-[#8c947b] italic">
                        "Spacer helped us organize all our department workspaces into a single unified dashboard."
                    </p>
                </div>
            </div>

            {/* Right Side: Sign In Form */}
            <div className="w-full lg:w-[45%] flex flex-col justify-center px-8 sm:px-16 lg:px-24 bg-[#181a20] relative z-10">
                <div className="w-full max-w-[420px] mx-auto">
                    <div className="w-10 h-10 mb-6 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[#aff82a] text-[36px]">token</span>
                    </div>

                    <h2 className="text-[36px] font-bold text-white mb-2 tracking-tight">Welcome Back</h2>
                    <p className="text-[#8c947b] text-[15px] mb-8 leading-relaxed">
                        Welcome back! Sign in to access your Spacer workspace.
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-5">
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
                            {isEmailError && (
                                <p className="text-red-500 text-[12px] mt-2 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[14px]">error</span> Your email doesn't exist
                                </p>
                            )}
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
                            {isPasswordError && (
                                <p className="text-red-500 text-[12px] mt-2 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[14px]">error</span> Password is incorrect, try again
                                </p>
                            )}
                        </div>

                        {/* Forgot Password */}
                        <div className="flex justify-end mt-2 mb-2">
                            <a href="#" className="text-[#aff82a] text-[13px] hover:underline">Forgot Password?</a>
                        </div>

                        {/* Sign In Button */}
                        <button
                            type="submit"
                            className={`w-full font-medium text-sm py-3.5 rounded-xl border transition-all mt-2 ${
                                isFormFilled
                                    ? 'bg-[#aff82a] text-[#1C1F26] border-[#9de022] shadow-[0_0_12px_rgba(173,248,42,0.35)] hover:bg-[#9de022]'
                                    : 'bg-[#5b644d] hover:bg-[#6c765c] text-white border-[#5b644d]'
                            }`}
                        >
                            Sign in
                        </button>

                        <div className="flex items-center gap-4 my-6">
                            <div className="h-px bg-[#2D3139] flex-1"></div>
                            <span className="text-[#8c947b] text-[13px]">or</span>
                            <div className="h-px bg-[#2D3139] flex-1"></div>
                        </div>

                        <button
                            type="button"
                            onClick={handleGoogleSignIn}
                            disabled={isGoogleLoading || !googleAuthReady}
                            className="w-full flex items-center justify-center gap-3 border border-[#2D3139] bg-[#111318] hover:bg-[#1C1F26] text-white font-medium text-sm py-3.5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:border-[#4B5563]"
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                            </svg>
                            {isGoogleLoading ? 'Connecting to Google...' : googleAuthReady ? 'Continue with Google' : 'Google sign-in pending setup'}
                        </button>

                        {!googleAuthReady && (
                            <p className="text-center text-xs text-[#8c947b] mt-3">
                                Google sign-in is currently unavailable until Supabase Google auth is configured.
                            </p>
                        )}

                        {/* Create Account Link */}
                        <div className="text-center mt-6">
                            <p className="text-[#8c947b] text-[14px]">
                                Don't have an account? <Link to="/signup" className="text-[#aff82a] font-semibold hover:underline">Create Account</Link>
                            </p>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}

export default Login