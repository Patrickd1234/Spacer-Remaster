import { useCallback, useEffect, useState } from "react"
import { useRole } from "../RoleContext"
import { fetchMyProfile } from "./generalData"

// The signed-in user's profile, and whether they may post announcements and
// events. The database decides for real (is_org_admin); this only hides
// buttons that would fail.
export function useMyProfile() {
    const { isSuperAdmin } = useRole()
    const [profile, setProfile] = useState(null)
    const [error, setError] = useState(null)

    const reload = useCallback(async () => {
        const { data, error: loadError } = await fetchMyProfile()
        setProfile(data)
        setError(loadError)
    }, [])

    useEffect(() => {
        let active = true
        fetchMyProfile().then(({ data, error: loadError }) => {
            if (!active) return
            setProfile(data)
            setError(loadError)
        })
        return () => { active = false }
    }, [])

    return { profile, error, reload, canManage: isSuperAdmin }
}
