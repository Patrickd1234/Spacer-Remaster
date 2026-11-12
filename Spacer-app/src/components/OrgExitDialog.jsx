import { useState } from "react"
import { Modal, Field, INPUT_CLASS, ErrorNote } from "../general/GeneralParts"
import { confirmationMatches } from "../orgExitRules"

// Confirmation for leaving an organization or removing someone from it. The
// red button stays off until the organization's name is typed. onConfirm
// returns an error message, or null once it's done (the parent then closes it).
export default function OrgExitDialog({ title, organizationName, confirmLabel, busyLabel, onConfirm, onClose, children }) {
    const [typed, setTyped] = useState("")
    const [isBusy, setIsBusy] = useState(false)
    const [error, setError] = useState("")
    const canConfirm = confirmationMatches(typed, organizationName) && !isBusy

    const submit = async (event) => {
        event.preventDefault()
        if (!canConfirm) return
        setIsBusy(true)
        setError("")
        const message = await onConfirm()
        if (message) {
            setError(message)
            setIsBusy(false)
        }
    }

    return (
        <Modal title={title} onClose={isBusy ? () => {} : onClose}>
            <form onSubmit={submit} className="space-y-4">
                <div className="text-sm text-soft space-y-2">{children}</div>
                <Field label={`Type "${organizationName || "the organization's name"}" to confirm`}>
                    <input
                        type="text"
                        autoComplete="off"
                        className={INPUT_CLASS}
                        value={typed}
                        onChange={(e) => setTyped(e.target.value)}
                        disabled={isBusy}
                    />
                </Field>
                {error && <ErrorNote>{error}</ErrorNote>}
                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isBusy}
                        className="border border-line hover:border-line-strong text-white text-sm px-3 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={!canConfirm}
                        className="bg-red-500 hover:bg-red-600 text-[#ffffff] text-sm font-semibold px-3 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default"
                    >
                        {isBusy ? busyLabel : confirmLabel}
                    </button>
                </div>
            </form>
        </Modal>
    )
}
