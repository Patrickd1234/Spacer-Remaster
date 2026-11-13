import { useCallback, useEffect, useState } from "react"
import { fetchMyProfile } from "./generalData"

// The signed-in user's profile. What they may do comes from useRole().can(...).
export function useMyProfile() {
    const [profile, setProfile] = useState(null)
    const [error, setError] = useState(null)

    const reload = useCallback(async () => {
        const { data, error: loadError } = await fetchMyProfile()
        setProfile(data)
        setError(loadError)
    }, [])

    useEffect(() => {
        let active = true
        fetchMyProfile().then((mine) => {
            if (!active) return
            setProfile(mine.data)
            setError(mine.error)
        })
        return () => { active = false }
    }, [])

    return { profile, error, reload }
}
