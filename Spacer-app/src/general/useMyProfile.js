import { useCallback, useEffect, useState } from "react"
import { useRole } from "../RoleContext"
import { supabase } from "../supabase"
import { fetchMyProfile } from "./generalData"

// The signed-in user's profile, and whether they may post announcements and
// events. The database decides for real (is_org_admin: an org-level admin or a
// super admin); asking it here keeps the buttons in step with that rule. While
// a super admin previews another role, the preview wins.
export function useMyProfile() {
    const { isSuperAdmin, simulatedRole } = useRole()
    const [profile, setProfile] = useState(null)
    const [error, setError] = useState(null)
    const [isOrgAdmin, setIsOrgAdmin] = useState(false)

    const reload = useCallback(async () => {
        const { data, error: loadError } = await fetchMyProfile()
        setProfile(data)
        setError(loadError)
    }, [])

    useEffect(() => {
        let active = true
        Promise.all([fetchMyProfile(), supabase.rpc("is_org_admin")]).then(([mine, admin]) => {
            if (!active) return
            setProfile(mine.data)
            setError(mine.error)
            if (admin.error) console.error("Checking organization admin failed:", admin.error)
            setIsOrgAdmin(admin.data === true)
        })
        return () => { active = false }
    }, [])

    const canManage = simulatedRole ? isSuperAdmin : isSuperAdmin || isOrgAdmin
    return { profile, error, reload, canManage }
}
