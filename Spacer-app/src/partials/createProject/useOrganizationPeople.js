import { useEffect, useState } from "react"
import { supabase } from "../../supabase"

// Everyone's department memberships in the organization, with names and job
// titles, for the Create Project form's lead and member pickers.
// org_team_memberships() (security definer, the caller's organization only)
// also lists departments the creator has no rights in, so an invited
// department's people can be proposed. Loaded once per open form.
// Returns { memberships: [{ user_id, team_space_id, role }], usersById, isLoading, error }.
export default function useOrganizationPeople() {
    const [state, setState] = useState({ memberships: [], usersById: new Map(), isLoading: true, error: null })
    useEffect(() => {
        let active = true
        const load = async () => {
            const { data: rows, error } = await supabase.rpc("org_team_memberships")
            if (error) {
                console.error("Loading the organization's people failed:", error)
                if (active) setState({ memberships: [], usersById: new Map(), isLoading: false, error: "Couldn't load the departments' people." })
                return
            }
            const ids = [...new Set((rows || []).map((r) => r.user_id).filter(Boolean))]
            const { data: users, error: usersError } = ids.length
                ? await supabase.from("users").select("id, name, job_title").in("id", ids)
                : { data: [], error: null }
            if (usersError) console.error("Loading people's names failed:", usersError)
            if (!active) return
            setState({
                memberships: rows || [],
                usersById: new Map((users || []).map((u) => [u.id, u])),
                isLoading: false,
                error: usersError ? "Couldn't load people's names." : null,
            })
        }
        load()
        return () => { active = false }
    }, [])
    return state
}

// The shape departmentLeadOptions() reads: { team_space_id, role, users: { id, name } }
export function asLeadRows(memberships, usersById) {
    return memberships.map((m) => ({
        team_space_id: m.team_space_id,
        role: m.role,
        users: { id: m.user_id, name: usersById.get(m.user_id)?.name || "Unnamed" },
    }))
}
