import { useState } from "react"
import { useNavigate, Link } from "react-router-dom"
import { supabase } from "./supabase"

function Onboarding() {
    const navigate = useNavigate()
    const [teamInput, setTeamInput] = useState("")
    const [teams, setTeams] = useState(["Development Team", "Product & Design"])
    const [status, setStatus] = useState("idle") // "idle" | "submitting" | "success"

    const handleAddTeam = () => {
        if (!teamInput.trim()) return
        if (!teams.includes(teamInput.trim())) {
            setTeams([...teams, teamInput.trim()])
        }
        setTeamInput("")
    }

    const handleRemoveTeam = (indexToRemove) => {
        setTeams(teams.filter((_, idx) => idx !== indexToRemove))
    }

    const handleKeyDown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault()
            handleAddTeam()
        }
    }

    const handleContinue = async (e) => {
        e.preventDefault()
        if (teams.length === 0 && !teamInput.trim()) return
        if (teamInput.trim()) {
            handleAddTeam()
        }

        setStatus("submitting")
        try {
            const { data: userData } = await supabase.auth.getUser()
            if (userData?.user) {
                const user = userData.user
                let orgId = user.user_metadata?.organization_id
                if (!orgId) {
                    const { data: memberData } = await supabase
                        .from("memberships")
                        .select("team_spaces(organization_id)")
                        .eq("user_id", user.id)
                        .limit(1)
                        .maybeSingle()
                    orgId = memberData?.team_spaces?.organization_id
                }

                // Insert each added team space into team_spaces
                for (const teamName of teams) {
                    const payload = { name: teamName }
                    if (orgId) payload.organization_id = orgId
                    await supabase.from("team_spaces").insert(payload)
                }
            }
        } catch (err) {
            console.error("Error saving onboarding teams:", err)
        } finally {
            setStatus("success")
            setTimeout(() => {
                navigate("/")
            }, 1200)
        }
    }

    return (
        <div className="min-h-screen flex overflow-hidden bg-surface text-gray-200 font-sans antialiased">
            {/* BEGIN: LeftPane */}
            {/* Brand identity and hierarchy preview */}
            <section className="w-1/2 relative flex flex-col border-r border-white/10 p-12 overflow-y-auto bg-surface-lowest" data-purpose="brand-preview-pane">
                <div className="glow-overlay"></div>
                
                {/* Branding */}
                <div className="mb-12">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="w-6 h-6 bg-brand rounded-sm flex items-center justify-center shadow-[0_0_15px_rgba(182,255,51,0.4)]">
                            <svg fill="none" height="14" stroke="black" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" viewBox="0 0 24 24" width="14"><path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.83a.5.5 0 0 0-.838-.376L16 11"></path><rect height="12" rx="2" width="14" x="2" y="6"></rect></svg>
                        </div>
                        <span className="font-bold text-sm tracking-widest text-white uppercase">SPACER</span>
                    </div>
                    <p className="text-zinc-400 max-w-sm text-sm leading-relaxed">
                        One workspace for every company. HR, Design, Dev and Marketing — each in their own space, all in one place
                    </p>
                </div>

                {/* Hierarchy Visualizer */}
                <div className="mt-6 flex-grow" data-purpose="hierarchy-visualizer">
                    <div className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mb-4">Live Hierarchy Preview</div>
                    
                    {/* Organization Level */}
                    <div className="glass-card rounded-custom p-4 flex items-center justify-between mb-6 max-w-md border border-white/10 shadow-lg">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-blue-600/30 border border-blue-500/40 rounded flex items-center justify-center text-blue-400 font-bold">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>
                            </div>
                            <span className="font-semibold text-sm text-white">Spacer</span>
                        </div>
                        <span className="text-[10px] bg-white/5 text-zinc-400 px-2 py-0.5 rounded border border-white/5">Organization</span>
                    </div>

                    {/* Dynamic Teams Level */}
                    <div className="space-y-6">
                        {teams.map((teamName, index) => (
                            <div key={index} className="hierarchy-line transition-all duration-300">
                                <div className="flex items-center justify-between max-w-md mb-3 group cursor-pointer">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-brand shadow-[0_0_8px_rgba(182,255,51,0.8)]"></span>
                                        <span className="text-white font-medium text-sm group-hover:text-brand transition-colors">{teamName}</span>
                                    </div>
                                    <span className="text-zinc-500 text-xs flex items-center gap-1">
                                        Team Space <svg className="w-3 h-3 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"></path></svg>
                                    </span>
                                </div>
                                {/* Mock Projects under the first couple teams */}
                                {index === 0 && (
                                    <div className="hierarchy-line space-y-2">
                                        <div className="glass-card rounded-custom px-4 py-2 flex items-center justify-between w-52 text-zinc-300 text-xs border-white/5">
                                            <div className="flex items-center gap-2">
                                                <svg className="w-3 h-3 text-brand" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"></path></svg>
                                                <span>Project Launch</span>
                                            </div>
                                            <span className="text-[10px] text-zinc-500">Active</span>
                                        </div>
                                        <div className="glass-card rounded-custom px-4 py-2 flex items-center justify-between w-52 text-zinc-300 text-xs border-white/5">
                                            <div className="flex items-center gap-2">
                                                <svg className="w-3 h-3 text-brand" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M3 13h18M3 7h18M3 19h18"></path></svg>
                                                <span>App Redesign</span>
                                            </div>
                                            <span className="text-[10px] text-zinc-500">Active</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Personal Workspace Level */}
                    <div className="mt-8 pt-6 border-t border-white/5">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="text-white font-medium text-sm">My Space <span className="text-zinc-500 font-normal">(personal workspace)</span></span>
                        </div>
                        <div className="hierarchy-line">
                            <div className="text-[10px] text-zinc-500 mb-2 font-bold uppercase tracking-wider">Assigned Task</div>
                            <div className="glass-card rounded-custom p-4 w-60 border-white/5 hover:border-brand/40 transition-colors">
                                <div className="text-[11px] font-semibold text-zinc-100 mb-1 flex items-center justify-between">
                                    <span>Fix auth token expiry bug</span>
                                    <span className="w-1.5 h-1.5 rounded-full bg-red-400"></span>
                                </div>
                                <div className="text-[10px] text-zinc-500 leading-tight">Sessions dropping before timeout period ends — users getting logged out early.</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
            {/* END: LeftPane */}

            {/* BEGIN: RightPane */}
            {/* Onboarding Form */}
            <main className="w-1/2 flex flex-col items-start justify-center px-16 lg:px-24 bg-surface-dim overflow-y-auto" data-purpose="onboarding-form-pane">
                <div className="w-full max-w-lg py-12">
                    <span className="text-[11px] font-medium text-zinc-500 uppercase tracking-[0.2em] mb-4 block">Step 2 of 3 • Onboarding</span>
                    <h1 className="text-3xl lg:text-4xl font-bold text-white mb-4 tracking-tight">Set up your teams</h1>
                    <p className="text-zinc-400 text-sm mb-10 leading-relaxed">
                        Start with the teams that are most ready to adopt Spacer.<br />
                        Many organizations begin with three teams and expand as adoption grows.
                    </p>
                    
                    <form className="space-y-8" data-purpose="teams-setup-form" onSubmit={handleContinue}>
                        {/* Input Group */}
                        <div className="space-y-3">
                            <label className="block text-sm font-semibold text-zinc-200" htmlFor="team-input">
                                Create Teams (Type a team name, then click Add Team.)
                            </label>
                            <div className="relative flex gap-2">
                                <input 
                                    id="team-input"
                                    className="w-full bg-surface-lowest border border-white/10 rounded-custom px-4 py-3.5 text-sm focus:ring-1 focus:ring-brand focus:border-brand transition-all text-white placeholder:text-zinc-600 outline-none pr-32" 
                                    placeholder="e.g. Design, Engineering, Marketing" 
                                    type="text" 
                                    value={teamInput}
                                    onChange={(e) => setTeamInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                />
                                <button 
                                    type="button"
                                    onClick={handleAddTeam}
                                    className="absolute right-2 top-2 bottom-2 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 hover:text-white text-xs font-semibold rounded-custom border border-white/10 flex items-center gap-1 transition-all active:scale-95 cursor-pointer"
                                >
                                    Add Team <span className="text-base leading-none text-brand">+</span>
                                </button>
                            </div>
                        </div>

                        {/* Teams Added Section */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="block text-sm font-semibold text-zinc-200">
                                    Teams Added ({teams.length})
                                </label>
                                {teams.length > 0 && (
                                    <span className="text-[11px] text-brand/80">Reflected live on the left hierarchy</span>
                                )}
                            </div>
                            <div className="w-full min-h-[120px] max-h-[220px] overflow-y-auto border border-dashed border-white/15 rounded-custom bg-surface-lowest/40 p-4 flex flex-wrap gap-2.5 items-start transition-all">
                                {teams.length === 0 ? (
                                    <div className="w-full h-full flex flex-col items-center justify-center py-6 text-center text-zinc-600 text-xs">
                                        <span className="material-symbols-outlined text-2xl mb-1 opacity-40">groups</span>
                                        <span>No teams added yet. Type above and click + Add Team</span>
                                    </div>
                                ) : (
                                    teams.map((t, index) => (
                                        <div key={index} className="px-3 py-2 rounded-lg bg-surface-container border border-white/10 text-white text-xs font-medium flex items-center gap-2 group shadow-sm hover:border-brand/40 transition-all animate-fadeIn">
                                            <span className="w-1.5 h-1.5 rounded-full bg-brand"></span>
                                            <span>{t}</span>
                                            <button 
                                                type="button" 
                                                onClick={() => handleRemoveTeam(index)} 
                                                className="ml-1 w-5 h-5 rounded flex items-center justify-center text-zinc-400 hover:text-red-400 hover:bg-red-500/10 font-bold transition-all"
                                                title="Remove team"
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Submit Button */}
                        <div className="pt-4">
                            <button 
                                className={`w-full py-4 font-bold rounded-custom transition-all flex items-center justify-center gap-2 ${
                                    teams.length > 0 || teamInput.trim()
                                        ? "bg-brand text-surface-lowest hover:opacity-90 active:scale-[0.99] shadow-[0_0_20px_rgba(182,255,51,0.25)] cursor-pointer"
                                        : "bg-zinc-800/40 text-zinc-600 cursor-not-allowed border border-white/5"
                                }`} 
                                type="submit"
                                disabled={status === "submitting" || (teams.length === 0 && !teamInput.trim())}
                            >
                                {status === "submitting" ? (
                                    <>
                                        <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                                        <span>Setting up workspaces...</span>
                                    </>
                                ) : status === "success" ? (
                                    <>
                                        <span className="material-symbols-outlined text-sm">check_circle</span>
                                        <span>Teams Created!</span>
                                    </>
                                ) : (
                                    <>
                                        <span>Continue to Workspace</span>
                                        <span className="material-symbols-outlined text-sm">arrow_forward</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </main>
            {/*END: RightPane*/}
        </div>
    )
}

export default Onboarding