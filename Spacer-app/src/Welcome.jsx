import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "./supabase"
import AuthBrandPanel from "./partials/AuthBrandPanel"

// First stop for a signed-in user who doesn't belong to an organization yet
// (App.jsx sends every other page here until they do). They either create an
// organization (and become its super admin) or wait for an admin's invite.
export default function Welcome({ onOrganizationChanged }) {
    const navigate = useNavigate()
    const [checking, setChecking] = useState(false)
    const [message, setMessage] = useState("")

    // Accept any invite sent to this email, then re-check membership
    const checkForInvite = async () => {
        setChecking(true)
        setMessage("")
        const { error } = await supabase.rpc("claim_pending_invites")
        if (error) {
            console.error("Checking for invites failed:", error)
            setMessage("Couldn't check for invites right now. Please try again.")
            setChecking(false)
            return
        }
        const hasOrganization = await onOrganizationChanged()
        setChecking(false)
        if (hasOrganization) {
            // Full reload so roles and sidebars load for the new organization
            window.location.assign("/")
        } else {
            setMessage("No invite found for your email yet. Ask your admin to invite the email you signed up with.")
        }
    }

    const signOut = () => supabase.auth.signOut()

    return (
        <div className="min-h-screen bg-[#181a20] flex">
            <AuthBrandPanel
                tagline={
                    <p className="text-[#8c947b] text-base max-w-md">
                        HR, Design, Development, and Marketing — bring all company operations into one unified platform.
                    </p>
                }
                quote="Set up your organization in minutes and invite team leads seamlessly."
            />
            <main className="w-full lg:w-[45%] flex flex-col justify-center px-8 sm:px-16 py-12">
                <div className="w-full max-w-[440px] mx-auto">
                    <h1 className="text-[34px] font-bold text-white mb-2 tracking-tight">Welcome to Spacer</h1>
                    <p className="text-[#8c947b] text-[15px] mb-8 leading-relaxed">
                        Your account is ready. Set up a workspace for your company, or join the one your team already uses.
                    </p>

                    <button
                        type="button"
                        onClick={() => navigate("/launch")}
                        className="w-full text-left p-5 rounded-xl border border-[#2D3139] bg-[#111318] hover:border-[#aff82a] transition-colors mb-4 cursor-pointer group"
                    >
                        <div className="flex items-start gap-4">
                            <span className="material-symbols-outlined text-[#aff82a] text-[28px]">domain_add</span>
                            <div>
                                <p className="text-white font-bold text-[16px] group-hover:text-[#aff82a]">Create an organization</p>
                                <p className="text-[#8c947b] text-[13px] mt-1 leading-relaxed">
                                    Set up your company's workspace and departments. You'll be its super admin and can invite your team.
                                </p>
                            </div>
                        </div>
                    </button>

                    <div className="p-5 rounded-xl border border-[#2D3139] bg-[#111318]">
                        <div className="flex items-start gap-4">
                            <span className="material-symbols-outlined text-[#8c947b] text-[28px]">group_add</span>
                            <div className="flex-1">
                                <p className="text-white font-bold text-[16px]">Join an existing organization</p>
                                <p className="text-[#8c947b] text-[13px] mt-1 leading-relaxed">
                                    Ask an admin of your organization to invite the email you signed up with, then check again here.
                                </p>
                                <button
                                    type="button"
                                    onClick={checkForInvite}
                                    disabled={checking}
                                    className="mt-3 px-4 py-2 rounded-lg border border-[#2D3139] text-white text-[13px] font-semibold hover:bg-[#1C1F26] disabled:opacity-50 cursor-pointer"
                                >
                                    {checking ? "Checking..." : "I've been invited — check again"}
                                </button>
                            </div>
                        </div>
                    </div>

                    {message && <p role="status" className="text-[#8c947b] text-[13px] mt-4">{message}</p>}

                    <button type="button" onClick={signOut} className="mt-8 text-[#8c947b] hover:text-white text-[13px] cursor-pointer">
                        Sign out
                    </button>
                </div>
            </main>
        </div>
    )
}
