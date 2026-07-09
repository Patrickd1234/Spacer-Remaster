import { useEffect, useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { supabase } from "./supabase"

function Login() {
    const [coords, setCoords] = useState({ x: 0, y: 0 })
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

    useEffect(() => {
        const handleMouseMove = (e) => {
            const x = (e.clientX / window.innerWidth - 0.5) * 40
            const y = (e.clientY / window.innerHeight - 0.5) * 40
            setCoords({ x, y })
        }
        window.addEventListener("mousemove", handleMouseMove)
        return () => window.removeEventListener("mousemove", handleMouseMove)
    }, [])

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
            // Persistently store the user ID and email in localStorage
            if (data && data.user) {
                localStorage.setItem("userId", data.user.id)
                localStorage.setItem("userEmail", data.user.email)
            }
            // Redirect to home dashboard
            navigate("/")
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

            {/* Background Atmospheric Elements */}
            <div className="fixed inset-0 pointer-events-none z-0">
                <div 
                    className="absolute top-[-10%] right-[-5%] w-[500px] h-[500px] bg-primary-fixed/5 rounded-full blur-[120px] transition-transform duration-200 ease-out" 
                    style={{ transform: `translate(${coords.x}px, ${coords.y}px)` }}
                />
                <div className="absolute bottom-[-10%] left-[-5%] w-[400px] h-[400px] bg-secondary-container/10 rounded-full blur-[100px]" />
            </div>

            {/* LOGIN PANEL */}
            <main className="relative z-10 w-full max-w-[1100px] grid md:grid-cols-2 glass-panel overflow-hidden rounded-xl shadow-2xl">
                {/* Left Side: Visual/Brand */}
                <div className="hidden md:flex flex-col justify-between p-xl bg-surface-container-low border-r border-outline-variant relative overflow-hidden">
                    {/* Branding */}
                    <div className="flex items-center gap-sm">
                        <div className="w-10 h-10 bg-primary-fixed rounded flex items-center justify-center shadow-[0_0_15px_rgba(182,255,51,0.4)]">
                            <span className="material-symbols-outlined text-on-primary-fixed font-bold">circle</span>
                        </div>
                        <h1 className="font-headline-md text-headline-md font-bold tracking-tight text-primary-fixed">Spacers</h1>
                    </div>
                    {/* Decorative Centerpiece */}
                    <div className="relative py-xl">
                        <div className="space-y-md">
                            <h2 className="font-headline-xl text-headline-xl text-on-surface leading-tight">
                                Command the <br />
                                <span className="text-primary-fixed">Mission Control</span>
                            </h2>
                            <p className="font-body-lg text-body-lg text-on-surface-variant max-w-[340px]">
                                High-performance workspace for elite engineering teams. Secure your entry to the grid.
                            </p>
                        </div>
                        {/* Abstract Data Viz Decoration */}
                        <div className="mt-xl flex gap-xs items-end h-16">
                            <div className="w-1 bg-primary-fixed/20 h-4 rounded-full"></div>
                            <div className="w-1 bg-primary-fixed/40 h-8 rounded-full"></div>
                            <div className="w-1 bg-primary-fixed/60 h-12 rounded-full"></div>
                            <div className="w-1 bg-primary-fixed h-16 rounded-full shadow-[0_0_8px_rgba(182,255,51,0.6)]"></div>
                            <div className="w-1 bg-primary-fixed/80 h-10 rounded-full"></div>
                            <div className="w-1 bg-primary-fixed/40 h-6 rounded-full"></div>
                        </div>
                    </div>
                    {/* Footer Quote */}
                    <div className="border-l-2 border-primary-fixed pl-md">
                        <p className="font-label-md text-label-md text-on-surface italic opacity-80">
                            "Precision is not an option; it's the standard."
                        </p>
                    </div>
                    {/* Background Image Integration */}
                    <div className="absolute inset-0 -z-10 opacity-10">
                        <div className="w-full h-full" data-alt="A dark, sophisticated architectural shot of a high-tech server room or data center with linear neon green lights recessed in the ceiling and floor. The perspective is symmetrical, leading the eye into a deep, vanishing point. The overall aesthetic is cinematic, midnight charcoal, and technically precise." style={{ backgroundImage: "url('https://lh3.googleusercontent.com/aida-public/AB6AXuCS5Ph6jhiO80EQWsIKNc7e8gmdkEXn5gRywJnQItEA1H1LKPKdlaJxodFYLZNL8wPJw01TDWW9tNLas5-mtIttY3DVR5v_BbuMvr9xEhSLf4Cdjz33q2Pbr7vbOa9dygB7Xj6iixNgjej7UkOVfwUms_Y4eUVbJG2cqaEDVDKXFNMTRCouoaN7ysfb0M8eUwNu_gEipvd8vdHAKdcCceEpG8O_usbej8TchhpNByDQHg0EiAFEIIT6KQ')" }}></div>
                    </div>
                </div>
                {/* Right Side: Sign In Form */}
                <div className="flex flex-col justify-center p-xl lg:px-24 bg-surface-container">
                    {/* Mobile Logo */}
                    <div className="md:hidden flex items-center gap-sm mb-xl">
                        <div className="w-8 h-8 bg-primary-fixed rounded flex items-center justify-center">
                            <span className="material-symbols-outlined text-on-primary-fixed text-[20px] font-bold">circle</span>
                        </div>
                        <h1 className="font-headline-md text-headline-md font-bold text-primary-fixed">Spacers</h1>
                    </div>
                    <div className="mb-xl">
                        <h3 className="font-headline-lg text-headline-lg text-on-surface mb-sm flex items-center gap-sm">
                            <span>Sign In</span>
                            {isDemoMode && (
                                <span className="px-sm py-[2px] bg-primary-fixed/15 border border-primary-fixed/30 rounded text-primary-fixed text-[11px] font-bold uppercase tracking-wider">Demo Mode</span>
                            )}
                        </h3>
                        <p className="font-body-md text-body-md text-on-surface-variant">
                            {isDemoMode 
                                ? "Use any email/password to sign in to your local workspace." 
                                : "Enter your credentials to access the terminal."
                            }
                        </p>
                    </div>
                    <form action="#" className="space-y-lg" method="POST" onSubmit={handleSubmit}>
                        {/* Error Message */}
                        {errorMsg && (
                            <div className="p-sm bg-error-container/20 border border-error text-error text-body-sm rounded-lg">
                                {errorMsg}
                            </div>
                        )}

                        {/* Email Field */}
                        <div className="space-y-xs">
                            <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider" htmlFor="email">Email Address</label>
                            <div className="relative group transition-all duration-200 focus-within:scale-[1.01]">
                                <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary-fixed transition-colors">mail</span>
                                <input className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-md pl-12 pr-md text-on-surface font-body-md placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary-fixed focus:ring-1 focus:ring-primary-fixed transition-all neon-glow" id="email" placeholder="name@company.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                            </div>
                        </div>
                        {/* Password Field */}
                        <div className="space-y-xs">
                            <div className="flex justify-between items-center">
                                <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider" htmlFor="password">Password</label>
                            </div>
                            <div className="relative group transition-all duration-200 focus-within:scale-[1.01]">
                                <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary-fixed transition-colors">lock</span>
                                <input className="w-full bg-surface-container-low border border-outline-variant rounded-lg py-md pl-12 pr-md text-on-surface font-body-md placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary-fixed focus:ring-1 focus:ring-primary-fixed transition-all neon-glow" id="password" placeholder="••••••••" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                            </div>
                        </div>
                        {/* Action Button */}
                        <button className="w-full bg-primary-fixed hover:bg-primary-container text-on-primary-fixed font-label-md text-label-md py-md rounded-lg flex items-center justify-center gap-sm transition-all active:scale-[0.98] shadow-[0_4px_20px_rgba(175,248,42,0.15)] hover:shadow-[0_4px_25px_rgba(175,248,42,0.3)]" type="submit">
                            Sign In
                            <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                        </button>
                        {/* Footer Links */}
                        <div className="pt-md text-center">
                            <p className="font-body-sm text-on-surface-variant">
                                Don't have an account?{" "}
                                <Link className="text-primary-fixed font-semibold hover:underline" to="/signup">Sign up</Link>
                            </p>
                        </div>
                    </form>
                </div>
            </main>
        </div>
    )
}

export default Login