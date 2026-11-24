import { usePersonPhoto, handlePhotoError } from "./peoplePhotos"

// Someone's photo filling its parent (give the parent overflow-hidden and a
// size), or `fallback` (usually their initial) when they have none.
export default function PersonPhoto({ userId, fallback }) {
    const url = usePersonPhoto(userId)
    if (!url) return fallback
    return <img src={url} alt="" onError={handlePhotoError} className="w-full h-full object-cover" />
}
