import { useEffect, useRef, useState } from "react"
import { Avatar, SecondaryButton, ErrorNote } from "../general/GeneralParts"
import { validateImage } from "../general/generalData"

const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp,image/gif"

// The photo (or initials) with "Choose photo" and, when onRemove is given,
// "Remove". onPick(file) receives a file that passed validateImage and may
// return an error message to show. Used by the Directory's edit form (keeps
// the file until Save) and the Profile page (uploads at once).
// isBusy: a save is running ("Saving…"); isDisabled: not ready yet
export default function PhotoField({ name, url, onPick, onRemove = null, isBusy = false, isDisabled = false, onImageError = undefined }) {
    const inputRef = useRef(null)
    const [previewUrl, setPreviewUrl] = useState(null)
    const [error, setError] = useState("")

    // Free the local preview when it is replaced or the field goes away
    useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

    const handleChange = async (e) => {
        const file = e.target.files?.[0]
        // Cleared so picking the same file again still fires a change
        e.target.value = ""
        if (!file) return
        const invalid = validateImage(file)
        setError(invalid || "")
        if (invalid) return
        setPreviewUrl(URL.createObjectURL(file))
        const failure = await onPick(file)
        if (failure) {
            setError(failure)
            setPreviewUrl(null)
        }
    }

    const handleRemove = async () => {
        setError("")
        const failure = await onRemove()
        if (failure) setError(failure)
        else setPreviewUrl(null)
    }

    const shownUrl = previewUrl ?? url
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-4">
                <Avatar name={name} url={shownUrl} size="lg" onError={previewUrl ? undefined : onImageError} />
                <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <SecondaryButton icon="photo_camera" onClick={() => inputRef.current?.click()} disabled={isBusy || isDisabled}>
                            {isBusy ? "Saving…" : shownUrl ? "Change photo" : "Choose photo"}
                        </SecondaryButton>
                        {onRemove && shownUrl && (
                            <SecondaryButton icon="delete" onClick={handleRemove} disabled={isBusy || isDisabled}>Remove</SecondaryButton>
                        )}
                    </div>
                    <p className="text-[11px] text-muted">JPG, PNG, WebP or GIF, up to 5 MB.</p>
                </div>
                <input ref={inputRef} type="file" accept={ACCEPTED_TYPES} onChange={handleChange} className="hidden" aria-label="Choose a photo" />
            </div>
            {error && <ErrorNote>{error}</ErrorNote>}
        </div>
    )
}
