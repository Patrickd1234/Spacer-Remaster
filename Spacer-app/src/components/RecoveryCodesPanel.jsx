import { useState } from "react";
import { formatRecoveryCode, recoveryCodesFileText } from "../mfaRecovery";

// Shows freshly created recovery codes once, with copy and download, and
// asks the person to confirm they've kept them before it goes away.
export default function RecoveryCodesPanel({ codes, onDone }) {
    const [hasSaved, setHasSaved] = useState(false);
    const [copyState, setCopyState] = useState("idle"); // idle | copied | failed

    const fileText = () => recoveryCodesFileText(codes, new Date());

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(fileText());
            setCopyState("copied");
        } catch (err) {
            console.error("Copying recovery codes failed:", err);
            setCopyState("failed");
        }
    };

    const download = () => {
        const url = URL.createObjectURL(new Blob([fileText()], { type: "text/plain" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "spacer-recovery-codes.txt";
        link.click();
        // Some browsers start the download after click() returns
        setTimeout(() => URL.revokeObjectURL(url), 0);
    };

    return (
        <section aria-labelledby="recovery-codes-title" className="space-y-md border-t border-line pt-md">
            <div>
                <p id="recovery-codes-title" className="text-sm font-semibold text-white">Save your recovery codes</p>
                <p className="text-xs text-muted mt-0.5">
                    If you lose your phone, each code gets you in once. Keep them somewhere safe, like a password manager.
                    You won't see them again.
                </p>
            </div>

            <ul className="grid grid-cols-2 gap-x-md gap-y-1 bg-field border border-line rounded-xl p-md font-mono text-sm text-white select-all">
                {codes.map((code) => <li key={code}>{formatRecoveryCode(code)}</li>)}
            </ul>

            <div className="flex flex-wrap items-center gap-sm">
                <button type="button" onClick={download} className="px-md py-2 bg-field border border-line text-white hover:bg-raised text-xs font-semibold rounded-xl">
                    Download
                </button>
                <button type="button" onClick={copy} className="px-md py-2 bg-field border border-line text-white hover:bg-raised text-xs font-semibold rounded-xl">
                    {copyState === "copied" ? "Copied" : "Copy"}
                </button>
                {copyState === "failed" && <span role="alert" className="text-xs text-error">Couldn't copy. Use Download instead.</span>}
            </div>

            <label className="flex items-center gap-2 text-xs text-muted cursor-pointer select-none">
                <input
                    type="checkbox"
                    checked={hasSaved}
                    onChange={(e) => setHasSaved(e.target.checked)}
                    className="rounded border-line bg-field text-accent-ink focus:ring-accent-ink"
                />
                I've saved these codes
            </label>

            <button
                type="button"
                onClick={onDone}
                disabled={!hasSaved}
                className="px-md py-2 bg-primary-container text-on-accent font-semibold rounded-xl disabled:opacity-50"
            >
                Done
            </button>
        </section>
    );
}
