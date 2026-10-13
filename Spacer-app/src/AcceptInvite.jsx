import { useState, useEffect } from "react"
import { useNavigate, Link } from "react-router-dom"
import { supabase } from "./supabase"

// Lands here when someone clicks the "invite" link Supabase emails them
// (see supabase/functions/invite-department-member). Their auth account,
// profile row, and department membership already exist by this point —
// all this page needs to do is let them set a password, then send them
// straight into the app.
function AcceptInvite() {
    const navigate = useNavigate()
    const [status, setStatus] = useState("checking") // checking | ready | invalid | success
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [errorMsg, setErrorMsg] = useState("")
    const [submitting, setSubmitting] = useState(false)

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

    const handleSetPassword = async (e) => {
        e.preventDefault()
        setErrorMsg("")

        if (password.length < 8) {
            setErrorMsg("Password must be at least 8 characters.")
            return
        }
        if (password !== confirmPassword) {
            setErrorMsg("Passwords don't match.")
            return
        }

        setSubmitting(true)
        try {
            const { error } = await supabase.auth.updateUser({ password })
            if (error) throw error
            setStatus("success")
            setTimeout(() => navigate("/"), 1200)
        } catch (err) {
            console.error("Set password error:", err)
            setErrorMsg(err.message || "Something went wrong setting your password.")
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="min-h-screen bg-background flex items-center justify-center px-6">
            <div className="w-full max-w-[420px]">
                <div className="w-10 h-10 mb-6 flex items-center justify-center mx-auto">
                    <span className="material-symbols-outlined text-primary-fixed text-[36px]">token</span>
                </div>

                {status === "checking" && (
                    <div className="text-center py-10">
                        <span className="material-symbols-outlined animate-spin text-4xl text-primary-fixed">progress_activity</span>
                        <p className="text-on-surface-variant text-sm mt-4">Verifying your invite…</p>
                    </div>
                )}

                {status === "invalid" && (
                    <div className="text-center py-6 space-y-3">
                        <span className="material-symbols-outlined text-4xl text-error">link_off</span>
                        <h2 className="text-xl font-bold text-on-surface">This invite link isn't valid</h2>
                        <p className="text-on-surface-variant text-sm leading-relaxed">
                            It may have already been used, or it's expired. Ask whoever invited you to send a new one,
                            or log in below if you've already set your password.
                        </p>
                        <Link to="/login" className="inline-block mt-2 text-primary-fixed font-semibold hover:underline text-sm">
                            Go to Login
                        </Link>
                    </div>
                )}

                {status === "ready" && (
                    <>
                        <h2 className="text-[28px] font-bold text-on-surface mb-2 tracking-tight text-center">Welcome to Spacer</h2>
                        <p className="text-on-surface-variant text-[14px] mb-8 leading-relaxed text-center">
                            You've been added to your team already — just set a password for
                            <span className="text-on-surface font-medium"> {email}</span> to finish signing in.
                        </p>

                        <form onSubmit={handleSetPassword} className="space-y-4">
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="Create a password"
                                    className="w-full bg-surface-container-lowest border border-outline-variant focus:border-primary-fixed rounded-xl px-4 py-3.5 text-on-surface text-[14px] placeholder:text-on-surface-variant focus:outline-none transition-colors"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-[14px] text-on-surface-variant hover:text-on-surface transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[20px]">
                                        {showPassword ? "visibility_off" : "visibility"}
                                    </span>
                                </button>
                            </div>

                            <input
                                type={showPassword ? "text" : "password"}
                                placeholder="Confirm password"
                                className="w-full bg-surface-container-lowest border border-outline-variant focus:border-primary-fixed rounded-xl px-4 py-3.5 text-on-surface text-[14px] placeholder:text-on-surface-variant focus:outline-none transition-colors"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                            />

                            {errorMsg && (
                                <p className="text-error text-xs flex items-center gap-1.5">
                                    <span className="material-symbols-outlined text-[14px]">error</span>
                                    {errorMsg}
                                </p>
                            )}

                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full bg-primary-container hover:bg-primary-fixed-dim text-on-primary font-bold text-[15px] py-3.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                            >
                                {submitting ? (
                                    <>
                                        <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                                        Setting password…
                                    </>
                                ) : (
                                    "Set password & continue"
                                )}
                            </button>
                        </form>
                    </>
                )}

                {status === "success" && (
                    <div className="text-center py-10 space-y-3">
                        <span className="material-symbols-outlined text-4xl text-primary-fixed">check_circle</span>
                        <h2 className="text-xl font-bold text-on-surface">You're all set!</h2>
                        <p className="text-on-surface-variant text-sm">Taking you into Spacer…</p>
                    </div>
                )}
            </div>
        </div>
    )
}

export default AcceptInvite
