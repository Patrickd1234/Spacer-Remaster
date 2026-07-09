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
                navigate("/")
            }, 1500)

        } catch (err) {
            console.error("Error launching organization:", err)
            setErrorMsg(err.message || "Something went wrong launching your organization.")
            setStatus("error")
        }
    }

    return (
        <>
            <main className="h-[calc(100vh-64px)] overflow-y-auto relative flex items-center justify-center min-h-screen bg-background text-on-background">
                {/* Animated Background Decor */}
                <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
                    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary-fixed/5 blur-[120px] rounded-full"></div>
                    <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary-container/5 blur-[120px] rounded-full"></div>
                </div>

                <div className="max-w-4xl mx-auto px-lg py-xl flex flex-col items-center justify-center min-h-full relative z-10 w-full">
                    {/* Header Section */}
                    <div className="text-center mb-xl">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-container/10 border border-primary-container/30 mb-md">
                            <span className="material-symbols-outlined text-primary-fixed text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>rocket_launch</span>
                        </div>
                        <h2 className="font-headline-xl text-headline-xl text-on-surface mb-xs tracking-tight">Launch Your Organization</h2>
                        <p className="font-body-lg text-body-lg text-on-surface-variant max-w-md mx-auto">Set up your workspace and invite your team to get started.</p>
                    </div>
                    
                    {/* Form Container */}
                    <div className="w-full max-w-xl glass-panel p-xl rounded-xl shadow-2xl">
                        <form className="space-y-lg" onSubmit={handleSubmit}>
                            {errorMsg && (
                                <div className="p-md rounded-lg bg-error-container/20 border border-error text-error text-body-sm">
                                    {errorMsg}
                                </div>
                            )}

                            {/* Organization Name */}
                            <div className="space-y-xs">
                                <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider block">Organization Name</label>
                                <div className="relative">
                                    <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant">domain</span>
                                    <input 
                                        className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-12 pr-md py-md text-on-surface placeholder:text-outline focus:border-primary-fixed focus:ring-1 focus:ring-primary-fixed transition-all outline-none font-body-md text-body-md" 
                                        placeholder="Enter your organization's name (e.g. Circle Corp)" 
                                        type="text"
                                        value={orgName}
                                        onChange={(e) => setOrgName(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>

                            {/* Team Name */}
                            <div className="space-y-xs">
                                <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider block">Team Name</label>
                                <div className="relative">
                                    <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant">corporate_fare</span>
                                    <input 
                                        className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-12 pr-md py-md text-on-surface placeholder:text-outline focus:border-primary-fixed focus:ring-1 focus:ring-primary-fixed transition-all outline-none font-body-md text-body-md" 
                                        placeholder="Enter your team's name (e.g. Engineering)" 
                                        type="text"
                                        value={teamName}
                                        onChange={(e) => setTeamName(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>

                            {/* Dept Head Email */}
                            <div className="space-y-xs">
                                <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider block">Department Head Email</label>
                                <div className="relative">
                                    <span className="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant">admin_panel_settings</span>
                                    <input 
                                        className="w-full bg-surface-container-low border border-outline-variant rounded-lg pl-12 pr-md py-md text-on-surface placeholder:text-outline focus:border-primary-fixed focus:ring-1 focus:ring-primary-fixed transition-all outline-none font-body-md text-body-md" 
                                        placeholder="head@company.com" 
                                        type="email"
                                        value={deptHeadEmail}
                                        onChange={(e) => setDeptHeadEmail(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>

                            {/* Team Member Emails */}
                            <div className="space-y-xs">
                                <div className="flex justify-between items-center">
                                    <label className="font-label-md text-label-md text-on-surface-variant uppercase tracking-wider block">Team Member Emails</label>
                                    <span className="font-label-sm text-label-sm text-outline">Optional</span>
                                </div>
                                <div className="relative">
                                    <textarea 
                                        className="w-full bg-surface-container-low border border-outline-variant rounded-lg p-md text-on-surface placeholder:text-outline focus:border-primary-fixed focus:ring-1 focus:ring-primary-fixed transition-all outline-none font-body-md text-body-md resize-none" 
                                        placeholder="Enter emails separated by commas or new lines..." 
                                        rows="4"
                                        value={teamMemberEmails}
                                        onChange={(e) => setTeamMemberEmails(e.target.value)}
                                    />
                                </div>
                                <p className="font-label-sm text-label-sm text-on-surface-variant/60 flex items-center gap-xs">
                                    <span className="material-symbols-outlined text-sm">info</span>
                                    They will receive an automated invitation link.
                                </p>
                            </div>

                            {/* Action Button */}
                            <div className="pt-md">
                                <button 
                                    className={`w-full font-bold py-md rounded-lg flex items-center justify-center gap-sm neon-glow transition-all active:scale-95 group ${
                                        status === "success" 
                                            ? "bg-green-500 text-white" 
                                            : "bg-primary-fixed text-on-primary-fixed hover:brightness-110"
                                    }`} 
                                    type="submit"
                                    disabled={status === "submitting" || status === "success"}
                                >
                                    <span className="font-headline-md text-headline-md">
                                        {status === "submitting" ? "Launching..." : status === "success" ? "Launched!" : "Launch Organization"}
                                    </span>
                                    <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">arrow_forward</span>
                                </button>
                            </div>
                        </form>
                    </div>

                    {/* Footer Note */}
                    <div className="mt-lg flex items-center gap-md">
                        <div className="flex -space-x-3">
                            <div className="w-8 h-8 rounded-full border-2 border-background overflow-hidden">
                                <img className="w-full h-full object-cover" alt="User Avatar" src="https://lh3.googleusercontent.com/aida-public/AB6AXuBMBAzzW7LrswGOm_6w3OLPMEdXB_vsX-KK1gQr1N1zi289QhDxxjyYw71A7XG9Whjel8CcaDsqBparyDR2u-d0Szl-nWlQeI9bQsb0jFjIHA0yqUfMqQiEqqxFdxhzcodrKNrFlbmmvH8T_FeapyO41bNvdm0GqxpQh7QUJQrWdtcy3PQ9dYaZfXyEgMJITr5RMWCA1uSmqcjGszyO3FIbcot8-AjYyNrBDpVs5pCwUQMF2x4FqBJWIYEJwP1Z-Pr_EY8m2X-YITQ6" />
                            </div>
                            <div className="w-8 h-8 rounded-full border-2 border-background overflow-hidden">
                                <img className="w-full h-full object-cover" alt="User Avatar" src="https://lh3.googleusercontent.com/aida-public/AB6AXuDJYD2uHJRbm0DJ9StEIEmY8Sy8bChkumU6XGKrk7oKysr7SeRu33ibvEFFggC8j9RZgux1hiuD2xmjCwNVQfIYPfLwZeE1WTiG_cl8JqxMsFq_PUSykPUMXcpBhSDHBmZWnUdrl1AoyGrNGycQ24FF2i-OxpYCfB5uSjwMrHK2-im-p3VXeSOSRS3_0vrSYy7sIbQp4scNxXxxj-sR3deXMW9V5ZKXwkVtRogLK4iQA6DKG6Le1WX4-K6B3wp_xNUU6Dj3Vm9ROycA" />
                            </div>
                            <div className="w-8 h-8 rounded-full border-2 border-background overflow-hidden">
                                <img className="w-full h-full object-cover" alt="User Avatar" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAN-nK4OLleH5md9uCEaoZb1HqfRZtegrqZQF28MZH_ggTup93lMpapYMuFG8w3w6V6OTdvjx90lUZvg1nB18FkGYvgC5HDw5010DQhwqay3PiIpElS2W2dHtDGV4sHGqFITIUOwq7ve2RCY12XpL7tlWmzjbbcInhe2rnlz0MV4g0kxLLZgn0F9NcFCiMpL1QuMojT3s6C-9i1xKWDPJ-Odas71Kd5OdJ78E-kyOFjVDh3A5RIt-U4tASj6JsFALGrhVMpTlXyeNbc" />
                            </div>
                        </div>
                        <p className="font-label-md text-label-md text-on-surface-variant">Join 500+ teams already using Lumina Mission Control.</p>
                    </div>
                </div>
            </main>
        </>
    )
}