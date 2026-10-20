import { useState, useEffect, useCallback } from "react";
import { supabase } from "../supabase";
import { clearTrustedDevice, TRUSTED_DEVICE_DAYS } from "../trustedDevice";

const CODE_LENGTH = 6;

// Two-factor authentication with Supabase Auth MFA (authenticator app / TOTP).
//   Enable:  enroll -> scan QR -> enter a code to verify the factor
//   Disable: enter a current code (re-verifies), then unenroll
// Once enabled, sign-in asks for a code (App.jsx) and the database refuses
// data to sessions that skipped it (mfa_required policies).
export default function TwoFactorSettings({ onNotify }) {
    const [factor, setFactor] = useState(null);       // verified TOTP factor, if any
    const [loading, setLoading] = useState(true);
    const [mode, setMode] = useState("idle");         // idle | enrolling | disabling
    const [enrollment, setEnrollment] = useState(null); // { id, qrCode, secret }
    const [code, setCode] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const applyFactors = useCallback(({ data, error: listError }) => {
        if (listError) console.error("Error loading two-factor status:", listError);
        setFactor(data?.totp?.find(f => f.status === "verified") || null);
        setLoading(false);
    }, []);

    const loadFactor = useCallback(
        () => supabase.auth.mfa.listFactors().then(applyFactors),
        [applyFactors]
    );

    useEffect(() => {
        let active = true;
        supabase.auth.mfa.listFactors().then(result => {
            if (active) applyFactors(result);
        });
        return () => { active = false; };
    }, [applyFactors]);

    const reset = () => {
        setMode("idle");
        setEnrollment(null);
        setCode("");
        setError("");
        setBusy(false);
    };

    const startEnrollment = async () => {
        setBusy(true);
        setError("");

        // Clear half-finished setups from earlier attempts
        const { data: existing } = await supabase.auth.mfa.listFactors();
        for (const f of existing?.all || []) {
            if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
        }

        const { data, error: enrollError } = await supabase.auth.mfa.enroll({
            factorType: "totp",
            friendlyName: `Authenticator app ${new Date().toISOString().slice(0, 10)}`,
        });
        setBusy(false);
        if (enrollError) {
            setError(enrollError.message);
            return;
        }
        setEnrollment({ id: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
        setMode("enrolling");
    };

    const cancelEnrollment = async () => {
        if (enrollment?.id) await supabase.auth.mfa.unenroll({ factorId: enrollment?.id });
        reset();
    };

    const verifyCode = async (factorId) => {
        if (code.length !== CODE_LENGTH) {
            setError(`Enter the ${CODE_LENGTH}-digit code from your authenticator app.`);
            return false;
        }
        setBusy(true);
        setError("");
        const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
        if (verifyError) {
            setBusy(false);
            setError("That code didn't work. Make sure your phone's clock is correct and try again.");
            setCode("");
            return false;
        }
        return true;
    };

    // Optional chaining on factor/enrollment below is required: the React
    // Compiler reads these values during render to memoize the handlers, and
    // they're null until 2FA is set up (plain `.id` crashed the Settings page).
    const confirmEnrollment = async (e) => {
        e.preventDefault();
        if (!enrollment?.id) return;
        if (!(await verifyCode(enrollment?.id))) return;
        reset();
        await loadFactor();
        onNotify?.("Two-factor authentication is on. You'll be asked for a code when you sign in.", "success");
    };

    const confirmDisable = async (e) => {
        e.preventDefault();
        const factorId = factor?.id;
        if (!factorId) return;
        if (!(await verifyCode(factorId))) return;
        const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId });
        if (unenrollError) {
            setBusy(false);
            setError(unenrollError.message);
            return;
        }
        // Remembered devices are meaningless without two-factor
        await supabase.rpc("forget_trusted_devices");
        clearTrustedDevice();
        // Drop the now-meaningless second-factor level from this session
        await supabase.auth.refreshSession();
        reset();
        await loadFactor();
        onNotify?.("Two-factor authentication has been turned off.", "info");
    };

    // Every device must enter a code again at its next sign-in
    const forgetDevices = async () => {
        setBusy(true);
        const { error: forgetError } = await supabase.rpc("forget_trusted_devices");
        setBusy(false);
        if (forgetError) {
            setError("Couldn't forget remembered devices. Please try again.");
            return;
        }
        clearTrustedDevice();
        onNotify?.("Remembered devices forgotten. Each will ask for a code at its next sign-in.", "info");
    };

    const codeInput = (
        <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={CODE_LENGTH}
            placeholder="123456"
            aria-label="Authentication code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className="w-40 bg-surface-container-highest border border-outline-variant rounded-xl px-md py-2 text-on-surface text-center tracking-[0.3em] font-body-md focus:ring-2 focus:ring-primary-fixed focus:outline-none"
        />
    );

    return (
        <div className="p-md rounded-xl bg-surface-container-low border border-outline-variant space-y-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <p className="font-body-md font-semibold text-on-surface">Two-Factor Authentication (2FA)</p>
                        {!loading && (
                            <span className={`text-xs px-2 py-0.5 rounded font-semibold ${factor ? "bg-primary-container/30 text-primary-fixed" : "bg-surface-container-highest text-on-surface-variant"}`}>
                                {factor ? "ENABLED" : "DISABLED"}
                            </span>
                        )}
                    </div>
                    <p className="text-body-sm text-on-surface-variant mt-0.5">
                        Ask for a code from an authenticator app (Google Authenticator, 1Password, Authy…) when you sign in.
                    </p>
                </div>
                {mode === "idle" && !loading && (
                    <button
                        type="button"
                        onClick={factor ? () => { setMode("disabling"); setError(""); } : startEnrollment}
                        disabled={busy}
                        className="px-md py-2 bg-surface-container-highest border border-outline-variant text-on-surface hover:bg-surface-variant font-body-sm font-semibold rounded-xl transition-colors shrink-0 disabled:opacity-50"
                    >
                        {busy ? "Starting..." : factor ? "Turn off 2FA" : "Enable 2FA"}
                    </button>
                )}
            </div>

            {mode === "enrolling" && enrollment && (
                <form onSubmit={confirmEnrollment} className="space-y-md border-t border-outline-variant pt-md">
                    <p className="text-body-sm text-on-surface">1. Scan this QR code with your authenticator app.</p>
                    <div className="flex flex-col sm:flex-row gap-md items-start">
                        {/* qr_code is an SVG data URL generated by Supabase Auth */}
                        <img src={enrollment.qrCode} alt="QR code for your authenticator app" className="w-40 h-40 bg-white rounded-lg p-2" />
                        <div className="text-body-sm text-on-surface-variant">
                            <p>Can't scan it? Enter this key instead:</p>
                            <code className="block mt-1 font-mono text-on-surface break-all select-all">{enrollment.secret}</code>
                        </div>
                    </div>
                    <p className="text-body-sm text-on-surface">2. Enter the {CODE_LENGTH}-digit code it shows.</p>
                    <div className="flex flex-wrap items-center gap-sm">
                        {codeInput}
                        <button type="submit" disabled={busy} className="px-md py-2 bg-primary-container text-on-primary-container font-semibold rounded-xl disabled:opacity-50">
                            {busy ? "Verifying..." : "Verify & enable"}
                        </button>
                        <button type="button" onClick={cancelEnrollment} disabled={busy} className="px-md py-2 text-on-surface-variant hover:text-on-surface font-body-sm">
                            Cancel
                        </button>
                    </div>
                </form>
            )}

            {mode === "disabling" && factor && (
                <form onSubmit={confirmDisable} className="space-y-md border-t border-outline-variant pt-md">
                    <p className="text-body-sm text-on-surface">Enter a current code from your authenticator app to turn two-factor off.</p>
                    <div className="flex flex-wrap items-center gap-sm">
                        {codeInput}
                        <button type="submit" disabled={busy} className="px-md py-2 border border-error/40 text-error hover:bg-error/5 font-semibold rounded-xl disabled:opacity-50">
                            {busy ? "Turning off..." : "Turn off 2FA"}
                        </button>
                        <button type="button" onClick={reset} disabled={busy} className="px-md py-2 text-on-surface-variant hover:text-on-surface font-body-sm">
                            Cancel
                        </button>
                    </div>
                </form>
            )}

            {factor && mode === "idle" && (
                <p className="text-xs text-on-surface-variant">
                    Devices where you tick "Remember this device" skip the code for {TRUSTED_DEVICE_DAYS} days.{" "}
                    <button type="button" onClick={forgetDevices} disabled={busy} className="underline hover:text-on-surface disabled:opacity-50">
                        Forget remembered devices
                    </button>
                </p>
            )}

            {error && <p role="alert" className="text-xs text-error font-medium">{error}</p>}
        </div>
    );
}
