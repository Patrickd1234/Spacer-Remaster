import { supabase } from "../supabase";
import RocketLogo from "./RocketLogo";
import TwoFactorSettings from "./TwoFactorSettings";

// Full-screen step after sign-in for anyone who hasn't set up two-factor yet.
// Shown by App.jsx; the database gives an account no data until it's done
// (20261120110000_require_mfa.sql).
export default function MfaSetupRequired({ onEnabled }) {
    const handleSignOut = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) console.error("Signing out failed:", error);
    };

    return (
        <div className="min-h-screen bg-panel flex items-center justify-center px-8 py-12">
            <div className="w-full max-w-[520px]">
                <div className="text-center mb-8">
                    <div className="flex justify-center mb-6">
                        <RocketLogo size={40} />
                    </div>
                    <span className="material-symbols-outlined text-accent-ink text-[48px] mb-4">shield_lock</span>
                    <h1 className="text-[28px] font-bold text-white mb-2 tracking-tight">Set up two-factor sign-in</h1>
                    <p className="text-muted text-[15px] leading-relaxed">
                        To keep your organization's work private, Spacers asks for a code from an authenticator
                        app (Google Authenticator, Microsoft Authenticator, 1Password, Authy…) when you sign in.
                        It takes about a minute.
                    </p>
                </div>

                <TwoFactorSettings onEnabled={onEnabled} />

                <div className="text-center mt-6">
                    <button
                        type="button"
                        onClick={handleSignOut}
                        className="text-muted hover:text-white text-[13px] cursor-pointer"
                    >
                        Sign out
                    </button>
                </div>
            </div>
        </div>
    );
}
