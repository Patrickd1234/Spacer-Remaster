import { useState } from "react";
import { supabase } from "../supabase";

const CODE_LENGTH = 6;

// Full-screen second step of sign-in for accounts with two-factor on.
// Shown by App.jsx whenever the session is still at the password step (aal1)
// but the account requires an authenticator code (aal2).
export default function MfaChallenge({ onVerified }) {
    const [code, setCode] = useState("");
    const [error, setError] = useState("");
    const [verifying, setVerifying] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (code.length !== CODE_LENGTH) {
            setError(`Enter the ${CODE_LENGTH}-digit code from your authenticator app.`);
            return;
        }
        setVerifying(true);
        setError("");

        const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
        const factor = factors?.totp?.find(f => f.status === "verified");
        if (listError || !factor) {
            setError("Couldn't load your two-factor settings. Please sign in again.");
            setVerifying(false);
            return;
        }

        const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
        setVerifying(false);
        if (verifyError) {
            setError("That code didn't work. Check your authenticator app and try again.");
            setCode("");
            return;
        }
        onVerified();
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
    };

    return (
        <div className="min-h-screen bg-[#181a20] flex items-center justify-center px-8">
            <form onSubmit={handleSubmit} className="w-full max-w-[380px] text-center">
                <span className="material-symbols-outlined text-[#aff82a] text-[48px] mb-4">shield_lock</span>
                <h1 className="text-[28px] font-bold text-white mb-2 tracking-tight">Two-factor verification</h1>
                <p className="text-[#8c947b] text-[15px] mb-8 leading-relaxed">
                    Open your authenticator app and enter the {CODE_LENGTH}-digit code for Spacer.
                </p>

                <label htmlFor="mfa-code" className="sr-only">Authentication code</label>
                <input
                    id="mfa-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={CODE_LENGTH}
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    className="w-full bg-[#111318] border border-[#2D3139] focus:border-[#aff82a] rounded-xl px-4 py-3.5 text-white text-center text-[22px] tracking-[0.5em] placeholder-[#4a4f42] focus:outline-none transition-colors"
                />

                {error && <p role="alert" className="text-red-400 text-[13px] mt-3">{error}</p>}

                <button
                    type="submit"
                    disabled={verifying}
                    className="w-full mt-6 bg-[#aff82a] hover:bg-[#9de022] text-[#1C1F26] font-bold text-[15px] py-3.5 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
                >
                    {verifying ? "Verifying..." : "Verify"}
                </button>

                <button
                    type="button"
                    onClick={handleSignOut}
                    className="mt-4 text-[#8c947b] hover:text-white text-[13px] cursor-pointer"
                >
                    Sign in with a different account
                </button>
                <p className="text-[#8c947b] text-[12px] mt-6 leading-relaxed">
                    Lost access to your authenticator app? Contact your workspace administrator to have two-factor reset.
                </p>
            </form>
        </div>
    );
}
