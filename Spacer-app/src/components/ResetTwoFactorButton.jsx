import { useState } from "react"
import { ErrorNote } from "../general/GeneralParts"
import { resetMemberTwoFactor } from "../mfaRecoveryData"

// Directory: an Owner or Organization Admin removes a member's authenticator
// after they lose their phone. The server decides who may (only the Owner can
// do it for an organization admin) and says why not.
export default function ResetTwoFactorButton({ person }) {
    const [step, setStep] = useState("idle") // idle | confirming | resetting | done
    const [error, setError] = useState("")

    const confirm = async () => {
        setStep("resetting")
        setError("")
        const { error: resetError } = await resetMemberTwoFactor(person.id)
        if (resetError) {
            setError(resetError)
            setStep("confirming")
            return
        }
        setStep("done")
    }

    if (step === "done") {
        return (
            <p role="status" className="text-xs text-soft">
                Two-factor reset for {person.name}. They can sign in with their password and set it up again, and they've been emailed.
            </p>
        )
    }

    if (step === "idle") {
        return (
            <button
                type="button"
                onClick={() => setStep("confirming")}
                className="flex items-center gap-2 border border-line text-soft hover:bg-surface1 hover:text-white text-sm px-3 py-2 rounded-lg transition-colors cursor-pointer"
            >
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">phonelink_erase</span>
                Reset two-factor
            </button>
        )
    }

    return (
        <div className="space-y-2 rounded-lg border border-line p-3">
            <p className="text-xs text-soft">
                Only do this when <strong className="text-white">{person.name}</strong> has lost their phone and their recovery codes, and you're sure it's really them asking.
                Their authenticator and recovery codes stop working, their devices are signed out, and they can sign in with just their password until they set two-factor up again.
            </p>
            {error && <ErrorNote>{error}</ErrorNote>}
            <div className="flex gap-2">
                <button
                    type="button"
                    onClick={confirm}
                    disabled={step === "resetting"}
                    className="border border-red-500/40 text-red-400 hover:bg-red-500/10 text-sm px-3 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                >
                    {step === "resetting" ? "Resetting…" : "Reset two-factor"}
                </button>
                <button
                    type="button"
                    onClick={() => { setStep("idle"); setError("") }}
                    disabled={step === "resetting"}
                    className="text-muted hover:text-white text-sm px-3 py-2 cursor-pointer"
                >
                    Cancel
                </button>
            </div>
        </div>
    )
}
