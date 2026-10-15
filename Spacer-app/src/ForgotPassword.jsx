import { useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { supabase } from "./supabase"

function ForgotPassword() {
    const location = useLocation()
    const [email, setEmail] = useState(location.state?.email || "")
    const [submitted, setSubmitted] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [errorMsg, setErrorMsg] = useState("")

    const handleResetPassword = async (e) => {
        e.preventDefault()
        setErrorMsg("")

        if (!email.trim()) {
            setErrorMsg("Please enter your email address.")
            return
        }

        setSubmitting(true)
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(
                email.trim(),
                {
                    redirectTo: `${window.location.origin}/reset-password`,
                }
            )

            if (error) {
                console.error("Password reset request error:", error)
                // If it's a rate limit or service error, notify user gracefully
                if (error.status === 429 || error.message?.toLowerCase().includes("rate limit")) {
                    setErrorMsg("Too many reset attempts. Please wait a few minutes before trying again.")
                    return
                }
            }

            // Always display a generic confirmation message without revealing whether an account exists
            setSubmitted(true)
        } catch (err) {
            console.error("Unexpected error in resetPasswordForEmail:", err)
            setErrorMsg("An unexpected error occurred. Please try again later.")
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="min-h-screen bg-[#181a20] flex overflow-hidden">
            {/* Top Error Toast */}
            {errorMsg && (
                <div className="fixed top-8 right-8 z-50 flex items-center gap-4 bg-[#8C2A32]/90 backdrop-blur-md border border-[#C53F4A] rounded-xl p-4 shadow-2xl max-w-sm animate-in fade-in slide-in-from-top-10">
                    <div className="w-8 h-8 rounded border border-white/20 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-white text-[18px]">error</span>
                    </div>
                    <p className="text-white text-[14px] leading-tight">
                        {errorMsg}
                    </p>
                </div>
            )}

            {/* Left Side: Visual/Brand Panel (Consistent with Login & Signup) */}
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

                {/* Decorative Security Showcase */}
                <div className="relative z-10 w-full max-w-[420px] bg-[#1C1F26]/80 backdrop-blur-xl border border-[#2D3139] rounded-2xl p-6 shadow-2xl mt-4 space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[#aff82a]/10 border border-[#aff82a]/20 text-[#aff82a] flex items-center justify-center">
                            <span className="material-symbols-outlined text-[20px]">lock_reset</span>
                        </div>
                        <div>
                            <h4 className="text-sm font-semibold text-white">Account Recovery</h4>
                            <p className="text-xs text-[#8c947b]">Secure email verification</p>
                        </div>
                    </div>
                    <p className="text-xs text-[#8c947b] leading-relaxed">
                        We send secure, time-limited reset links directly to your registered email address to protect your workspace.
                    </p>
                </div>

                <div className="relative z-10 mt-auto pt-8 border-l-2 border-[#aff82a] pl-4">
                    <p className="text-sm text-[#8c947b] italic">
                        "Fast, secure password recovery gets you back to your team without friction."
                    </p>
                </div>
            </div>

            {/* Right Side: Recovery Form */}
            <div className="w-full lg:w-[45%] flex flex-col justify-center px-8 sm:px-16 lg:px-24 bg-[#181a20] relative z-10">
                <div className="w-full max-w-[420px] mx-auto">
                    <div className="w-10 h-10 mb-6 flex items-center justify-center">
                        <span className="material-symbols-outlined text-[#aff82a] text-[36px]">token</span>
                    </div>

                    {!submitted ? (
                        <>
                            <h2 className="text-[36px] font-bold text-white mb-2 tracking-tight">Forgot Password?</h2>
                            <p className="text-[#8c947b] text-[15px] mb-8 leading-relaxed">
                                Enter the email associated with your account, and we'll send you instructions to reset your password.
                            </p>

                            <form onSubmit={handleResetPassword} className="space-y-5">
                                <div className="relative">
                                    <input
                                        type="email"
                                        id="forgot-email"
                                        placeholder="Email address"
                                        className="w-full bg-[#111318] border border-[#2D3139] focus:border-[#aff82a] rounded-xl px-4 py-3.5 text-white text-[14px] placeholder-[#8c947b] focus:outline-none transition-colors"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                        autoFocus
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={submitting || !email.trim()}
                                    className="w-full bg-[#aff82a] hover:bg-[#9de022] text-[#1C1F26] font-bold text-[15px] py-3.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {submitting ? (
                                        <>
                                            <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                                            Sending instructions…
                                        </>
                                    ) : (
                                        "Send Reset Link"
                                    )}
                                </button>

                                <div className="text-center mt-6">
                                    <Link
                                        to="/login"
                                        className="inline-flex items-center gap-1.5 text-[#8c947b] hover:text-white text-[14px] transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                                        Back to Sign In
                                    </Link>
                                </div>
                            </form>
                        </>
                    ) : (
                        <div className="space-y-6 animate-in fade-in zoom-in-95 duration-200">
                            <div className="w-14 h-14 rounded-2xl bg-[#aff82a]/10 border border-[#aff82a]/30 flex items-center justify-center text-[#aff82a]">
                                <span className="material-symbols-outlined text-[32px]">mark_email_read</span>
                            </div>

                            <div className="space-y-2">
                                <h2 className="text-[30px] font-bold text-white tracking-tight">Check your email</h2>
                                <p className="text-[#8c947b] text-[15px] leading-relaxed">
                                    If an account exists for <span className="text-white font-medium">{email}</span>, we've sent password reset instructions.
                                </p>
                            </div>

                            <div className="p-4 rounded-xl bg-[#111318] border border-[#2D3139] text-[#8c947b] text-xs leading-relaxed space-y-1">
                                <p className="text-white font-medium text-xs">Didn't receive an email?</p>
                                <p>Check your spam or junk folder, or verify you entered the right address.</p>
                            </div>

                            <div className="pt-2 space-y-3">
                                <button
                                    type="button"
                                    onClick={() => setSubmitted(false)}
                                    className="w-full bg-[#252a33] hover:bg-[#2D3139] text-white font-medium text-[14px] py-3.5 rounded-xl transition-colors border border-[#2D3139]"
                                >
                                    Send another link
                                </button>

                                <div className="text-center pt-2">
                                    <Link
                                        to="/login"
                                        className="inline-flex items-center gap-1.5 text-[#aff82a] hover:underline font-semibold text-[14px]"
                                    >
                                        Return to Sign In
                                    </Link>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default ForgotPassword
