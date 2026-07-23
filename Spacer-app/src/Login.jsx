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
            }
            navigate("/")
        }
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

            {/* Demo Mode Toggle (hidden in normal view, absolute positioned) */}
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
                        <span className="material-symbols-outlined text-white font-bold text-[24px]">token</span>
                        <h1 className="text-[16px] font-bold tracking-widest text-white uppercase">Spacer</h1>
                    </div>
                    <p className="text-white text-[20px] leading-relaxed max-w-md">
                        One workspace for every team. HR, Design, Dev and Marketing—each in their own space, all in one place
                    </p>
                </div>

                {/* Decorative Widget */}
                <div className="relative z-10 w-full max-w-[420px] bg-[#1C1F26]/80 backdrop-blur-xl border border-[#2D3139] rounded-2xl p-6 shadow-2xl mt-4">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-white text-[20px]">star</span>
                            <span className="text-white font-bold text-[16px]">To-do</span>
                            <span className="text-[#8c947b] text-[14px]">2</span>
                        </div>
                        <div className="flex items-center gap-2 text-[#8c947b]">
                            <span className="material-symbols-outlined text-[18px]">more_horiz</span>
                            <span className="material-symbols-outlined text-[18px]">add</span>
                        </div>
                    </div>

                    {/* Task Card 1 */}
                    <div className="border-b border-[#2D3139] pb-6 mb-6">
                        <div className="flex gap-2 mb-4">
                            <span className="bg-black text-white text-[11px] font-semibold px-2.5 py-1 rounded-md flex items-center gap-1">
                                <span className="material-symbols-outlined text-[12px]">edit</span> To do
                            </span>
                            <span className="bg-black text-white text-[11px] font-semibold px-2.5 py-1 rounded-md flex items-center gap-1">
                                <span className="material-symbols-outlined text-red-500 text-[12px]">flag</span> High Priority
                            </span>
                            <span className="bg-black text-white text-[11px] font-semibold px-2.5 py-1 rounded-md flex items-center gap-1">
                                <span className="material-symbols-outlined text-blue-500 text-[12px]">web</span> Website
                            </span>
                        </div>
                        <h3 className="text-white text-[15px] font-medium mb-1">Review Website Design 2.0</h3>
                        <div className="flex items-center gap-2 text-[#8c947b] text-[13px] mb-4">
                            <span className="material-symbols-outlined text-[16px]">subdirectory_arrow_right</span>
                            <span>C - level review phase</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex -space-x-2">
                                <img src="https://i.pravatar.cc/150?img=11" alt="avatar" className="w-7 h-7 rounded-full border-2 border-[#1C1F26]" />
                                <img src="https://i.pravatar.cc/150?img=12" alt="avatar" className="w-7 h-7 rounded-full border-2 border-[#1C1F26]" />
                                <div className="w-7 h-7 rounded-full border-2 border-[#1C1F26] bg-[#aff82a] flex items-center justify-center text-black text-[10px] font-bold">TJ</div>
                            </div>
                            <div className="flex items-center gap-4 text-[#8c947b] text-[13px]">
                                <div className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">chat_bubble</span> 5</div>
                                <div className="flex items-center gap-1 text-[#F25C05]"><span className="material-symbols-outlined text-[16px]">calendar_today</span> Tomorrow</div>
                                <div className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">radio_button_unchecked</span> 20%</div>
                            </div>
                        </div>
                    </div>

                    {/* Task Card 2 */}
                    <div className="border-b border-[#2D3139] pb-6 mb-6">
                        <div className="flex gap-2 mb-4">
                            <span className="bg-black text-white text-[11px] font-semibold px-2.5 py-1 rounded-md flex items-center gap-1">
                                <span className="material-symbols-outlined text-[12px]">edit</span> To do
                            </span>
                            <span className="bg-black text-white text-[11px] font-semibold px-2.5 py-1 rounded-md flex items-center gap-1">
                                <span className="material-symbols-outlined text-blue-400 text-[12px]">flag</span> Normal
                            </span>
                            <span className="bg-black text-white text-[11px] font-semibold px-2.5 py-1 rounded-md flex items-center gap-1">
                                <span className="material-symbols-outlined text-pink-500 text-[12px]">dashboard</span> Dashboard
                            </span>
                        </div>
                        <h3 className="text-white text-[15px] font-medium mb-1">Review React Components</h3>
                        <div className="flex items-center gap-2 text-[#8c947b] text-[13px] mb-4">
                            <span className="material-symbols-outlined text-[16px]">subdirectory_arrow_right</span>
                            <span>New react components code review</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex -space-x-2">
                                <div className="w-7 h-7 rounded-full border-2 border-[#1C1F26] bg-[#A1C9F1] flex items-center justify-center text-black text-[10px] font-bold">MA</div>
                                <div className="w-7 h-7 rounded-full border-2 border-[#1C1F26] bg-[#aff82a] flex items-center justify-center text-black text-[10px] font-bold">TJ</div>
                            </div>
                            <div className="flex items-center gap-4 text-[#8c947b] text-[13px]">
                                <div className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">chat_bubble</span> 5</div>
                                <div className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">calendar_today</span> 25 July</div>
                                <div className="flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">radio_button_unchecked</span> 0%</div>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 text-white font-semibold cursor-pointer">
                        <span className="material-symbols-outlined text-[#8c947b]">add</span> Add Task
                    </div>
                </div>
            </div>

            {/* Right Side: Sign In Form */}
            <div className="w-full lg:w-[45%] flex flex-col justify-center px-8 sm:px-16 lg:px-24 bg-[#181a20] relative z-10">
                <div className="w-full max-w-[420px] mx-auto">
                    {/* Abstract colorful icon */}
                    <div className="w-10 h-10 mb-6 flex items-center justify-center">
                        <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M20 5C11.716 5 5 11.716 5 20C5 28.284 11.716 35 20 35C28.284 35 35 28.284 35 20C35 11.716 28.284 5 20 5ZM26.5 15C27.88 15 29 16.12 29 17.5C29 18.88 27.88 20 26.5 20C25.12 20 24 18.88 24 17.5C24 16.12 25.12 15 26.5 15ZM13.5 15C14.88 15 16 16.12 16 17.5C16 18.88 14.88 20 13.5 20C12.12 20 11 18.88 11 17.5C11 16.12 12.12 15 13.5 15ZM20 30C15.58 30 11.83 27.14 10.23 23H29.77C28.17 27.14 24.42 30 20 30Z" fill="url(#paint0_linear)" />
                            <defs>
                                <linearGradient id="paint0_linear" x1="5" y1="5" x2="35" y2="35" gradientUnits="userSpaceOnUse">
                                    <stop stopColor="#4361EE" />
                                    <stop offset="0.5" stopColor="#F72585" />
                                    <stop offset="1" stopColor="#aff82a" />
                                </linearGradient>
                            </defs>
                        </svg>
                    </div>

                    <h2 className="text-[36px] font-bold text-white mb-2 tracking-tight">Welcome Back</h2>
                    <p className="text-[#8c947b] text-[15px] mb-10 leading-relaxed">
                        Welcome back! Let's collaborate with our team and unleash our potential!
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Email Input */}
                        <div className="relative">
                            <input
                                type="email"
                                id="email"
                                placeholder="Email address"
                                className={`w-full bg-transparent border ${isEmailError ? 'border-red-500 focus:border-red-500' : 'border-[#2D3139] focus:border-[#424934]'} rounded-xl px-4 py-3.5 text-white text-[14px] placeholder-[#8c947b] focus:outline-none transition-colors`}
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
                                className={`w-full bg-transparent border ${isPasswordError ? 'border-red-500 focus:border-red-500' : 'border-[#2D3139] focus:border-[#424934]'} rounded-xl px-4 py-3.5 text-white text-[14px] placeholder-[#8c947b] focus:outline-none transition-colors`}
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
                                    <span className="material-symbols-outlined text-[14px]">error</span> Password is incorrect try again
                                </p>
                            )}
                        </div>

                        {/* Forgot Password */}
                        <div className="flex justify-end mt-2 mb-6">
                            <a href="#" className="text-[#aff82a] text-[13px] hover:underline">Forgot Password</a>
                        </div>

                        {/* Sign In Button */}
                        <button
                            type="submit"
                            className="w-full bg-[#1C1F26] hover:bg-[#2D3139] text-[#8c947b] hover:text-white font-medium text-[15px] py-3.5 rounded-xl border border-[#2D3139] transition-all"
                        >
                            Sign in
                        </button>

                        <div className="flex items-center gap-4 my-6">
                            <div className="h-px bg-[#2D3139] flex-1"></div>
                            <span className="text-[#8c947b] text-[13px]">or</span>
                            <div className="h-px bg-[#2D3139] flex-1"></div>
                        </div>

                        {/* Social Login */}
                        <button type="button" className="w-full bg-[#181a20] hover:bg-[#1C1F26] text-white font-medium text-[14px] py-3 rounded-xl flex items-center justify-center gap-3 border border-[#2D3139] transition-all mb-3">
                            <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="Google" className="w-5 h-5" />
                            Sign in with Google
                        </button>

                        <button type="button" className="w-full bg-[#181a20] hover:bg-[#1C1F26] text-white font-medium text-[14px] py-3 rounded-xl flex items-center justify-center gap-3 border border-[#2D3139] transition-all">
                            <span className="material-symbols-outlined text-[20px]">apple</span>
                            Sign in with Apple
                        </button>

                        {/* Create Account Link */}
                        <div className="text-center mt-8">
                            <p className="text-[#8c947b] text-[14px]">
                                Don't have an account? <Link to="/signup" className="text-[#aff82a] hover:underline">Create Account</Link>
                            </p>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    )
}

export default Login