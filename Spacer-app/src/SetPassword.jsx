import { supabase } from "./supabase"
import NewPasswordForm from "./components/NewPasswordForm"

// Shown by App instead of any page while the signed-in account has no password
// (signed up with Google, or never finished an invite). Once it's set they can
// sign in with either Google or email + password.
function SetPassword({ email, onPasswordSet }) {
    return (
        <div className="min-h-screen bg-[#181a20] flex items-center justify-center px-6">
            <div className="w-full max-w-[420px]">
                <div className="w-10 h-10 mb-6 flex items-center justify-center mx-auto">
                    <span className="material-symbols-outlined text-[#aff82a] text-[36px]">token</span>
                </div>

                <h2 className="text-[28px] font-bold text-white mb-2 tracking-tight text-center">Set a password</h2>
                <p className="text-[#8c947b] text-[14px] mb-8 leading-relaxed text-center">
                    Create a password for
                    <span className="text-white font-medium"> {email}</span>.
                    You'll be able to sign in with it or keep using Google.
                </p>

                <NewPasswordForm submitLabel="Set password & continue" onSuccess={onPasswordSet} />

                <button
                    type="button"
                    onClick={() => supabase.auth.signOut()}
                    className="w-full mt-6 text-[#8c947b] hover:text-white text-sm transition-colors"
                >
                    Sign out
                </button>
            </div>
        </div>
    )
}

export default SetPassword
