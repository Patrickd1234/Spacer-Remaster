import { useState } from "react";
import { supabase } from "../supabase";
import { saveTrustedDevice, TRUSTED_DEVICE_DAYS } from "../trustedDevice";
import { looksLikeRecoveryCode } from "../mfaRecovery";
import { redeemRecoveryCode } from "../mfaRecoveryData";

const CODE_LENGTH = 6;

// Full-screen second step of sign-in for accounts with two-factor on.
// Shown by App.jsx whenever the session is still at the password step (aal1)
// but the account requires an authenticator code (aal2).
// "Use a recovery code" is the way in after losing the phone: a valid code
// removes the authenticator (edge function mfa-recovery).
export default function MfaChallenge({ onVerified }) {
    const [mode, setMode] = useState("authenticator"); // authenticator | recovery | recovered
    const [code, setCode] = useState("");
    const [error, setError] = useState("");
    const [verifying, setVerifying] = useState(false);
    const [rememberDevice, setRememberDevice] = useState(true);

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
        if (verifyError) {
            setVerifying(false);
            setError("That code didn't work. Check your authenticator app and try again.");
            setCode("");
            return;
        }

        // The session is now verified (aal2), so the server will issue a device token
        if (rememberDevice) {
            const { data: { session } } = await supabase.auth.getSession();
            const { data: token, error: trustError } = await supabase.rpc("trust_this_device", {
                p_user_agent: navigator.userAgent,
            });
            if (trustError || !token) console.error("Couldn't remember this device:", trustError);
            else if (session?.user?.id) saveTrustedDevice(session.user.id, token);
        }
        setVerifying(false);
        onVerified();
    };

    const handleSignOut = async () => {
        await supabase.auth.signOut();
    };

    const switchTo = (nextMode) => {
        setMode(nextMode);
        setCode("");
        setError("");
    };

    if (mode === "recovery") {
        return <RecoveryCodeForm onRecovered={() => switchTo("recovered")} onBack={() => switchTo("authenticator")} />;
    }
    if (mode === "recovered") {
        return <RecoveredNotice onContinue={onVerified} />;
    }

    return (
        <div className="min-h-screen bg-panel flex items-center justify-center px-8">
            <form onSubmit={handleSubmit} className="w-full max-w-[380px] text-center">
                <span className="material-symbols-outlined text-accent-ink text-[48px] mb-4">shield_lock</span>
                <h1 className="text-[28px] font-bold text-white mb-2 tracking-tight">Two-factor verification</h1>
                <p className="text-muted text-[15px] mb-8 leading-relaxed">
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
                    className="w-full bg-field border border-line focus:border-accent-ink rounded-xl px-4 py-3.5 text-white text-center text-[22px] tracking-[0.5em] placeholder-line-strong focus:outline-none transition-colors"
                />

                <label className="flex items-center justify-center gap-2 mt-4 text-muted text-[13px] cursor-pointer select-none">
                    <input
                        type="checkbox"
                        checked={rememberDevice}
                        onChange={(e) => setRememberDevice(e.target.checked)}
                        className="rounded border-line bg-field text-accent-ink focus:ring-accent-ink"
                    />
                    Remember this device for {TRUSTED_DEVICE_DAYS} days
                </label>

                {error && <p role="alert" className="text-red-400 text-[13px] mt-3">{error}</p>}

                <button
                    type="submit"
                    disabled={verifying}
                    className="w-full mt-6 bg-accent hover:bg-accent-hover text-on-accent font-bold text-[15px] py-3.5 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
                >
                    {verifying ? "Verifying..." : "Verify"}
                </button>

                <button
                    type="button"
                    onClick={() => switchTo("recovery")}
                    className="mt-4 block w-full text-accent-ink hover:brightness-110 text-[13px] font-semibold cursor-pointer"
                >
                    Lost your phone? Use a recovery code
                </button>
                <button
                    type="button"
                    onClick={handleSignOut}
                    className="mt-3 text-muted hover:text-white text-[13px] cursor-pointer"
                >
                    Sign in with a different account
                </button>
                <p className="text-muted text-[12px] mt-6 leading-relaxed">
                    No recovery codes either? Ask an organization admin to reset your two-factor from the Directory.
                </p>
            </form>
        </div>
    );
}

function RecoveryCodeForm({ onRecovered, onBack }) {
    const [recoveryCode, setRecoveryCode] = useState("");
    const [error, setError] = useState("");
    const [isChecking, setIsChecking] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!looksLikeRecoveryCode(recoveryCode)) {
            setError("A recovery code has 10 letters and numbers, like abcde-12345.");
            return;
        }
        setIsChecking(true);
        setError("");
        const { error: redeemError } = await redeemRecoveryCode(recoveryCode);
        setIsChecking(false);
        if (redeemError) {
            setError(redeemError);
            return;
        }
        onRecovered();
    };

    return (
        <div className="min-h-screen bg-panel flex items-center justify-center px-8">
            <form onSubmit={handleSubmit} className="w-full max-w-[380px] text-center">
                <span className="material-symbols-outlined text-accent-ink text-[48px] mb-4">key</span>
                <h1 className="text-[28px] font-bold text-white mb-2 tracking-tight">Use a recovery code</h1>
                <p className="text-muted text-[15px] mb-8 leading-relaxed">
                    Enter one of the codes you saved when you set up two-factor. It removes your lost authenticator,
                    so you can set up your new phone.
                </p>

                <label htmlFor="mfa-recovery-code" className="sr-only">Recovery code</label>
                <input
                    id="mfa-recovery-code"
                    type="text"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    autoFocus
                    maxLength={40}
                    placeholder="abcde-12345"
                    value={recoveryCode}
                    onChange={(e) => setRecoveryCode(e.target.value)}
                    className="w-full bg-field border border-line focus:border-accent-ink rounded-xl px-4 py-3.5 text-white text-center text-[20px] tracking-[0.15em] font-mono placeholder-line-strong focus:outline-none transition-colors"
                />

                {error && <p role="alert" className="text-red-400 text-[13px] mt-3">{error}</p>}

                <button
                    type="submit"
                    disabled={isChecking}
                    className="w-full mt-6 bg-accent hover:bg-accent-hover text-on-accent font-bold text-[15px] py-3.5 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
                >
                    {isChecking ? "Checking..." : "Use this code"}
                </button>
                <button
                    type="button"
                    onClick={onBack}
                    disabled={isChecking}
                    className="mt-4 text-muted hover:text-white text-[13px] cursor-pointer"
                >
                    Back to the authenticator code
                </button>
            </form>
        </div>
    );
}

// The authenticator is gone. Refreshing the session drops it from this tab
// too, which lets App.jsx move on, so that waits until they've read this.
function RecoveredNotice({ onContinue }) {
    const [isContinuing, setIsContinuing] = useState(false);

    const handleContinue = async () => {
        setIsContinuing(true);
        const { error } = await supabase.auth.refreshSession();
        if (error) console.error("Refreshing the session after recovery failed:", error);
        onContinue();
    };

    return (
        <div className="min-h-screen bg-panel flex items-center justify-center px-8">
            <div role="status" className="w-full max-w-[420px] text-center">
                <span className="material-symbols-outlined text-accent-ink text-[48px] mb-4">verified_user</span>
                <h1 className="text-[28px] font-bold text-white mb-2 tracking-tight">You're back in</h1>
                <p className="text-muted text-[15px] mb-3 leading-relaxed">
                    Your lost authenticator and your other recovery codes no longer work, and your other devices were signed out.
                    We've emailed you about it.
                </p>
                <p className="text-white text-[15px] mb-8 leading-relaxed">
                    Set up two-factor again with your new phone: Settings → Security &amp; Access.
                </p>
                <button
                    type="button"
                    onClick={handleContinue}
                    disabled={isContinuing}
                    className="w-full bg-accent hover:bg-accent-hover text-on-accent font-bold text-[15px] py-3.5 rounded-xl transition-all disabled:opacity-50 cursor-pointer"
                >
                    {isContinuing ? "Opening Spacer..." : "Continue"}
                </button>
            </div>
        </div>
    );
}
