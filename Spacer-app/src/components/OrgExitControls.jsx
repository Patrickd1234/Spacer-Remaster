import { useState } from "react"
import OrgExitDialog from "./OrgExitDialog"
import { ErrorNote } from "../general/GeneralParts"
import { fetchMyOrganizationName, leaveOrganization, removeFromOrganization } from "../orgExit"

const DANGER_BUTTON = "flex items-center gap-2 border border-red-500/40 text-red-400 hover:bg-red-500/10 text-sm px-3 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50"

// Opens the dialog once the organization's name (typed to confirm) has loaded
function useExitDialog() {
    const [organizationName, setOrganizationName] = useState(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState("")

    const open = async () => {
        setIsLoading(true)
        setError("")
        const result = await fetchMyOrganizationName()
        setIsLoading(false)
        if (result.error) setError(result.error)
        else setOrganizationName(result.data)
    }
    const close = () => setOrganizationName(null)
    return { organizationName, isLoading, error, open, close }
}

// Settings: the signed-in user leaves their organization for good
export function LeaveOrganizationButton() {
    const dialog = useExitDialog()

    const confirm = async () => {
        const { error } = await leaveOrganization()
        if (error) return error
        // A full load drops everything this tab cached about the organization
        window.location.assign("/welcome")
        return null
    }

    return (
        <>
            <button type="button" className={DANGER_BUTTON} onClick={dialog.open} disabled={dialog.isLoading}>
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">logout</span>
                Leave organization
            </button>
            {dialog.error && <ErrorNote>{dialog.error}</ErrorNote>}
            {dialog.organizationName && (
                <OrgExitDialog
                    title="Leave this organization?"
                    organizationName={dialog.organizationName}
                    confirmLabel="Leave organization"
                    busyLabel="Leaving…"
                    onConfirm={confirm}
                    onClose={dialog.close}
                >
                    <p>You will lose access to every department, project, task and chat in <strong className="text-white">{dialog.organizationName}</strong> straight away.</p>
                    <p>Your unfinished tasks become unassigned. What you created stays with the organization. Your sign-in stays yours: afterwards you can launch a new organization or accept an invite to one.</p>
                    <p>This can&apos;t be undone. To come back, an admin has to invite you again.</p>
                </OrgExitDialog>
            )}
        </>
    )
}

// Directory: an organization admin removes someone for good
export function RemoveFromOrganizationButton({ person, onRemoved }) {
    const dialog = useExitDialog()

    const confirm = async () => {
        const { error } = await removeFromOrganization(person.id)
        if (error) return error
        dialog.close()
        onRemoved()
        return null
    }

    return (
        <>
            <button type="button" className={DANGER_BUTTON} onClick={dialog.open} disabled={dialog.isLoading}>
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">person_remove</span>
                Remove from organization
            </button>
            {dialog.error && <ErrorNote>{dialog.error}</ErrorNote>}
            {dialog.organizationName && (
                <OrgExitDialog
                    title={`Remove ${person.name}?`}
                    organizationName={dialog.organizationName}
                    confirmLabel="Remove for good"
                    busyLabel="Removing…"
                    onConfirm={confirm}
                    onClose={dialog.close}
                >
                    <p><strong className="text-white">{person.name}</strong> will lose access to every department, project, task and chat in {dialog.organizationName} straight away.</p>
                    <p>Their unfinished tasks become unassigned. What they created stays. Their sign-in still works, but only to start or join another organization.</p>
                    <p>This can&apos;t be undone. To bring them back, invite them again.</p>
                </OrgExitDialog>
            )}
        </>
    )
}
