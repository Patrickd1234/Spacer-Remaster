import { useState, useEffect } from "react"
import { useNavigate, Link } from "react-router-dom"
import { supabase } from "./supabase"
import NewPasswordForm from "./components/NewPasswordForm"
import PlanetLoader from "./components/PlanetLoader"
import RocketLogo from "./components/RocketLogo"

// Lands here when someone clicks the "invite" link Supabase emails them
// (see supabase/functions/invite-department-member). Their auth account,
// profile row, and department membership already exist by this point —
// all this page needs to do is let them set a password, then send them
// straight into the app.
function AcceptInvite() {
    const navigate = useNavigate()
    const [status, setStatus] = useState("checking") // checking | ready | invalid | success
    const [email, setEmail] = useState("")

    useEffect(() => {
        // supabase-js parses the invite link's tokens out of the URL hash
        // and establishes a session automatically on client init. We just
        // need to check whether that session showed up.
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession()
            if (session?.user) {
                setEmail(session.user.email || "")
                setStatus("ready")
            } else {
                setStatus("invalid")
            }
        }
        checkSession()

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === "SIGNED_IN" && session?.user) {
                setEmail(session.user.email || "")
                setStatus("ready")
            }
        })
        return () => subscription.unsubscribe()
    }, [])

    const handlePasswordSet = () => {
        setStatus("success")
        setTimeout(() => navigate("/"), 1200)
    }

    return (
        <div className="min-h-screen bg-panel flex items-center justify-center px-6">
            <div className="w-full max-w-[420px]">
                <div className="w-10 h-10 mb-6 flex items-center justify-center mx-auto">
                    <RocketLogo size={40} />
                </div>

                {status === "checking" && (
                    <div className="text-center py-10">
                        <PlanetLoader className="text-4xl text-accent-ink" />
                        <p className="text-muted text-sm mt-4">Verifying your invite…</p>
                    </div>
                )}

                {status === "invalid" && (
                    <div className="text-center py-6 space-y-3">
                        <span className="material-symbols-outlined text-4xl text-red-400">link_off</span>
                        <h2 className="text-xl font-bold text-white">This invite link isn't valid</h2>
                        <p className="text-muted text-sm leading-relaxed">
                            It may have already been used, or it's expired. Ask whoever invited you to send a new one,
                            or log in below if you've already set your password.
                        </p>
                        <Link to="/login" className="inline-block mt-2 text-accent-ink font-semibold hover:underline text-sm">
                            Go to Login
                        </Link>
                    </div>
                )}

                {status === "ready" && (
                    <>
                        <h2 className="text-[28px] font-bold text-white mb-2 tracking-tight text-center">Welcome to Spacer</h2>
                        <p className="text-muted text-[14px] mb-8 leading-relaxed text-center">
                            You've been added to your team already — just set a password for
                            <span className="text-white font-medium"> {email}</span> to finish signing in.
                        </p>

                        <NewPasswordForm submitLabel="Set password & continue" onSuccess={handlePasswordSet} />
                    </>
                )}

                {status === "success" && (
                    <div className="text-center py-10 space-y-3">
                        <span className="material-symbols-outlined text-4xl text-accent-ink">check_circle</span>
                        <h2 className="text-xl font-bold text-white">You're all set!</h2>
                        <p className="text-muted text-sm">Taking you into Spacer…</p>
                    </div>
                )}
            </div>
        </div>
    )
}

export default AcceptInvite
