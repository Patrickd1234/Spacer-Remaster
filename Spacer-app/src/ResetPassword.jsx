import { useState, useEffect } from "react"
import { useNavigate, Link } from "react-router-dom"
import { supabase } from "./supabase"

function ResetPassword() {
    const navigate = useNavigate()
    const [status, setStatus] = useState("checking") // checking | ready | invalid | success
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [errorMsg, setErrorMsg] = useState("")
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        let mounted = true

        // Check if the URL hash contains an explicit error from Supabase (e.g. expired link)
        const hash = window.location.hash || ""
        if (hash.includes("error=") || hash.includes("error_description=")) {
            const params = new URLSearchParams(hash.replace(/^#/, ""))
            const desc = params.get("error_description") || "The password reset link is invalid or has expired."
            setErrorMsg(desc.replace(/\+/g, " "))
            setStatus("invalid")
            return
        }

        const checkSession = async () => {
            try {
                const { data: { session }, error } = await supabase.auth.getSession()
                if (error) throw error

                if (!mounted) return

                if (session?.user) {
                    setEmail(session.user.email || "")
                    setStatus("ready")
                } else {
                    // Give a short delay in case supabase-js is parsing hash/code in the background
                    setTimeout(async () => {
                        if (!mounted) return
                        const { data: { session: retrySession } } = await supabase.auth.getSession()
                        if (retrySession?.user) {
                            setEmail(retrySession.user.email || "")
                            setStatus("ready")
                        } else {
                            setStatus("invalid")
                        }
                    }, 1200)
                }
            } catch (err) {
                console.error("Error retrieving session for reset password:", err)
                if (mounted) setStatus("invalid")
            }
        }

        checkSession()

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (!mounted) return
            if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session?.user) {
                setEmail(session.user.email || "")
                setStatus("ready")
            }
        })

        return () => {
            mounted = false
            subscription?.unsubscribe?.()
        }
    }, [])

    const handleUpdatePassword = async (e) => {
        e.preventDefault()
        setErrorMsg("")

        if (password.length < 8) {
            setErrorMsg("Password must be at least 8 characters long.")
            return
        }

        if (password !== confirmPassword) {
            setErrorMsg("Passwords do not match.")
            return
        }

        setSubmitting(true)
        try {
            const { error } = await supabase.auth.updateUser({
                password: password,
            })

            if (error) {
                throw error
            }

            setStatus("success")

            // Sign out the recovery session so user can log in with new credentials
            try {
                await supabase.auth.signOut()
            } catch (signOutErr) {
                console.warn("Sign out after password reset warning:", signOutErr)
            }

            // Redirect to login page with success notification state
            setTimeout(() => {
                navigate("/login", {
                    state: {
                        resetSuccess: true,
                    },
                    replace: true,
                })
            }, 1800)
        } catch (err) {
            console.error("Update password error:", err)
            setErrorMsg(err.message || "Failed to update password. Please try again.")
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="min-h-screen bg-[#181a20] flex items-center justify-center px-6">
            <div className="w-full max-w-[420px]">
                <div className="w-10 h-10 mb-6 flex items-center justify-center mx-auto">
                    <span className="material-symbols-outlined text-[#aff82a] text-[36px]">token</span>
                </div>

                {status === "checking" && (
                    <div className="text-center py-10 space-y-3">
                        <span className="material-symbols-outlined animate-spin text-4xl text-[#aff82a]">progress_activity</span>
                        <p className="text-[#8c947b] text-sm">Verifying password reset request…</p>
                    </div>
                )}

                {status === "invalid" && (
                    <div className="text-center py-8 space-y-4">
                        <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400 mx-auto">
                            <span className="material-symbols-outlined text-[32px]">link_off</span>
                        </div>
                        <h2 className="text-2xl font-bold text-white">Invalid or Expired Link</h2>
                        <p className="text-[#8c947b] text-sm leading-relaxed">
                            {errorMsg || "This password reset link is invalid or has expired. Please request a new link to reset your password."}
                        </p>
                        <div className="pt-2 flex flex-col gap-2">
                            <Link
                                to="/forgot-password"
                                className="w-full bg-[#aff82a] hover:bg-[#9de022] text-[#1C1F26] font-bold text-[14px] py-3 rounded-xl transition-all inline-block"
                            >
                                Request New Reset Link
                            </Link>
                            <Link
                                to="/login"
                                className="text-sm text-[#8c947b] hover:text-white transition-colors py-2"
                            >
                                Back to Login
                            </Link>
                        </div>
                    </div>
                )}

                {status === "ready" && (
                    <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
                        <div className="text-center space-y-2">
                            <h2 className="text-[28px] font-bold text-white tracking-tight">Set New Password</h2>
                            <p className="text-[#8c947b] text-[14px] leading-relaxed">
                                Enter a new secure password for{" "}
                                <span className="text-white font-medium">{email || "your account"}</span>.
                            </p>
                        </div>

                        <form onSubmit={handleUpdatePassword} className="space-y-4">
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    id="new-password"
                                    placeholder="New password (min. 8 characters)"
                                    className="w-full bg-[#111318] border border-[#2D3139] focus:border-[#aff82a] rounded-xl px-4 py-3.5 text-white text-[14px] placeholder-[#8c947b] focus:outline-none transition-colors"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    autoFocus
                                />
                                <button
                                    type="button"
                                    aria-label="Toggle password visibility"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-[14px] text-[#8c947b] hover:text-white transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[20px]">
                                        {showPassword ? "visibility_off" : "visibility"}
                                    </span>
                                </button>
                            </div>

                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    id="confirm-password"
                                    placeholder="Confirm new password"
                                    className="w-full bg-[#111318] border border-[#2D3139] focus:border-[#aff82a] rounded-xl px-4 py-3.5 text-white text-[14px] placeholder-[#8c947b] focus:outline-none transition-colors"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    required
                                />
                            </div>

                            {errorMsg && (
                                <p className="text-red-400 text-xs flex items-center gap-1.5 pt-1">
                                    <span className="material-symbols-outlined text-[14px]">error</span>
                                    {errorMsg}
                                </p>
                            )}

                            <button
                                type="submit"
                                disabled={submitting || !password || !confirmPassword}
                                className="w-full bg-[#aff82a] hover:bg-[#9de022] text-[#1C1F26] font-bold text-[15px] py-3.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                            >
                                {submitting ? (
                                    <>
                                        <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                                        Updating password…
                                    </>
                                ) : (
                                    "Save New Password"
                                )}
                            </button>
                        </form>
                    </div>
                )}

                {status === "success" && (
                    <div className="text-center py-10 space-y-4 animate-in fade-in zoom-in-95 duration-200">
                        <div className="w-14 h-14 rounded-2xl bg-[#aff82a]/10 border border-[#aff82a]/30 flex items-center justify-center text-[#aff82a] mx-auto">
                            <span className="material-symbols-outlined text-[32px]">check_circle</span>
                        </div>
                        <h2 className="text-2xl font-bold text-white">Password Updated!</h2>
                        <p className="text-[#8c947b] text-sm">
                            Your password has been changed successfully. Redirecting you to sign in…
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}

export default ResetPassword
