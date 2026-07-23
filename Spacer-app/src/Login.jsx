import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { supabase } from "./supabase"

function Login() {
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [errorMsg, setErrorMsg] = useState("")
    const navigate = useNavigate()

    const [isDemoMode, setIsDemoMode] = useState(localStorage.getItem("use_mock_supabase") === "true")
    const isFormFilled = email.trim() !== "" && password.trim() !== ""

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
            }
            navigate("/")
        }
    }

    return (
        <div className="flex min-h-screen bg-[#111318] text-white font-sans overflow-hidden relative">

            {/* Left Side: Product Showcase / Graphics */}
            <div className="hidden lg:flex lg:w-[55%] relative flex-col justify-between p-12 overflow-hidden border-r border-[#2D3139] bg-[#0F1115]">
                {/* Background ambient lighting */}
                <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-[#4361EE]/10 rounded-full blur-[120px] pointer-events-none" />
                <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-[#aff82a]/10 rounded-full blur-[120px] pointer-events-none" />

                {/* Top Logo */}
                <div className="flex items-center gap-2 z-10">
                    <span className="material-symbols-outlined text-white font-bold text-[24px]">token</span>
                    <h1 className="text-[16px] font-bold tracking-widest text-white uppercase">Spacer</h1>
                </div>

                {/* Card Showcase Graphic */}
                <div className="relative z-10 my-auto max-w-[480px]">
                    <p className="text-white text-[20px] leading-relaxed max-w-md mb-8">
                        One workspace for every team. HR, Design, Dev and Marketing—each in their own space, all in one place
                    </p>

                    <div className="bg-[#191c21] border border-[#2D3139] rounded-2xl p-6 shadow-2xl space-y-4">
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
                </div>

                {/* Bottom Quote */}
                <div className="z-10 border-l-2 border-[#aff82a] pl-4">
                    <p className="text-sm text-[#8c947b] italic">
                        "Spacer helped us organize 4 teams into a single unified dashboard."
                    </p>
                </div>
            </div>

            {/* Right Side: Sign In Form */}
            <div className="w-full lg:w-[45%] flex flex-col justify-center px-8 sm:px-16 lg:px-20 bg-[#181a20] relative z-10">
                <div className="w-full max-w-[400px] mx-auto">
                    {/* Spacer Icon */}
                    <div className="w-10 h-10 mb-6 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[#aff82a] text-[32px]">token</span>
                    </div>

                    <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">Welcome Back</h2>
                    <p className="text-[#8c947b] text-sm mb-8 leading-relaxed">
                        Sign in to access your Spacer workspace and start collaborating.
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {errorMsg && (
                            <div className="p-3 bg-red-500/10 border border-red-500/40 text-red-400 text-xs rounded-xl flex items-center gap-2">
                                <span className="material-symbols-outlined text-[16px]">error</span>
                                <span>{errorMsg}</span>
                            </div>
                        )}

                        {/* Email Input */}
                        <div className="relative">
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

                        {/* Password Input */}
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

                        {/* Sign In Button */}
                        <button
                            type="submit"
                            className={`w-full font-medium text-sm py-3.5 rounded-xl border transition-all mt-2 ${
                                isFormFilled
                                    ? 'bg-[#2f4f2f] text-white border-[#3b6b3b] shadow-[0_0_12px_rgba(47,79,47,0.35)] hover:bg-[#355d35]'
                                    : 'bg-[#5b644d] hover:bg-[#6c765c] text-white border-[#5b644d]'
                            }`}
                        >
                            Sign in
                        </button>

                        <div className="flex items-center gap-4 my-6">
                            <div className="h-px bg-[#2D3139] flex-1"></div>
                            <span className="text-[#8c947b] text-xs">or</span>
                            <div className="h-px bg-[#2D3139] flex-1"></div>
                        </div>

                        {/* Create Account Link */}
                        <div className="text-center mt-6">
                            <p className="text-[#8c947b] text-sm">
                                Don't have an account? <Link to="/signup" className="text-[#aff82a] hover:underline font-medium">Create Account</Link>
                            </p>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}

export default Login