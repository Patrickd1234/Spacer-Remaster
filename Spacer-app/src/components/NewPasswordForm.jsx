import { useState } from "react"
import { supabase } from "../supabase"
import { validateNewPassword } from "../passwordRules"

// Password + confirmation fields that set the signed-in user's password.
// Only for accounts that have no password yet (invites, Google sign-ups):
// changing an existing one goes through change-password, which checks the old one.
function NewPasswordForm({ submitLabel, onSuccess }) {
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [errorMsg, setErrorMsg] = useState("")
    const [submitting, setSubmitting] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        const invalid = validateNewPassword(password, confirmPassword)
        setErrorMsg(invalid ?? "")
        if (invalid) return

        setSubmitting(true)
        const { error } = await supabase.auth.updateUser({ password })
        setSubmitting(false)
        if (error) {
            console.error("Set password error:", error)
            setErrorMsg(error.message || "Something went wrong setting your password.")
            return
        }
        onSuccess()
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="relative">
                <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Create a password"
                    autoComplete="new-password"
                    className="w-full bg-[#111318] border border-[#2D3139] focus:border-[#aff82a] rounded-xl px-4 py-3.5 text-white text-[14px] placeholder-[#8c947b] focus:outline-none transition-colors"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                />
                <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-4 top-[14px] text-[#8c947b] hover:text-white transition-colors"
                >
                    <span className="material-symbols-outlined text-[20px]">
                        {showPassword ? "visibility_off" : "visibility"}
                    </span>
                </button>
            </div>

            <input
                type={showPassword ? "text" : "password"}
                placeholder="Confirm password"
                autoComplete="new-password"
                className="w-full bg-[#111318] border border-[#2D3139] focus:border-[#aff82a] rounded-xl px-4 py-3.5 text-white text-[14px] placeholder-[#8c947b] focus:outline-none transition-colors"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
            />

            {errorMsg && (
                <p role="alert" className="text-red-400 text-xs flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[14px]">error</span>
                    {errorMsg}
                </p>
            )}

            <button
                type="submit"
                disabled={submitting}
                className="w-full bg-[#aff82a] hover:bg-[#9de022] text-[#1C1F26] font-bold text-[15px] py-3.5 rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
                {submitting ? (
                    <>
                        <span className="material-symbols-outlined animate-spin text-[18px]">progress_activity</span>
                        Setting password…
                    </>
                ) : (
                    submitLabel
                )}
            </button>
        </form>
    )
}

export default NewPasswordForm
