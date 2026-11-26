import { useEffect, useState } from "react"
import { supabase } from "./supabase"
import { fetchOrganizationDepartments } from "./crossDepartmentData"
import { buildHoldups } from "./holdups"

// Reads for hold-ups across projects (holdups.js). Row-level security limits
// both queries to tasks in projects the person can see. Shared by the sidebar
// and Home through a short cache, so moving between pages doesn't refetch.

const TASK_FIELDS = "id, title, status, due_date, team_space_id, project_id, assignee_id, project:project_spaces(id, name, team_space_id)"
const MAX_DEPENDENCIES = 500
const CACHE_MS = 60 * 1000
const LOAD_ERROR = "Couldn't load what's holding projects up."

let cache = null // { at, promise }

async function loadHoldups() {
    // Open waits only (resolved_at is set once the task waited on is done)
    const [dependencies, departments] = await Promise.all([
        supabase
            .from("task_dependencies")
            .select(`task_id, blocker_task_id, created_at, task:tasks!task_dependencies_task_id_fkey(${TASK_FIELDS}), blocker:tasks!task_dependencies_blocker_task_id_fkey(${TASK_FIELDS})`)
            .is("resolved_at", null)
            .limit(MAX_DEPENDENCIES),
        fetchOrganizationDepartments(),
    ])
    if (dependencies.error) console.error("Loading task dependencies failed:", dependencies.error)
    return {
        rows: dependencies.error ? [] : buildHoldups(dependencies.data || []),
        names: new Map(departments.data.map((d) => [String(d.id), d.name])),
        error: dependencies.error ? LOAD_ERROR : null,
    }
}

// Forget the cached hold-ups (a block or a task changed), so the next page loads fresh ones
export function invalidateHoldups() {
    cache = null
}

/** Hold-ups, cached for a minute. `isFresh` skips the cache (a manual refresh). */
export function fetchHoldups({ isFresh = false } = {}) {
    if (isFresh || !cache || Date.now() - cache.at > CACHE_MS) {
        cache = { at: Date.now(), promise: loadHoldups() }
    }
    return cache.promise
}

/**
 * { rows, nameOf, error, isLoaded } for the hold-ups the person can see.
 * nameOf(departmentId) gives a department's name.
 */
export function useHoldups() {
    const [state, setState] = useState({ rows: [], names: new Map(), error: null, isLoaded: false })
    useEffect(() => {
        let active = true
        fetchHoldups().then((result) => { if (active) setState({ ...result, isLoaded: true }) })
        return () => { active = false }
    }, [])
    return { ...state, nameOf: (id) => state.names.get(String(id)) || "A department" }
}
